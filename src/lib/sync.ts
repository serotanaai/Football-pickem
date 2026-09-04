import { createAdminClient } from "@/lib/supabase/admin";
import {
  FBS_CONFERENCES,
  fetchCurrentWeek,
  fetchFbsTeams,
  fetchRankings,
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

export async function syncTeams(db: Supabase) {
  const teams = await fetchFbsTeams();
  if (teams.length === 0) return 0;

  const { error } = await db.from("teams").upsert(
    teams.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
  );
  if (error) throw new Error(`teams: ${error.message}`);
  return teams.length;
}

/**
 * Adds teams seen on the scoreboard that we do not have yet — FCS opponents,
 * mostly. Never touches rows we already hold, so a team's FBS conference
 * assignment from syncTeams survives.
 */
async function insertUnknownTeams(db: Supabase, teams: NormalizedTeam[]) {
  if (teams.length === 0) return 0;

  const ids = teams.map((t) => t.id);
  const { data: existing, error } = await db.from("teams").select("id").in("id", ids);
  if (error) throw new Error(`teams lookup: ${error.message}`);

  const known = new Set((existing ?? []).map((row) => row.id));
  const missing = teams.filter((t) => !known.has(t.id));
  if (missing.length === 0) return 0;

  const { error: insertError } = await db.from("teams").insert(missing);
  if (insertError) throw new Error(`unknown teams: ${insertError.message}`);
  return missing.length;
}

export async function syncWeek(db: Supabase, season: number, week: number) {
  const { games, teams } = await fetchWeekGames(season, week);
  const addedTeams = await insertUnknownTeams(db, teams);

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

  return { games: games.length, addedTeams, rankings: rankingsSynced };
}

/**
 * Grades every finished game, tops up each league's slate for the week, and
 * settles any playoff matchup whose games have all gone final.
 */
export async function refreshLeagues(db: Supabase, season: number, weeks: number[]) {
  const graded = await db.rpc("grade_picks");
  if (graded.error) throw new Error(`grade_picks: ${graded.error.message}`);

  const { data: leagues, error } = await db
    .from("leagues")
    .select("id, start_week, regular_season_end_week, playoff_teams")
    .eq("season", season);
  if (error) throw new Error(`leagues: ${error.message}`);

  let boards = 0;
  let advanced = 0;

  for (const league of leagues ?? []) {
    const rounds = { 8: 3, 4: 2, 2: 1 }[league.playoff_teams] ?? 0;
    const finalWeek = league.regular_season_end_week + rounds;

    for (const week of weeks) {
      if (week < league.start_week || week > finalWeek) continue;

      const board = await db.rpc("generate_week_board", {
        p_league_id: league.id,
        p_week: week,
        p_reset: false,
      });
      if (!board.error) boards += 1;

      if (league.playoff_teams > 0 && week > league.regular_season_end_week) {
        const result = await db.rpc("advance_playoffs", {
          p_league_id: league.id,
          p_week: week,
        });
        if (!result.error && typeof result.data === "number") advanced += result.data;
      }
    }
  }

  return { gradedPicks: graded.data ?? 0, boards, advancedMatchups: advanced };
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
