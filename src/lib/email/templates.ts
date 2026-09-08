/**
 * The four messages, as HTML and as text.
 *
 * Every one is built from rows the app already has. Nothing here invents a
 * number: a results mail that rounds, or a preview that names a game the board
 * does not carry, is worse than no mail, because the reader checks it against
 * the site and stops trusting both.
 *
 * The markup is deliberately plain — tables and inline styles, no flexbox, no
 * external stylesheet. Outlook renders through Word, Gmail strips <style>, and
 * a layout that survives both is one that stopped trying to be a web page.
 */

export type Recipient = { name: string; email: string };

export type ResultsData = {
  leagueName: string;
  week: number;
  /** Where the reader placed, and what they scored. */
  rank: number | null;
  points: number;
  correct: number;
  played: number;
  wonWeek: boolean;
  /** Whoever took the week, for the line that says who to beat. */
  winnerName: string | null;
  winnerPoints: number | null;
};

export type PreviewData = {
  leagueName: string;
  week: number;
  /** Absent when the board has no featured game yet. */
  matchup: { away: string; home: string; awayRank: number | null; homeRank: number | null } | null;
  kickoff: string;
};

export type ReminderData = {
  leagueName: string;
  week: number;
  remaining: number;
  lockAt: string;
  /** True for the five-hour message, which says so rather than nagging twice. */
  lastCall: boolean;
};

const BRAND = "#256240";
const INK = "#16181c";
const MUTED = "#666a72";

function layout(body: string, cta: { href: string; label: string }, unsubscribeUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eceeeb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceeeb;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<tr><td style="font-weight:700;font-size:15px;padding-bottom:18px;">&#127944; PickemWeekly</td></tr>
<tr><td style="font-size:15px;line-height:1.55;">${body}</td></tr>
<tr><td style="padding-top:24px;">
  <a href="${cta.href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px;">${cta.label}</a>
</td></tr>
<tr><td style="padding-top:26px;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid #e3e3df;margin-top:20px;">
  You get this because you are in a PickemWeekly league.
  <a href="${unsubscribeUrl}" style="color:${MUTED};">Unsubscribe</a>.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** "#3 Georgia" or just "Georgia". */
function ranked(name: string, rank: number | null): string {
  return rank ? `#${rank} ${name}` : name;
}

export function resultsEmail(to: Recipient, d: ResultsData, leagueUrl: string, unsub: string) {
  const placed = d.rank ? `You finished ${ordinal(d.rank)}` : "You did not have a scored board";
  const headline = d.wonWeek
    ? `You won week ${d.week}.`
    : `Week ${d.week} is in the books.`;

  const chase =
    d.winnerName && !d.wonWeek
      ? ` ${esc(d.winnerName)} took the week with ${d.winnerPoints} points.`
      : "";

  const body =
    `<p style="margin:0 0 12px;font-size:19px;font-weight:700;">${esc(headline)}</p>` +
    `<p style="margin:0 0 10px;">${esc(d.leagueName)} &middot; Week ${d.week}</p>` +
    `<p style="margin:0;">${placed} with <b>${d.points} points</b>, ` +
    `getting <b>${d.correct} of ${d.played}</b> right.${chase}</p>`;

  const text =
    `${headline}\n${d.leagueName} - Week ${d.week}\n\n` +
    `${placed} with ${d.points} points, getting ${d.correct} of ${d.played} right.` +
    (chase ? chase.replace(/<[^>]+>/g, "") : "") +
    `\n\nStandings: ${leagueUrl}\n\nUnsubscribe: ${unsub}`;

  return {
    subject: d.wonWeek
      ? `You won week ${d.week} in ${d.leagueName}`
      : `Week ${d.week} results — ${d.leagueName}`,
    html: layout(body, { href: leagueUrl, label: "See the standings" }, unsub),
    text,
  };
}

export function previewEmail(to: Recipient, d: PreviewData, leagueUrl: string, unsub: string) {
  const game = d.matchup
    ? `${ranked(d.matchup.away, d.matchup.awayRank)} at ${ranked(d.matchup.home, d.matchup.homeRank)}`
    : null;

  const body =
    `<p style="margin:0 0 12px;font-size:19px;font-weight:700;">Week ${d.week}&rsquo;s matchup of the week</p>` +
    (game
      ? `<p style="margin:0 0 10px;font-size:17px;font-weight:600;">${esc(game)}</p>` +
        `<p style="margin:0 0 10px;color:${MUTED};">${esc(d.kickoff)}</p>`
      : `<p style="margin:0 0 10px;">The week ${d.week} board is up.</p>`) +
    `<p style="margin:0;">It is worth <b>2.5&times;</b> in ${esc(d.leagueName)}, so it is the one to get right.</p>`;

  const text =
    `Week ${d.week}'s matchup of the week\n\n` +
    (game ? `${game}\n${d.kickoff}\n\n` : `The week ${d.week} board is up.\n\n`) +
    `It is worth 2.5x in ${d.leagueName}, so it is the one to get right.\n\n` +
    `Make your picks: ${leagueUrl}\n\nUnsubscribe: ${unsub}`;

  return {
    subject: game ? `Matchup of the week: ${game}` : `Week ${d.week} is up — ${d.leagueName}`,
    html: layout(body, { href: leagueUrl, label: "Make your picks" }, unsub),
    text,
  };
}

export function reminderEmail(to: Recipient, d: ReminderData, picksUrl: string, unsub: string) {
  const headline = d.lastCall
    ? `Picks close in a few hours.`
    : `You have not made your week ${d.week} picks.`;

  const body =
    `<p style="margin:0 0 12px;font-size:19px;font-weight:700;">${esc(headline)}</p>` +
    `<p style="margin:0 0 10px;">${esc(d.leagueName)} &middot; Week ${d.week}</p>` +
    `<p style="margin:0;"><b>${d.remaining} ${d.remaining === 1 ? "game" : "games"}</b> still open. ` +
    `The board locks at first kickoff, ${esc(d.lockAt)}.</p>`;

  const text =
    `${headline}\n${d.leagueName} - Week ${d.week}\n\n` +
    `${d.remaining} ${d.remaining === 1 ? "game" : "games"} still open. ` +
    `The board locks at first kickoff, ${d.lockAt}.\n\n` +
    `Make your picks: ${picksUrl}\n\nUnsubscribe: ${unsub}`;

  return {
    subject: d.lastCall
      ? `Last call: week ${d.week} picks in ${d.leagueName}`
      : `Your week ${d.week} picks — ${d.leagueName}`,
    html: layout(body, { href: picksUrl, label: "Make your picks" }, unsub),
    text,
  };
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
