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

export async function loadMembers(leagueId: string): Promise<Member[]> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("league_members")
    .select("user_id, role, joined_at")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", ids);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (members ?? []).map((member) => {
    const profile = profileById.get(member.user_id);
    return {
      user_id: member.user_id,
      role: member.role,
      name: profile?.display_name ?? profile?.email?.split("@")[0] ?? "Member",
      email: profile?.email ?? null,
    };
  });
}

export function isLocked(game: Pick<Tables<"games">, "start_time">): boolean {
  return new Date(game.start_time).getTime() <= Date.now();
}
