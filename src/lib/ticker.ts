import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SEASON } from "@/lib/env";
import { resolveCurrentWeek } from "@/lib/league";

/**
 * The scoreboard strip on the front page.
 *
 * Everything here reads the games table, which is the app's own copy of the
 * ESPN scoreboard — the cron writes it every few minutes and RLS makes it
 * readable by anon. Calling ESPN from the browser instead would be a second
 * copy of a feed we already keep, on a rate limit shared with every visitor.
 */

export type TickerGame = {
  id: number;
  startTime: string;
  homeTeam: string;
  homeAbbr: string;
  homeLogo: string | null;
  homeScore: number | null;
  homeRank: number | null;
  awayTeam: string;
  awayAbbr: string;
  awayLogo: string | null;
  awayScore: number | null;
  awayRank: number | null;
  period: number | null;
  clock: string | null;
  /** True for a game that went final within the last hour. */
  justFinished: boolean;
};

export type TickerState =
  | { kind: "live"; week: number; games: TickerGame[] }
  /**
   * Static, and it names the game it is counting to. `resumed` is true when
   * that week already has games behind it, which changes what the bar can
   * honestly call the wait.
   */
  | {
      kind: "countdown";
      week: number;
      kickoff: string;
      game: TickerGame | null;
      resumed: boolean;
    }
  | { kind: "recap"; week: number; games: TickerGame[]; total: number }
  | { kind: "pending"; week: number }
  | { kind: "idle" };

const JUST_FINISHED_MS = 60 * 60 * 1000;

/**
 * How interesting a matchup is, as one number: the better of the two ranks.
 *
 * A ranked team beats no ranked team, and the higher of two ranked teams
 * decides — so #3 vs unranked sorts ahead of #12 vs #14. Unranked pairs share
 * the same worst score and fall to the back, in kickoff order.
 */
export function matchupRank(game: { homeRank: number | null; awayRank: number | null }): number {
  const ranks = [game.homeRank, game.awayRank].filter(
    (r): r is number => typeof r === "number" && r > 0,
  );
  return ranks.length > 0 ? Math.min(...ranks) : 99;
}

export function byMatchupRank(a: TickerGame, b: TickerGame): number {
  const diff = matchupRank(a) - matchupRank(b);
  if (diff !== 0) return diff;
  return a.startTime.localeCompare(b.startTime);
}

type Row = {
  id: number;
  week: number;
  start_time: string;
  status: string;
  completed: boolean;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  home_rank: number | null;
  away_rank: number | null;
  period: number | null;
  clock: string | null;
  updated_at: string;
};

/**
 * Which of the four things the bar has to say, decided by the games themselves.
 *
 * The week comes from resolveCurrentWeek, the same definition the league boards
 * use, so the bar and the app never disagree about what week it is.
 */
export async function loadTicker(season = DEFAULT_SEASON): Promise<TickerState> {
  const supabase = await createClient();
  const week = await resolveCurrentWeek(season);
  const now = Date.now();

  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("season", season)
    .eq("season_type", 2)
    .eq("week", week)
    .neq("status", "canceled")
    .order("start_time", { ascending: true });

  const rows: Row[] = data ?? [];
  if (rows.length === 0) return { kind: "pending", week };

  // Names are stitched in JS rather than embedded, because games points at
  // teams twice and PostgREST needs the constraint spelled out to tell which
  // is which — the same reason loadWeekBoard does it this way.
  const names = await teamNames(rows);
  const build = (row: Row) => toGame(row, names, now);

  // 1. Anything on right now wins the bar, plus whatever finished in the last
  //    hour — a score that landed ten minutes ago is still news.
  const live = rows.filter((r) => r.status === "in_progress");
  if (live.length > 0) {
    const recent = rows.filter(
      (r) => r.completed && now - new Date(r.updated_at).getTime() < JUST_FINISHED_MS,
    );
    return { kind: "live", week, games: [...live, ...recent].map(build).sort(byMatchupRank) };
  }

  // 2. Nothing on, but something still to come — this week or the next one.
  //    The countdown names its own target, so the two have to be the same game.
  const nowIso = new Date(now).toISOString();
  const upcoming = await firstFbsKickoff(season, nowIso);
  if (upcoming) {
    return {
      kind: "countdown",
      week: upcoming.week,
      kickoff: upcoming.game.startTime,
      game: upcoming.game,
      resumed: await weekUnderway(season, upcoming.week, nowIso),
    };
  }

  // 3. Nothing left to come. The week's finals hold the bar.

  const finals = rows.filter((r) => r.completed);
  if (finals.length > 0) {
    return { kind: "recap", week, games: finals.map(build).sort(byMatchupRank), total: finals.length };
  }

  return { kind: "idle" };
}

