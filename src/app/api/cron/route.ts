import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  refreshLeagues,
  resolveWindow,
  syncConferences,
  syncSecretMatches,
  syncTeams,
  syncWeek,
} from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One entry point for scheduled runs: seeds the team list on first use, pulls the
 * current and previous week, grades picks, and settles playoff matchups.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, which syncSecretMatches
 * accepts when CRON_SECRET and SYNC_SECRET are the same value.
 */
export async function GET(request: Request) {
  if (!syncSecretMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();

    const { count } = await db
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("is_fbs", true);

    let teams = 0;
    if (!count) {
      await syncConferences(db);
      teams = await syncTeams(db);
    }

    const { season, weeks } = await resolveWindow(new URL(request.url));
    const results: Record<string, unknown> = {};
    for (const week of weeks) {
      results[`week_${week}`] = await syncWeek(db, season, week);
    }

    const leagues = await refreshLeagues(db, season, weeks);
    return NextResponse.json({ ok: true, seededTeams: teams, season, weeks, results, leagues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
