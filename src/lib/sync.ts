import { createAdminClient } from "@/lib/supabase/admin";
import {
  FBS_CONFERENCES,
  fetchCurrentWeek,
  fetchRankings,
  fetchTeamsForWeeks,
  fetchWeekGames,
  type NormalizedTeam,
} from "@/lib/espn";

type Supabase = ReturnType<typeof createAdminClient>;

export function syncSecretMatches(request: Request): boolean {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return false;

  const header = request.headers.get("x-sync-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = new URL(request.url).searchParams.get("secret");

  return [header, bearer, query].some((value) => value === expected);
}

export async function syncConferences(db: Supabase) {
  const { error } = await db.from("conferences").upsert(
    FBS_CONFERENCES.map((c) => ({
      id: c.id,
      name: c.name,
      short_name: c.shortName,
    })),
  );
  if (error) throw new Error(`conferences: ${error.message}`);
  return FBS_CONFERENCES.length;
}

/** Walks a season's scoreboards to build the team table. */
export async function syncTeams(db: Supabase, season: number, weeks?: number[]) {
  const range = weeks ?? Array.from({ length: 15 }, (_, i) => i + 1);
  const teams = await fetchTeamsForWeeks(season, range);
  if (teams.length === 0) return 0;

  return upsertTeams(db, teams);
}

async function upsertTeams(db: Supabase, teams: NormalizedTeam[]) {
  if (teams.length === 0) return 0;

  const { error } = await db.from("teams").upsert(
    teams.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
  );
  if (error) throw new Error(`teams: ${error.message}`);
  return teams.length;
}

export async function syncWeek(db: Supabase, season: number, week: number) {
  const { games, teams } = await fetchWeekGames(season, week);
  const syncedTeams = await upsertTeams(db, teams);

  if (games.length > 0) {
    const { error } = await db.from("games").upsert(
      games.map((g) => ({ ...g, updated_at: new Date().toISOString() })),
    );
    if (error) throw new Error(`games week ${week}: ${error.message}`);
  }

  return { games: games.length, teams: syncedTeams };
}

/**
 * The AP poll, which moves once a week.
 *
 * Deliberately not part of syncWeek. The ranks that decide a top-25 slate ride
 * along inside the scoreboard response as curatedRank and land on the games
 * themselves, so pulling the poll on every scores run was a second request an
 * hour that bought nothing between Sunday afternoons.
 */
export type RankingSync = {
  week: number;
  stored: number;
  /** Ranked teams the teams table has never heard of, if any. */
  skipped: number[];
  /** Polls refused because they were last week's, republished under this week. */
  stale: string[];
  /** Null when the call worked, whether or not it found a poll. */
  error: string | null;
};

/**
 * Stores a week's polls.
 *
 * This used to swallow every error and answer 0, on the reasoning that polls
 * are not published every week. The two cases are not the same, and collapsing
 * them hid the second: the rankings table was empty for the whole of this
 * season and nothing anywhere said so. "No poll yet" is a fact about the week;
 * a fetch that throws is a fact about us, and only one of them is fine.
 *
 * It still does not throw — one bad week must not take down a cron run that
 * also grades picks and builds boards — but the reason now travels back with
 * the count and out through the response.
 */
export async function syncRankings(
  db: Supabase,
  season: number,
  week: number,
): Promise<RankingSync> {
  try {
    const rankings = await fetchRankings(season, week);
    if (rankings.length === 0) return { week, stored: 0, skipped: [], stale: [], error: null };

    // Only teams we actually have.
    //
    // rankings.team_id is a foreign key, and a poll can name a team the teams
    // table has never seen — one that has not appeared in a scoreboard we
    // synced. Postgres rejects the whole statement for that one row, so a
    // single unknown team took all twenty-five down with it and the table sat
    // empty for a season. The poll is worth more than the completeness of any
    // one line in it, so the strangers are dropped and named rather than
    // allowed to lose the rest.
    const ids = [...new Set(rankings.map((r) => r.team_id))];
    const { data: known } = await db.from("teams").select("id").in("id", ids);
    const haveIds = new Set((known ?? []).map((t) => t.id));

    const usable = rankings.filter((r) => haveIds.has(r.team_id));
    const skipped = ids.filter((id) => !haveIds.has(id));

    if (usable.length === 0) {
      return { week, stored: 0, skipped, stale: [], error: "no ranked team is in the teams table" };
    }

    // Refuse a poll that is last week's wearing this week's number.
    //
    // ESPN is asked for a specific week and answers with the newest poll it
    // has, so asking ahead of publication returns the current one — and
    // fetchRankings stamps the week we asked for onto whatever comes back. The
    // cron asks one week ahead deliberately, to catch a new poll the hour it
    // lands. The cost of that, unguarded, is that it manufactures next week's
    // poll out of this week's, and week_board_open cannot tell the difference:
    // the gate that exists to hold a board until the AP poll drops opens itself
    // on a copy of the poll it already had.
    //
    // A published poll always moves somebody. Twenty-five identical placements
    // are the same poll, not a new one. Compared per poll, because AP and the
    // coaches' poll do not publish together.
    const previous = await db
      .from("rankings")
      .select("poll, rank, team_id")
      .eq("season", season)
      .eq("week", week - 1);

    const priorByPoll = new Map<string, Set<string>>();
    for (const row of previous.data ?? []) {
      const set = priorByPoll.get(row.poll) ?? new Set<string>();
      set.add(`${row.rank}:${row.team_id}`);
      priorByPoll.set(row.poll, set);
    }

    const stale: string[] = [];
    const fresh = usable.filter((r) => {
      const prior = priorByPoll.get(r.poll);
      if (!prior || prior.size === 0) return true;
      const current = usable.filter((u) => u.poll === r.poll);
      const same =
        current.length === prior.size &&
        current.every((u) => prior.has(`${u.rank}:${u.team_id}`));
      if (same && !stale.includes(r.poll)) stale.push(r.poll);
      return !same;
    });

    if (fresh.length === 0) return { week, stored: 0, skipped, stale, error: null };

    const { error } = await db.from("rankings").upsert(
      fresh.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    );
    if (error) throw new Error(error.message);
    return { week, stored: fresh.length, skipped, stale, error: null };
  } catch (cause) {
    return {
      week,
      stored: 0,
      skipped: [],
      stale: [],
      error: cause instanceof Error ? cause.message : "rankings fetch failed",
    };
  }
}

/**
 * Grades every finished game, tops up each league's slate for the week, and
 * settles any playoff matchup whose games have all gone final.
 */
/**
 * Grades finished games, rebuilds every league's board for the weeks in play,
 * and settles any playoff matchups they have reached.
 *
 * The per-league work runs inside Postgres rather than as a call per league
 * from here: the round trip, not the query, was what capped how many leagues a
 * scheduled run could get through before it was killed.
 */
export async function refreshLeagues(db: Supabase, season: number, weeks: number[]) {
  const graded = await db.rpc("grade_picks");
  if (graded.error) throw new Error(`grade_picks: ${graded.error.message}`);

  const refreshed = await db.rpc("refresh_season", { p_season: season, p_weeks: weeks });
  if (refreshed.error) throw new Error(`refresh_season: ${refreshed.error.message}`);

  return { gradedPicks: graded.data ?? 0, ...refreshed.data };
}

/** Parses ?season / ?week / ?weeks, defaulting to the week ESPN says is live. */
export async function resolveWindow(url: URL) {
  const seasonParam = Number(url.searchParams.get("season"));
  const weekParam = Number(url.searchParams.get("week"));
  const weeksParam = url.searchParams.get("weeks");

  let season = Number.isFinite(seasonParam) && seasonParam > 2000 ? seasonParam : null;
  let weeks: number[] = [];

  if (weeksParam) {
    const match = weeksParam.match(/^(\d+)\s*-\s*(\d+)$/);
    if (match) {
      const from = Number(match[1]);
      const to = Number(match[2]);
      for (let w = from; w <= to && w - from < 25; w += 1) weeks.push(w);
    } else {
      weeks = weeksParam
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0 && value <= 20);
    }
  } else if (Number.isInteger(weekParam) && weekParam > 0) {
    weeks = [weekParam];
  }

  if (!season || weeks.length === 0) {
    const current = await fetchCurrentWeek();
    season ??= current.season;
    if (weeks.length === 0) {
      // The previous week is only worth re-pulling for late finals and stat
      // corrections, which do not arrive every three minutes. Once an hour is
      // plenty, and keying it off the clock means no state to keep and a
      // schedule that heals itself if a run is missed.
      const catchUp =
        url.searchParams.get("catchup") === "1" || new Date().getUTCMinutes() < 5;
      weeks = current.week > 1 && catchUp ? [current.week - 1, current.week] : [current.week];
    }
  }

  return { season, weeks };
}
