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
  homeScore: number | null;
  homeRank: number | null;
  awayTeam: string;
  awayAbbr: string;
  awayScore: number | null;
  awayRank: number | null;
  period: number | null;
  clock: string | null;
  /** True for a game that went final within the last hour. */
  justFinished: boolean;
};

export type TickerState =
  | { kind: "live"; week: number; games: TickerGame[] }
  | { kind: "countdown"; week: number; kickoff: string }
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
  const build = (row: Row): TickerGame => ({
    id: row.id,
    startTime: row.start_time,
    homeTeam: names.get(row.home_team_id)?.school ?? "TBD",
    homeAbbr: names.get(row.home_team_id)?.abbr ?? "TBD",
    homeScore: row.home_score,
    homeRank: row.home_rank,
    awayTeam: names.get(row.away_team_id)?.school ?? "TBD",
    awayAbbr: names.get(row.away_team_id)?.abbr ?? "TBD",
    awayScore: row.away_score,
    awayRank: row.away_rank,
    period: row.period,
    clock: row.clock,
    justFinished: row.completed && now - new Date(row.updated_at).getTime() < JUST_FINISHED_MS,
  });

  // 1. Anything on right now wins the bar, plus whatever finished in the last
  //    hour — a score that landed ten minutes ago is still news.
  const live = rows.filter((r) => r.status === "in_progress");
  if (live.length > 0) {
    const recent = rows.filter(
      (r) => r.completed && now - new Date(r.updated_at).getTime() < JUST_FINISHED_MS,
    );
    return { kind: "live", week, games: [...live, ...recent].map(build).sort(byMatchupRank) };
  }

  // 2. Nothing on, but something still to come this week: count down to it.
  const next = rows.find((r) => new Date(r.start_time).getTime() > now);
  if (next) return { kind: "countdown", week, kickoff: next.start_time };

  // 3. The week is done. Once the next slate is set its countdown is the more
  //    useful thing to say, so the finals only hold the bar until then.
  const { data: upcoming } = await supabase
    .from("games")
    .select("week, start_time")
    .eq("season", season)
    .eq("season_type", 2)
    .gt("start_time", new Date(now).toISOString())
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcoming) return { kind: "countdown", week: upcoming.week, kickoff: upcoming.start_time };

  const finals = rows.filter((r) => r.completed);
  if (finals.length > 0) {
    return { kind: "recap", week, games: finals.map(build).sort(byMatchupRank), total: finals.length };
  }

  return { kind: "idle" };
}

/**
 * Both spellings of every name, because the bar is one line and a phone has
 * about a third of the room a laptop does — "Ohio State" there, "OSU" here.
 */
async function teamNames(rows: Row[]): Promise<Map<number, { school: string; abbr: string }>> {
  const supabase = await createClient();
  const ids = [...new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id]))];
  const { data } = await supabase.from("teams").select("id, school, abbreviation").in("id", ids);
  return new Map(
    (data ?? []).map((t) => [t.id, { school: t.school, abbr: t.abbreviation ?? t.school }]),
  );
}

/** The one number the hero shows, and the season it counts. */
export async function loadPickCount(season = DEFAULT_SEASON): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_picks_count", { p_season: season });
  return typeof data === "number" ? data : 0;
}
