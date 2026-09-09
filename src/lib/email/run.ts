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
  /**
   * What the environment says, whatever this particular run decided.
   *
   * `live` is the decision, and a dry run forces it false — which makes it
   * useless for the one question worth asking before going live: is the
   * switch even on? Reading that off a dry run used to be impossible, so the
   * only way to find out was to send.
   */
  emailLive: boolean;
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
  /**
   * Send only this kind. Lets the sequence be turned on a piece at a time —
   * previews this week, the rest once they have been watched land — without
   * the schedule quietly deciding to send the other three on your behalf.
   */
  onlyKind?: EmailKind;
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
    emailLive: EMAIL_LIVE,
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

  const due = (dueRows ?? []).filter(
    (row) =>
      (!options.onlyTo || row.email === options.onlyTo) &&
      (!options.onlyKind || row.kind === options.onlyKind),
  );
  summary.due = due.length;
  if (due.length === 0) return summary;

  // Everything the messages need, in a handful of queries rather than one per
  // recipient — a league of forty is forty identical lookups otherwise.
  const userIds = [...new Set(due.map((r) => r.user_id))];
  const leagueIds = [...new Set(due.map((r) => r.league_id))];
  const weeks = [...new Set(due.map((r) => r.week))];

  const [tokens, boards, standings, submissions, memberships] = await Promise.all([
    db.from("profiles").select("id, unsubscribe_token").in("id", userIds),
    db
      .from("league_weeks")
      .select("league_id, week, game_count, featured_game_id, lock_at")
      .in("league_id", leagueIds)
      .in("week", weeks),
    db
      .from("weekly_results_ranked")
      .select("league_id, week, user_id, points, correct, incorrect, picks_made, week_rank, week_won")
      .in("league_id", leagueIds)
      .in("week", weeks),
    db
      .from("pick_submissions")
      .select("league_id, week, user_id, pick_count")
      .in("league_id", leagueIds)
      .in("week", weeks),
    // Everybody in the league, not only everybody who picked. A member who sat
    // the week out belongs in the table on nil — the Rankings page shows them,
    // and an email that disagrees with the page it links to is worse than one
    // that says less.
    db.from("league_members").select("league_id, user_id").in("league_id", leagueIds),
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
  type Featured = {
    away: string; awayRank: number | null; awayLogo: string | null;
    home: string; homeRank: number | null; homeLogo: string | null;
    venue: string | null; neutralSite: boolean; broadcast: string | null;
    start: string;
  };
  const gameOf = new Map<number, Featured>();
  if (featuredIds.length > 0) {
    const { data: games } = await db
      .from("games")
      .select(
        "id, start_time, home_team_id, away_team_id, home_rank, away_rank, venue, neutral_site, broadcast",
      )
      .in("id", featuredIds);
    const teamIds = [...new Set((games ?? []).flatMap((g) => [g.home_team_id, g.away_team_id]))];
    const { data: teams } = await db.from("teams").select("id, school, logo").in("id", teamIds);
    const team = new Map((teams ?? []).map((t) => [t.id, t]));
    for (const g of games ?? []) {
      gameOf.set(g.id, {
        away: team.get(g.away_team_id)?.school ?? "TBD",
        awayRank: g.away_rank,
        awayLogo: team.get(g.away_team_id)?.logo ?? null,
        home: team.get(g.home_team_id)?.school ?? "TBD",
        homeRank: g.home_rank,
        homeLogo: team.get(g.home_team_id)?.logo ?? null,
        venue: g.venue,
        neutralSite: g.neutral_site === true,
        broadcast: g.broadcast,
        start: g.start_time,
      });
    }
  }

  // Display names for everybody, so the week's table can be built from the roster.
  const { data: names } = await db.from("profiles").select("id, display_name");
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.display_name ?? "Someone"]));
  const scoreOf = new Map(
    (standings.data ?? [])
      .filter((r) => r.league_id && typeof r.week === "number" && r.user_id)
      .map((r) => [`${r.league_id}:${r.week}:${r.user_id}`, r]),
  );

  // The week's table, per league-week, sorted and numbered exactly as the
  // Rankings page does it: points first, then name, positional numbering.
  const tableOf = new Map<string, { user_id: string; name: string; points: number; correct: number; incorrect: number; rank: number | null }[]>();
  for (const week of weeks) {
    for (const leagueId of leagueIds) {
      const rows = (memberships.data ?? [])
        .filter((m) => m.league_id === leagueId)
        .map((m) => {
          const score = scoreOf.get(`${leagueId}:${week}:${m.user_id}`);
          return {
            user_id: m.user_id,
            name: nameOf.get(m.user_id) ?? "Someone",
            points: score?.points ?? 0,
            correct: score?.correct ?? 0,
            incorrect: score?.incorrect ?? 0,
            rank: score?.week_rank ?? null,
          };
        })
        // week_rank, not position. Two members level on points are separated by
        // the league's own tiebreak, and only week_rank knows how — sorting on
        // points and falling back to the alphabet would have put the member who
        // actually won the week second in a table headed "You won week 1".
        // A member who did not pick has no rank and sits at the bottom.
        .sort(
          (a, b) =>
            (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
            b.points - a.points ||
            a.name.localeCompare(b.name),
        );
      if (rows.length > 0) tableOf.set(`${leagueId}:${week}`, rows);
    }
  }

  // One message per person per kind per week, however many leagues that is —
  // except results, which stay one per league.
  //
  // due_emails answers per league-member, because that is what the ledger is
  // keyed on and what "already sent" has to mean. But a reader is not a league
  // membership: five leagues used to mean five near-identical emails inside one
  // second. So the rows are grouped here, at the last possible moment, leaving
  // the ledger — and therefore every already-sent guarantee — exactly as it was.
  //
  // Results are the exception on purpose. A preview repeats itself across
  // leagues, because the 2.5x game is picked by rank and is often the same
  // game; there is nothing to lose by folding those together. A result does
  // not repeat — every league has its own table, its own winner and its own
  // finish for the reader — and five of those stacked in one message buries
  // the four below the fold. They are worth an inbox line each.
  const GROUPED = new Set<EmailKind>(["preview", "reminder", "last_call"]);

  const groups = new Map<string, typeof due>();
  for (const row of due) {
    const k = GROUPED.has(row.kind)
      ? `${row.user_id}:${row.kind}:${row.week}`
      : `${row.user_id}:${row.kind}:${row.week}:${row.league_id}`;
    const bucket = groups.get(k);
    if (bucket) bucket.push(row);
    else groups.set(k, [row]);
  }

  for (const rows of groups.values()) {
    const head = rows[0];
    const token = tokenOf.get(head.user_id);
    if (!token) {
      summary.errors.push(`no unsubscribe token for ${head.user_id}`);
      continue;
    }

    const unsub = `${base}/unsubscribe/${token}`;
    const oneClick = `${base}/api/unsubscribe/${token}`;
    const dashboard = `${base}/dashboard`;
    const to = { name: head.display_name, email: head.email };

    // A league whose board the reader has since picked drops out of a reminder,
    // and if that empties the group there is nothing left to send.
    const covered =
      head.kind === "results" || head.kind === "preview"
        ? rows
        : rows.filter((r) => !pickedOf.has(`${r.league_id}:${r.week}:${r.user_id}`));

    if (covered.length === 0) {
      summary.skipped += rows.length;
      continue;
    }

    // Same order everywhere: the board that locks first is the one that matters
    // first, and a stable order keeps two runs from disagreeing about layout.
    covered.sort((a, b) =>
      (a.lock_at ?? "").localeCompare(b.lock_at ?? "") ||
      a.league_name.localeCompare(b.league_name),
    );

    let built: { subject: string; html: string; text: string };

    if (head.kind === "results") {
      built = resultsEmail(
        to,
        covered.map((row) => {
          const mine = scoreOf.get(`${row.league_id}:${row.week}:${row.user_id}`);
          const table = tableOf.get(key(row.league_id, row.week)) ?? [];
          const standings = table.map((r, index) => ({
            position: r.rank ?? index + 1,
            name: r.name,
            points: r.points,
            correct: r.correct,
            incorrect: r.incorrect,
            isYou: r.user_id === row.user_id,
          }));
          return {
            leagueName: row.league_name,
            url: `${base}/leagues/${row.league_slug}`,
            week: row.week,
            position: standings.find((r) => r.isYou)?.position ?? null,
            wonWeek: mine?.week_won === true,
            standings,
          };
        }),
        dashboard,
        unsub,
      );
    } else if (head.kind === "preview") {
      built = previewEmail(
        to,
        covered.map((row) => {
          const board = boardOf.get(key(row.league_id, row.week));
          const featured = board?.featured_game_id ? gameOf.get(board.featured_game_id) : undefined;
          return {
            leagueName: row.league_name,
            url: `${base}/leagues/${row.league_slug}/picks`,
            week: row.week,
            matchup: featured
              ? {
                  away: featured.away,
                  awayRank: featured.awayRank,
                  awayLogo: featured.awayLogo,
                  home: featured.home,
                  homeRank: featured.homeRank,
                  homeLogo: featured.homeLogo,
                  venue: featured.venue,
                  neutralSite: featured.neutralSite,
                  broadcast: featured.broadcast,
                }
              : null,
            kickoff: whenText(featured?.start ?? row.lock_at),
          };
        }),
        dashboard,
        unsub,
      );
    } else {
      built = reminderEmail(
        to,
        covered.map((row) => ({
          leagueName: row.league_name,
          url: `${base}/leagues/${row.league_slug}/picks`,
          week: row.week,
          lockAt: whenText(row.lock_at),
          lastCall: row.kind === "last_call",
        })),
        dashboard,
        unsub,
      );
    }

    summary.byKind[head.kind] = (summary.byKind[head.kind] ?? 0) + covered.length;
    summary.planned.push({ kind: head.kind, to: head.email, subject: built.subject });

    if (!live) continue;

    // Claim every league this message covers, in one statement. A unique
    // violation on any of them means another run already owns part of the
    // group, so none of it is claimed and none of it is sent — the next run
    // sees whatever is genuinely left and sends that instead.
    const claim = await db
      .from("email_log")
      .insert(
        covered.map((row) => ({
          user_id: row.user_id,
          league_id: row.league_id,
          week: row.week,
          kind: row.kind,
        })),
      )
      .select("id");

    if (claim.error || !claim.data || claim.data.length === 0) {
      summary.skipped += covered.length;
      continue;
    }

    const result = await sendEmail({
      to: head.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      unsubscribeUrl: unsub,
      oneClickUrl: oneClick,
    });

    const ids = claim.data.map((r) => r.id);

    if (result.ok) {
      summary.sent += 1;
      await db.from("email_log").update({ provider_id: result.id }).in("id", ids);
    } else {
      // Hand the whole claim back, so the next run can try again rather than
      // the ledger recording a message nobody received.
      summary.failed += 1;
      summary.errors.push(`${head.email} (${head.kind}): ${result.error}`);
      await db.from("email_log").delete().in("id", ids);
    }

    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }

  return summary;
}
