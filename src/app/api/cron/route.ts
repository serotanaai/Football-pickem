import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  refreshLeagues,
  resolveWindow,
  syncConferences,
  syncRankings,
  syncSecretMatches,
  syncTeams,
  syncWeek,
} from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One entry point for scheduled runs: seeds the team list on first use, pulls
 * the week in play, grades picks, and settles playoff matchups.
 *
 * Two jobs are expected to call this. A frequent one for scores, every few
 * minutes while games are on, which fetches the current week and nothing else.
 * And a weekly one with ?rankings=1 after the AP poll lands on Sunday, since
 * the poll does not move in between and a scores run has no reason to ask for
 * it.
 *
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

    const { season, weeks } = await resolveWindow(new URL(request.url));

    let teams = 0;
    if (!count) {
      await syncConferences(db);
      teams = await syncTeams(db, season);
    }
    const results: Record<string, unknown> = {};
    for (const week of weeks) {
      results[`week_${week}`] = await syncWeek(db, season, week);
    }

    // The poll is now an input to the boards rather than a decoration on them:
    // a week is not built until its AP Top 25 is in, so this has to run on the
    // ordinary schedule and not only when somebody remembers ?rankings=1. It is
    // one request per week, and the week after the last one in play as well —
    // that is the poll the next board is waiting on.
    const rankingWeeks = [...new Set([...weeks, Math.max(...weeks) + 1])];
    const rankings = [];
    for (const week of rankingWeeks) rankings.push(await syncRankings(db, season, week));

    // Written down rather than only returned. The boards wait on this fetch, so
    // "is the poll in, and if not is that AP or us" has to be answerable on a
    // Sunday afternoon without re-running the job to find out.
    await db.from("sync_health").upsert({
      kind: "rankings",
      ran_at: new Date().toISOString(),
      ok: rankings.every((r) => r.error === null),
      detail: { season, weeks: rankingWeeks, results: rankings },
    });

    const leagues = await refreshLeagues(db, season, weeks);
    return NextResponse.json({
      ok: true,
      seededTeams: teams,
      season,
      weeks,
      rankings,
      results,
      leagues,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
