"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LeagueScope } from "@/lib/database.types";
import { DEFAULT_GAMES_PER_WEEK } from "@/lib/format";

const SCOPES: LeagueScope[] = ["conference", "all_fbs", "top25"];

function intField(form: FormData, name: string, fallback: number): number {
  const value = Number(form.get(name));
  return Number.isInteger(value) ? value : fallback;
}

export type CreateLeagueState = { error?: string };

export async function createLeagueAction(
  _prev: CreateLeagueState,
  formData: FormData,
): Promise<CreateLeagueState> {
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "all_fbs") as LeagueScope;

  if (name.length < 3) return { error: "Give your league a name of at least 3 characters." };
  if (!SCOPES.includes(scope)) return { error: "Pick a valid weekly slate." };

  const conferenceId = intField(formData, "conference_id", 0);
  if (scope === "conference" && !conferenceId) {
    return { error: "Choose which conference your league picks." };
  }

  const startWeek = intField(formData, "start_week", 1);
  const endWeek = intField(formData, "regular_season_end_week", 12);
  if (endWeek <= startWeek) {
    return { error: "The regular season has to end after it starts." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", {
    p_name: name,
    p_season: intField(formData, "season", new Date().getFullYear()),
    p_scope: scope,
    p_conference_id: scope === "conference" ? conferenceId : null,
    p_max_games: intField(formData, "max_games_per_week", DEFAULT_GAMES_PER_WEEK),
    p_start_week: startWeek,
    p_end_week: endWeek,
    p_playoff_teams: intField(formData, "playoff_teams", 4),
    p_description: String(formData.get("description") ?? "").trim() || null,
  });

  // create_league has a fixed signature, so the listing choice is applied
  // straight after rather than threaded through it.
  if (!error && data && formData.get("is_public") === "on") {
    await supabase.from("leagues").update({ is_public: true }).eq("id", data.id);
  }

  if (error || !data) {
    return { error: error?.message ?? "Could not create the league." };
  }

  // Build the opening slate so the league is immediately playable.
  await supabase.rpc("generate_week_board", {
    p_league_id: data.id,
    p_week: startWeek,
    p_reset: false,
  });

  redirect(`/leagues/${data.slug}/settings?created=1`);
}
