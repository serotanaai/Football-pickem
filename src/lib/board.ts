import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type BoardTeam = Pick<
  Tables<"teams">,
  "id" | "school" | "display_name" | "abbreviation" | "logo" | "color" | "conference_id"
>;

export type BoardGame = Tables<"games"> & {
  home: BoardTeam | null;
  away: BoardTeam | null;
};

export type WeekBoard = {
  leagueWeek: Tables<"league_weeks"> | null;
  games: BoardGame[];
};

const TEAM_COLUMNS = "id, school, display_name, abbreviation, logo, color, conference_id";

/**
 * The slate for one league-week. Rows are fetched separately and stitched in
 * JS rather than through PostgREST embedding, because `games` points at `teams`
 * twice and the ambiguity makes the embedded form fragile.
 */
export async function loadWeekBoard(leagueId: string, week: number): Promise<WeekBoard> {
  const supabase = await createClient();

  const { data: leagueWeek } = await supabase
    .from("league_weeks")
    .select("*")
    .eq("league_id", leagueId)
    .eq("week", week)
    .maybeSingle();

  if (!leagueWeek) return { leagueWeek: null, games: [] };

  const { data: slate } = await supabase
    .from("league_week_games")
    .select("game_id")
    .eq("league_week_id", leagueWeek.id);

  const gameIds = (slate ?? []).map((row) => row.game_id);
  if (gameIds.length === 0) return { leagueWeek, games: [] };

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .in("id", gameIds)
    .order("start_time", { ascending: true })
    .order("id", { ascending: true });

  const teamIds = [
    ...new Set((games ?? []).flatMap((g) => [g.home_team_id, g.away_team_id])),
  ];

  const { data: teams } = await supabase.from("teams").select(TEAM_COLUMNS).in("id", teamIds);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  return {
    leagueWeek,
    games: (games ?? []).map((game) => ({
      ...game,
      home: teamById.get(game.home_team_id) ?? null,
      away: teamById.get(game.away_team_id) ?? null,
    })),
  };
}

/** Builds the slate on demand the first time a member opens a week. */
export async function ensureWeekBoard(leagueId: string, week: number): Promise<WeekBoard> {
  const board = await loadWeekBoard(leagueId, week);
  if (board.games.length > 0) return board;

  const supabase = await createClient();
  await supabase.rpc("generate_week_board", {
    p_league_id: leagueId,
    p_week: week,
    p_reset: false,
  });

  return loadWeekBoard(leagueId, week);
}

export type Member = {
  user_id: string;
  role: "commissioner" | "member";
  name: string;
  email: string | null;
};

/**
 * The league's roster.
 *
 * Read through league_roster rather than the tables, because email addresses
 * are not every member's business: the function returns one only to the
 * commissioner, or to the member it belongs to. Selecting profiles.email
 * directly is no longer possible for a signed-in user at all, so the rule
 * cannot be sidestepped by asking the API differently.
 */
export async function loadMembers(leagueId: string): Promise<Member[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("league_roster", { p_league_id: leagueId });

  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    name: row.display_name,
    email: row.email ?? null,
  }));
}

/**
 * Each game locks at its own kickoff. Someone picking late keeps every game
 * that has not started — they only forfeit the ones that have.
 */
export function isLocked(game: Pick<Tables<"games">, "start_time">): boolean {
  return new Date(game.start_time).getTime() <= Date.now();
}

/** The row that seals a member's week, or null if they can still pick. */
export async function loadSubmission(
  leagueId: string,
  userId: string,
  week: number,
): Promise<Tables<"pick_submissions"> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pick_submissions")
    .select("*")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .eq("week", week)
    .maybeSingle();
  return data ?? null;
}

export type GameConsensus = {
  /** true once you have submitted this week, or the game has kicked off */
  revealed: boolean;
  total: number;
  homeCount: number;
  awayCount: number;
  homePct: number;
  awayPct: number;
  myTeamId: number | null;
};

/**
 * How the league split on each game.
 *
 * The counts come from week_consensus, which returns aggregates only — never
 * who picked what — and opens up once you have submitted rather than waiting
 * for kickoff. Your own pick still comes from the picks table directly.
 */
export async function loadWeekConsensus(
  leagueId: string,
  week: number,
  userId: string,
  games: BoardGame[],
): Promise<Map<number, GameConsensus>> {
  const supabase = await createClient();

  const [{ data: counts }, { data: mine }] = await Promise.all([
    supabase.rpc("week_consensus", { p_league_id: leagueId, p_week: week }),
    supabase
      .from("picks")
      .select("game_id, team_id")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .eq("week", week),
  ]);

  const myByGame = new Map((mine ?? []).map((p) => [p.game_id, p.team_id]));
  const out = new Map<number, GameConsensus>();

  for (const game of games) {
    const forGame = (counts ?? []).filter((c) => c.game_id === game.id);
    const homeCount = forGame.find((c) => c.team_id === game.home_team_id)?.picks ?? 0;
    const awayCount = forGame.find((c) => c.team_id === game.away_team_id)?.picks ?? 0;
    const total = homeCount + awayCount;

    out.set(game.id, {
      revealed: total > 0,
      total,
      homeCount,
      awayCount,
      homePct: total ? Math.round((homeCount / total) * 100) : 0,
      awayPct: total ? Math.round((awayCount / total) * 100) : 0,
      myTeamId: myByGame.get(game.id) ?? null,
    });
  }

  return out;
}
