import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_LIVE, siteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/client";
import { previewEmail, reminderEmail, resultsEmail } from "@/lib/email/templates";
import type { EmailKind } from "@/lib/database.types";

/**
 * One pass of the weekly sequence: ask the database what it owes, build each
 * message, hand it over, write down that it went.
 *
 * The order of those last two matters and is the opposite of the obvious one.
 * The ledger row is claimed *before* the send, so a run that dies between
 * handing a message to Resend and recording it loses the record of a message
 * that went out — and the next run, seeing the claim, does not send it twice.
 * A dropped email is a week of silence for one person. A duplicate is a
 * product that looks broken to everyone who gets one, and there is no taking
 * it back.
 */

/** Resend allows two requests a second by default; this stays under it. */
const GAP_MS = 600;

export type RunSummary = {
  live: boolean;
  due: number;
  sent: number;
  /** Already in the ledger — another run got there first. */
  skipped: number;
  failed: number;
  byKind: Partial<Record<EmailKind, number>>;
  errors: string[];
  /** What a dry run would have sent, so it can be read before it is believed. */
  planned: { kind: EmailKind; to: string; subject: string }[];
};

export type RunOptions = {
  limit?: number;
  /** Overrides EMAIL_LIVE. Absent means "whatever the environment says". */
  live?: boolean;
  /** Send only to this address. The safe way to try the real thing once. */
  onlyTo?: string;
};

const ET = "America/New_York";

