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

  let rankingsSynced = 0;
  try {
    const rankings = await fetchRankings(season, week);
    if (rankings.length > 0) {
      const { error } = await db.from("rankings").upsert(
        rankings.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      );
      if (error) throw new Error(error.message);
      rankingsSynced = rankings.length;
    }
  } catch {
    // Polls are not published for every week (and not at all before week 3).
    // Game-level curatedRank already covers the top-25 slates, so this is optional.
  }

  return { games: games.length, teams: syncedTeams, rankings: rankingsSynced };
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
    // Re-pull the previous week too: late finals and stat corrections land there.
    if (weeks.length === 0) {
      weeks = current.week > 1 ? [current.week - 1, current.week] : [current.week];
    }
  }

  return { season, weeks };
}
