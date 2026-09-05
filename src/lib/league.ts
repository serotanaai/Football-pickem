import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { totalPlayoffRounds } from "@/lib/format";

export type LeagueContext = {
  league: Tables<"leagues">;
  conference: Tables<"conferences"> | null;
  role: "commissioner" | "member";
  userId: string;
};

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
});

/** Loads a league the signed-in user belongs to, or 404s. */
export const loadLeague = cache(async (slug: string): Promise<LeagueContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!league) notFound();

  const { data: membership } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  let conference: Tables<"conferences"> | null = null;
  if (league.conference_id) {
    const { data } = await supabase
      .from("conferences")
      .select("*")
      .eq("id", league.conference_id)
      .maybeSingle();
    conference = data ?? null;
  }

  return { league, conference, role: membership.role, userId: user.id };
});

export function lastWeek(league: Tables<"leagues">): number {
  return league.regular_season_end_week + totalPlayoffRounds(league.playoff_teams);
}

export function weekRange(league: Tables<"leagues">): number[] {
  const weeks: number[] = [];
  for (let w = league.start_week; w <= lastWeek(league); w += 1) weeks.push(w);
  return weeks;
}

/**
 * The week the league is currently playing: the week of the next game that has
 * not gone final, clamped to the league's own schedule.
 */
export const resolveCurrentWeek = cache(async (season: number): Promise<number> => {
  const supabase = await createClient();

  const { data: next } = await supabase
    .from("games")
    .select("week")
    .eq("season", season)
    .eq("season_type", 2)
    .eq("completed", false)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (next) return next.week;

  const { data: last } = await supabase
    .from("games")
    .select("week")
    .eq("season", season)
    .eq("season_type", 2)
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  return last?.week ?? 1;
});

export function clampWeek(league: Tables<"leagues">, week: number): number {
  return Math.min(Math.max(week, league.start_week), lastWeek(league));
}

export function parseWeek(
  league: Tables<"leagues">,
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number(raw);
  if (Number.isInteger(value) && value > 0) return clampWeek(league, value);
  return clampWeek(league, fallback);
}

/** Leagues one account may be in per season, mirroring the league_members trigger. */
export const MAX_LEAGUES_PER_SEASON = 5;

/**
 * Members one league may hold, mirroring the league_members trigger.
 *
 * The ceiling is the scoring, not the database: a ten-game week has eleven
 * possible scores, so past a couple of dozen people the top score is shared
 * every week and the tiebreak — who submitted earliest — decides the season.
 */
export const MAX_LEAGUE_MEMBERS = 24;

/**
 * How many leagues the signed-in user is already in for a season.
 *
 * The cap itself is enforced by a trigger on league_members. This exists only
 * so the UI can say so up front instead of letting someone fill in a form the
 * database is going to refuse.
 */
export async function leagueCountThisSeason(userId: string, season: number): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("league_members")
    .select("league_id, leagues!inner(season)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("leagues.season", season);

  return count ?? 0;
}