/**
 * Whether the week being counted into is one the season has already played in.
 *
 * A week is a Thursday game, a Friday game and two waves on Saturday, so nearly
 * every gap the bar counts through sits inside a week that is already running.
 * The question is only about kickoffs that have passed, not about results: a
 * game in its first quarter has started the week just as much as a final has,
 * and this is asked while nothing is live anyway.
 */
async function weekUnderway(season: number, week: number, nowIso: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("season", season)
    .eq("season_type", 2)
    .eq("week", week)
    .neq("status", "canceled")
    .lte("start_time", nowIso);
  return (count ?? 0) > 0;
}

/**
 * The next kickoff worth counting down to, which is not always the next
 * kickoff.
 *
 * A week usually opens with an FBS side hosting an FCS one, and naming that as
 * the game the season is waiting on undersells the week — so the search skips
 * to the first game with FBS on both sides. The countdown then counts to the
 * game it names, rather than to one time while showing another.
 */
async function firstFbsKickoff(
  season: number,
  afterIso: string,
): Promise<{ week: number; game: TickerGame } | null> {
  const supabase = await createClient();

  // A window rather than the single next row, because the first few are
  // typically the FCS matchups this is looking past.
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("season", season)
    .eq("season_type", 2)
    .neq("status", "canceled")
    .gt("start_time", afterIso)
    .order("start_time", { ascending: true })
    .limit(60);

  const rows: Row[] = data ?? [];
  if (rows.length === 0) return null;

  const teams = await teamNames(rows);
  const isFbs = (id: number) => teams.get(id)?.isFbs === true;
  const row = rows.find((r) => isFbs(r.home_team_id) && isFbs(r.away_team_id)) ?? rows[0];

  return { week: row.week, game: toGame(row, teams, Date.now()) };
}

function toGame(row: Row, teams: TeamMap, now: number): TickerGame {
  return {
    id: row.id,
    startTime: row.start_time,
    homeTeam: teams.get(row.home_team_id)?.school ?? "TBD",
    homeAbbr: teams.get(row.home_team_id)?.abbr ?? "TBD",
    homeLogo: teams.get(row.home_team_id)?.logo ?? null,
    homeScore: row.home_score,
    homeRank: row.home_rank,
    awayTeam: teams.get(row.away_team_id)?.school ?? "TBD",
    awayAbbr: teams.get(row.away_team_id)?.abbr ?? "TBD",
    awayLogo: teams.get(row.away_team_id)?.logo ?? null,
    awayScore: row.away_score,
    awayRank: row.away_rank,
    period: row.period,
    clock: row.clock,
    justFinished: row.completed && now - new Date(row.updated_at).getTime() < JUST_FINISHED_MS,
  };
}

type TeamMap = Map<
  number,
  { school: string; abbr: string; logo: string | null; isFbs: boolean }
>;

/**
 * Both spellings of every name, because the bar is one line and a phone has
 * about a third of the room a laptop does — "Ohio State" there, "OSU" here.
 */
async function teamNames(rows: Row[]): Promise<TeamMap> {
  const supabase = await createClient();
  const ids = [...new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id]))];
  const { data } = await supabase
    .from("teams")
    .select("id, school, abbreviation, logo, is_fbs")
    .in("id", ids);
  return new Map(
    (data ?? []).map((t) => [
      t.id,
      { school: t.school, abbr: t.abbreviation ?? t.school, logo: t.logo, isFbs: t.is_fbs },
    ]),
  );
}

/** The one number the hero shows, and the season it counts. */
export async function loadPickCount(season = DEFAULT_SEASON): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_picks_count", { p_season: season });
  return typeof data === "number" ? data : 0;
}