function whenText(iso: string | null): string {
  if (!iso) return "kickoff";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export async function runEmailSequence(options: RunOptions = {}): Promise<RunSummary> {
  const live = options.live ?? EMAIL_LIVE;
  const db = createAdminClient();
  const base = siteUrl();

  const summary: RunSummary = {
    live,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    byKind: {},
    errors: [],
    planned: [],
  };

  const { data: dueRows, error } = await db.rpc("due_emails", { p_limit: options.limit ?? 500 });
  if (error) {
    summary.errors.push(`due_emails: ${error.message}`);
    return summary;
  }

  const due = (dueRows ?? []).filter((row) => !options.onlyTo || row.email === options.onlyTo);
  summary.due = due.length;
  if (due.length === 0) return summary;

  // Everything the messages need, in a handful of queries rather than one per
  // recipient — a league of forty is forty identical lookups otherwise.
  const userIds = [...new Set(due.map((r) => r.user_id))];
  const leagueIds = [...new Set(due.map((r) => r.league_id))];
  const weeks = [...new Set(due.map((r) => r.week))];

  const [tokens, boards, standings, submissions] = await Promise.all([
    db.from("profiles").select("id, unsubscribe_token").in("id", userIds),
    db
      .from("league_weeks")
      .select("league_id, week, game_count, featured_game_id, lock_at")
      .in("league_id", leagueIds)
      .in("week", weeks),
    db
      .from("weekly_results_ranked")
      .select("league_id, week, user_id, points, correct, picks_made, week_rank, week_won")
      .in("league_id", leagueIds)
      .in("week", weeks),
    db
      .from("pick_submissions")
      .select("league_id, week, user_id, pick_count")
      .in("league_id", leagueIds)
      .in("week", weeks),
  ]);

  const tokenOf = new Map((tokens.data ?? []).map((p) => [p.id, p.unsubscribe_token]));
  const key = (league: string, week: number) => `${league}:${week}`;
  const boardOf = new Map((boards.data ?? []).map((b) => [key(b.league_id, b.week), b]));
  const pickedOf = new Map(
    (submissions.data ?? []).map((s) => [`${s.league_id}:${s.week}:${s.user_id}`, s.pick_count]),
  );

  // The featured games named by the previews in this batch, with both sides.
  const featuredIds = [...new Set((boards.data ?? []).map((b) => b.featured_game_id).filter(
    (id): id is number => typeof id === "number",
  ))];
  const gameOf = new Map<number, { away: string; home: string; awayRank: number | null; homeRank: number | null; start: string }>();
  if (featuredIds.length > 0) {
    const { data: games } = await db
      .from("games")
      .select("id, start_time, home_team_id, away_team_id, home_rank, away_rank")
      .in("id", featuredIds);
    const teamIds = [...new Set((games ?? []).flatMap((g) => [g.home_team_id, g.away_team_id]))];
    const { data: teams } = await db.from("teams").select("id, school").in("id", teamIds);
    const school = new Map((teams ?? []).map((t) => [t.id, t.school]));
    for (const g of games ?? []) {
      gameOf.set(g.id, {
        away: school.get(g.away_team_id) ?? "TBD",
        home: school.get(g.home_team_id) ?? "TBD",
        awayRank: g.away_rank,
        homeRank: g.home_rank,
        start: g.start_time,
      });
    }
  }

  // Who took each week, for the line in the results mail that names them.
  const { data: names } = await db.from("profiles").select("id, display_name");
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.display_name ?? "Someone"]));
  const winnerOf = new Map<string, { name: string; points: number }>();
  for (const row of standings.data ?? []) {
    if (row.week_rank === 1 && row.league_id && typeof row.week === "number" && row.user_id) {
      winnerOf.set(key(row.league_id, row.week), {
        name: nameOf.get(row.user_id) ?? "Someone",
        points: row.points ?? 0,
      });
    }
  }
  const mineOf = new Map(
    (standings.data ?? [])
      .filter((r) => r.league_id && typeof r.week === "number" && r.user_id)
      .map((r) => [`${r.league_id}:${r.week}:${r.user_id}`, r]),
  );

  for (const row of due) {
    const token = tokenOf.get(row.user_id);
    if (!token) {
      summary.errors.push(`no unsubscribe token for ${row.user_id}`);
      continue;
    }

    const unsub = `${base}/unsubscribe/${token}`;
    const oneClick = `${base}/api/unsubscribe/${token}`;
    const leagueUrl = `${base}/leagues/${row.league_slug}`;
    const picksUrl = `${leagueUrl}/picks`;
    const to = { name: row.display_name, email: row.email };
    const board = boardOf.get(key(row.league_id, row.week));

    let built: { subject: string; html: string; text: string } | null = null;

    if (row.kind === "results") {
      const mine = mineOf.get(`${row.league_id}:${row.week}:${row.user_id}`);
      const winner = winnerOf.get(key(row.league_id, row.week));
      built = resultsEmail(
        to,
        {
          leagueName: row.league_name,
          week: row.week,
          rank: mine?.week_rank ?? null,
          points: mine?.points ?? 0,
          correct: mine?.correct ?? 0,
          played: mine?.picks_made ?? 0,
          wonWeek: mine?.week_won === true,
          winnerName: winner?.name ?? null,
          winnerPoints: winner?.points ?? null,
        },
        leagueUrl,
        unsub,
      );
    } else if (row.kind === "preview") {
      const featured = board?.featured_game_id ? gameOf.get(board.featured_game_id) : undefined;
      built = previewEmail(
        to,
        {
          leagueName: row.league_name,
          week: row.week,
          matchup: featured
            ? {
                away: featured.away,
                home: featured.home,
                awayRank: featured.awayRank,
                homeRank: featured.homeRank,
              }
            : null,
          kickoff: whenText(featured?.start ?? row.lock_at),
        },
        picksUrl,
        unsub,
      );
    } else {
      const total = board?.game_count ?? 0;
      const done = pickedOf.get(`${row.league_id}:${row.week}:${row.user_id}`) ?? 0;
      const remaining = Math.max(0, total - done);
      // The board filled up between due_emails running and this loop reaching
      // it. Nothing to nag about any more.
      if (remaining === 0) {
        summary.skipped += 1;
        continue;
      }
      built = reminderEmail(
        to,
        {
          leagueName: row.league_name,
          week: row.week,
          remaining,
          lockAt: whenText(row.lock_at),
          lastCall: row.kind === "last_call",
        },
        picksUrl,
        unsub,
      );
    }

    summary.byKind[row.kind] = (summary.byKind[row.kind] ?? 0) + 1;
    summary.planned.push({ kind: row.kind, to: row.email, subject: built.subject });

    if (!live) continue;

    // Claim first. A unique violation here means another run already owns this
    // message, which is exactly the collision the constraint is there to catch.
    const claim = await db
      .from("email_log")
      .insert({
        user_id: row.user_id,
        league_id: row.league_id,
        week: row.week,
        kind: row.kind,
      })
      .select("id")
      .single();

    if (claim.error || !claim.data) {
      summary.skipped += 1;
      continue;
    }

    const result = await sendEmail({
      to: row.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      unsubscribeUrl: unsub,
      oneClickUrl: oneClick,
    });

    if (result.ok) {
      summary.sent += 1;
      await db.from("email_log").update({ provider_id: result.id }).eq("id", claim.data.id);
    } else {
      // Hand the claim back, so the next run can try again rather than the
      // ledger recording a message nobody received.
      summary.failed += 1;
      summary.errors.push(`${row.email} (${row.kind}): ${result.error}`);
      await db.from("email_log").delete().eq("id", claim.data.id);
    }

    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }

  return summary;
}
