import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  refreshLeagues,
  resolveWindow,
  syncConferences,
  governedWeek,
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
    // Polls first, then the scoreboard, then the boards.
    //
    // The order is the point. A board opens when the poll is in and is cut from
    // the ranks on the games rows, and those two come from different ESPN
    // endpoints — so fetching the scoreboard first means the run that first
    // sees a new poll can still be holding last week's ranks when it builds the
    // slate. Asking for the poll first does not make the scoreboard fresher,
    // but it puts the request that matters at the front rather than behind
    // whatever the previous fetch happened to return.
    //
    // This also runs on the ordinary schedule now rather than only under
    // ?rankings=1, and covers the week after the last one in play — that is the
    // poll the next board is waiting on.
    const next = Math.max(...weeks) + 1;

    // One poll, filed under the week it governs.
    //
    // This asked for two weeks and let the answer land on whichever it asked
    // for first — which is the week that just finished, because ESPN returns
    // the newest poll it has whatever week is in the request. The duplicate
    // guard then refused the same poll for the second week, so the filing
    // slipped one week further every Sunday: week 4 and week 6 holding the same
    // poll with week 5 empty between them, and week 5's board shut two days
    // before kickoff because the gate could not find a poll for it.
    //
    // governedWeek asks the calendar instead of the request: a poll published
    // now governs the earliest week nobody can still pick, which is the only
    // week it was ever about. One fetch, one week, no race to lose.
    const rankingWeeks = [(await governedWeek(db, season)) ?? next];
    const rankings = [];
    for (const week of rankingWeeks) rankings.push(await syncRankings(db, season, week));

    // The scoreboard covers the same window as the poll, which it did not
    // before: weeks came back as the week in play alone, so the week being
    // prepared was fetched once, whenever it first appeared, and never again.
    // Its games kept the ranks they were born with — nine days stale by the
    // time anyone noticed, still showing the preseason number one.
    //
    // That is not only a display problem. curatedRank rides in on the
    // scoreboard and lands on the games rows, and a top-25 board is cut from
    // those, so a board built on them is cut from a poll that has since moved.
    const gameWeeks = [...new Set([...weeks, next])];
    const results: Record<string, unknown> = {};
    for (const week of gameWeeks) {
      results[`week_${week}`] = await syncWeek(db, season, week);
    }

    // Written down rather than only returned. The boards wait on this fetch, so
    // "is the poll in, and if not is that AP or us" has to be answerable on a
    // Sunday afternoon without re-running the job to find out.
    await db.from("sync_health").upsert({
      kind: "rankings",
      ran_at: new Date().toISOString(),
      ok: rankings.every((r) => r.error === null),
      detail: { season, weeks: rankingWeeks, results: rankings },
    });

    // Boards are built over the same window too, so the week being prepared is
    // cut as soon as its poll lands rather than waiting for it to become the
    // week in play. generate_week_board still refuses a week whose AP poll is
    // not stored, so widening this does not open a board early — it only stops
    // one opening late.
    const leagues = await refreshLeagues(db, season, gameWeeks);
    return NextResponse.json({
      ok: true,
      seededTeams: teams,
      season,
      weeks: gameWeeks,
      rankings,
      results,
      leagues,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
