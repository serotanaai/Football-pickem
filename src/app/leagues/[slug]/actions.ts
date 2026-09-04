"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/league";

export type ActionState = { error?: string; ok?: string };

export async function savePicksAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const leagueId = String(formData.get("league_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const week = Number(formData.get("week"));

  let selections: { game_id: number; team_id: number }[];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("picks") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("not a list");
    selections = parsed.map((entry) => {
      const gameId = Number((entry as { game_id?: unknown })?.game_id);
      const teamId = Number((entry as { team_id?: unknown })?.team_id);
      if (!Number.isInteger(gameId) || !Number.isInteger(teamId)) {
        throw new Error("bad entry");
      }
      return { game_id: gameId, team_id: teamId };
    });
  } catch {
    return { error: "Could not read your picks." };
  }

  if (!leagueId || !Number.isInteger(week)) return { error: "Missing league or week." };
  if (selections.length === 0) return { error: "Choose at least one winner first." };

  const supabase = await createClient();
  const { error } = await supabase.from("picks").upsert(
    selections.map((selection) => ({
      league_id: leagueId,
      user_id: user.id,
      week,
      game_id: selection.game_id,
      team_id: selection.team_id,
    })),
    { onConflict: "league_id,user_id,game_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${slug}/picks`);
  revalidatePath(`/leagues/${slug}`);
  return { ok: `Saved ${selections.length} ${selections.length === 1 ? "pick" : "picks"}.` };
}

export async function rebuildWeekAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get("league_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const week = Number(formData.get("week"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_week_board", {
    p_league_id: leagueId,
    p_week: week,
    p_reset: false,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${slug}/picks`);
  revalidatePath(`/leagues/${slug}/settings`);
  return { ok: `Week ${week} now has ${data} games.` };
}

export async function regenerateInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get("league_id") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${slug}/settings`);
  return { ok: "New invite link created. The old one no longer works." };
}

export async function seedPlayoffsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get("league_id") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seed_playoffs", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${slug}/playoffs`);
  revalidatePath(`/leagues/${slug}/settings`);
  return { ok: `Bracket seeded with the top ${data} members.` };
}

export async function updateLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get("league_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const maxGames = Number(formData.get("max_games_per_week"));
  const endWeek = Number(formData.get("regular_season_end_week"));
  const playoffTeams = Number(formData.get("playoff_teams"));

  if (name.length < 3) return { error: "League names need at least 3 characters." };
  if (!Number.isInteger(maxGames) || maxGames < 3 || maxGames > 60) {
    return { error: "Games per week has to be between 3 and 60." };
  }
  if (![0, 2, 4, 8].includes(playoffTeams)) {
    return { error: "Playoff field must be 0, 2, 4 or 8." };
  }
  if (!Number.isInteger(endWeek) || endWeek < 2 || endWeek > 20) {
    return { error: "The last regular-season week has to be between 2 and 20." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leagues")
    .update({
      name,
      description: description || null,
      max_games_per_week: maxGames,
      regular_season_end_week: endWeek,
      playoff_teams: playoffTeams,
    })
    .eq("id", leagueId);

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${slug}/settings`);
  return { ok: "League settings saved." };
}

export async function leaveLeagueAction(formData: FormData): Promise<void> {
  const leagueId = String(formData.get("league_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("leave_league", { p_league_id: leagueId });
  redirect("/dashboard");
}
