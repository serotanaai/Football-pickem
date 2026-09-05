import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  refreshLeagues,
  resolveWindow,
  syncRankings,
  syncSecretMatches,
  syncWeek,
} from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!syncSecretMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const { season, weeks } = await resolveWindow(new URL(request.url));

    // Rankings are opt-in here too, so a manual scores pull costs one request
    // per week rather than two.
    const withRankings = new URL(request.url).searchParams.get("rankings") === "1";

    const results: Record<string, unknown> = {};
    for (const week of weeks) {
      results[`week_${week}`] = await syncWeek(db, season, week);
    }

    let rankings: number | null = null;
    if (withRankings) {
      rankings = 0;
      for (const week of weeks) rankings += await syncRankings(db, season, week);
    }

    const leagues = await refreshLeagues(db, season, weeks);
    return NextResponse.json({ ok: true, season, weeks, rankings, results, leagues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export const GET = POST;
