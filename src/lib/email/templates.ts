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

import { FEATURED_MULTIPLIER } from "@/lib/format";

export type Recipient = { name: string; email: string };

/** One line of the week's table. */
export type StandingRow = {
  /** 1-based, and positional — the same number the Rankings page prints. */
  position: number;
  name: string;
  points: number;
  correct: number;
  incorrect: number;
  isYou: boolean;
};

/**
 * Every message is a list of leagues, because a reader is.
 *
 * Somebody in five leagues used to get five of each message, and because the
 * 2.5x game is picked by rank it was very often the same game in four of them
 * — four all but identical emails, delivered inside a second, which is the
 * shape a mail client clusters and a reader reports. One message covering the
 * lot answers the same questions and arrives once.
 *
 * A single league renders exactly as it did before. That is the common case by
 * a distance, and it was worth not spending it to fix the rarer one.
 */
export type ResultsData = {
  leagueName: string;
  /** Where this league's standings live. */
  url: string;
  week: number;
  /** Where the reader placed. Null only if the league has no rows at all. */
  position: number | null;
  wonWeek: boolean;
  /** Everybody, in the league's own order. */
  standings: StandingRow[];
};

export type PreviewData = {
  leagueName: string;
  /** Where this league's picks page lives. */
  url: string;
  week: number;
  /** Absent when the board has no featured game yet. */
  matchup: {
    away: string;
    awayRank: number | null;
    awayLogo: string | null;
    home: string;
    homeRank: number | null;
    homeLogo: string | null;
    venue: string | null;
    /** Changes the sentence: a neutral-site game is not played "at" anybody. */
    neutralSite: boolean;
    broadcast: string | null;
  } | null;
  kickoff: string;
};

export type ReminderData = {
  leagueName: string;
  /** Where this league's picks page lives. */
  url: string;
  week: number;
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

/**
 * The heading that names a league inside a multi-league message.
 *
 * Absent when there is only one, because the message is already about it and a
 * heading would just be the subject line printed twice.
 */
function leagueHeading(name: string, first: boolean): string {
  return (
    `<p style="margin:${first ? "0" : "26px"} 0 2px;padding-top:${first ? "0" : "20px"};` +
    `${first ? "" : `border-top:1px solid #e3e3df;`}` +
    `font-size:12px;letter-spacing:0.06em;text-transform:uppercase;` +
    `color:${MUTED};font-weight:650;">${esc(name)}</p>`
  );
}

/** "matchup" or "matchups", and the rest of the sentence around it. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The week, told twice: where the reader finished, then the whole table.
 *
 * These were two emails — one for the winner, one for everybody else, each
 * naming the winner in prose. The table makes that line redundant and answers
 * the question the prose could not: not just who won, but where everyone landed
 * and by how much. A pick'em is a league, and a league is a table.
 *
 * The order and the numbering are the Rankings page's, deliberately: points
 * first, then name, numbered by position. An email that disagrees with the page
 * it links to is worse than one that says less.
 */
export function resultsEmail(
  to: Recipient,
  leagues: ResultsData[],
  dashboardUrl: string,
  unsub: string,
) {
  const many = leagues.length > 1;
  const week = leagues[0].week;
  const won = leagues.filter((d) => d.wonWeek);

  const placing = (d: ResultsData) =>
    d.wonWeek
      ? `You won week ${d.week}.`
      : d.position
        ? `You finished ${ordinal(d.position)} in week ${d.week}.`
        : `Week ${d.week} is in the books.`;

  const section = (d: ResultsData, first: boolean) => {
    const rows = d.standings
      .map((row) => {
        const bg = row.isYou ? "background:#f1f8f2;" : "";
        const weight = row.isYou ? "font-weight:700;" : "";
        return (
          `<tr>` +
          `<td style="${bg}${weight}padding:7px 8px;border-top:1px solid #e3e3df;color:${MUTED};width:34px;">${row.position}</td>` +
          `<td style="${bg}${weight}padding:7px 8px;border-top:1px solid #e3e3df;">${esc(row.name)}</td>` +
          `<td align="right" style="${bg}${weight}padding:7px 8px;border-top:1px solid #e3e3df;">${row.points.toLocaleString()}</td>` +
          `<td align="right" style="${bg}${weight}padding:7px 8px;border-top:1px solid #e3e3df;color:${MUTED};">${row.correct}&ndash;${row.incorrect}</td>` +
          `</tr>`
        );
      })
      .join("");

    const table =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="border-collapse:collapse;font-size:14px;margin-top:16px;">` +
      `<tr>` +
      `<th align="left" style="padding:0 8px 6px;font-size:11px;letter-spacing:0.06em;` +
      `text-transform:uppercase;color:${MUTED};font-weight:650;">#</th>` +
      `<th align="left" style="padding:0 8px 6px;font-size:11px;letter-spacing:0.06em;` +
      `text-transform:uppercase;color:${MUTED};font-weight:650;">Member</th>` +
      `<th align="right" style="padding:0 8px 6px;font-size:11px;letter-spacing:0.06em;` +
      `text-transform:uppercase;color:${MUTED};font-weight:650;">Points</th>` +
      `<th align="right" style="padding:0 8px 6px;font-size:11px;letter-spacing:0.06em;` +
      `text-transform:uppercase;color:${MUTED};font-weight:650;">Record</th>` +
      `</tr>${rows}</table>`;

    // With one league the placing is the headline and stands above everything.
    // With several it belongs to its own table, under the league's name.
    return many
      ? leagueHeading(d.leagueName, first) +
        `<p style="margin:0;font-weight:700;">${esc(placing(d))}</p>` +
        table
      : `<p style="margin:0 0 12px;font-size:19px;font-weight:700;">${esc(placing(d))}</p>` +
        `<p style="margin:0;">${esc(d.leagueName)} &middot; Week ${d.week}</p>` +
        table;
  };

  const body =
    (many
      ? `<p style="margin:0 0 16px;font-size:19px;font-weight:700;">` +
        `${won.length > 0 ? `You won week ${week}.` : `Week ${week} is in the books.`}</p>`
      : "") + leagues.map((d, i) => section(d, i === 0)).join("");

  const text =
    (many ? `Week ${week} results\n\n` : "") +
    leagues
      .map((d) => {
        const width = Math.max(...d.standings.map((r) => r.name.length), 6);
        return (
          `${many ? `${d.leagueName}\n` : ""}${placing(d)}` +
          `${many ? "" : `\n${d.leagueName} - Week ${d.week}`}\n\n` +
          d.standings
            .map(
              (r) =>
                `${String(r.position).padStart(2)}. ${r.name.padEnd(width)}  ` +
                `${String(r.points).padStart(5)}  ${r.correct}-${r.incorrect}` +
                (r.isYou ? "   <- you" : ""),
            )
            .join("\n") +
          `\n\nStandings: ${d.url}\n`
        );
      })
      .join("\n") +
    `\nUnsubscribe: ${unsub}`;

  // Winning is the best thing in the message and belongs in the subject. With
  // several leagues it names the one that was won rather than counting them.
  const subject = many
    ? won.length > 0
      ? `You won week ${week} in ${won[0].leagueName}`
      : `Week ${week} results`
    : leagues[0].wonWeek
      ? `You won week ${week} in ${leagues[0].leagueName}`
      : `Week ${week} results — ${leagues[0].leagueName}`;

  return {
    subject,
    html: layout(
      body,
      { href: many ? dashboardUrl : leagues[0].url, label: "See the standings" },
      unsub,
    ),
    text,
  };
}

/**
 * The multiplier game, drawn rather than described.
 *
 * Crests, ranks, where it is played and when. The logos are remote images and
 * most clients block those until the reader says otherwise, so each school is
 * printed underneath its crest as text — with images off this still reads as a
 * matchup, which is the only version of it some people will ever see.
 */
export function previewEmail(
  to: Recipient,
  leagues: PreviewData[],
  dashboardUrl: string,
  unsub: string,
) {
  const many = leagues.length > 1;
  const week = leagues[0].week;

  const section = (d: PreviewData, first: boolean) => {
    const m = d.matchup;

    const side = (name: string, rank: number | null, logo: string | null) =>
      `<td align="center" valign="middle" width="40%" style="padding:12px 4px 4px;">` +
      (logo
        // alt is deliberately empty. The school is printed directly underneath, so
        // the crest carries nothing the text does not — and with images blocked,
        // which is most clients until the reader says otherwise, alt text here
        // put the name on the row twice and overflowed the column doing it.
        ? `<img src="${esc(logo)}" width="56" height="56" alt="" ` +
          `style="display:block;margin:0 auto 8px;width:56px;height:56px;" />`
        : "") +
      (rank ? `<span style="color:${MUTED};font-weight:700;font-size:13px;">#${rank}</span> ` : "") +
      `<span style="font-weight:700;font-size:15px;">${esc(name)}</span>` +
      `</td>`;

    // Where it is played, and the fact that a neutral site is one. "Louisville at
    // Ole Miss" is simply untrue of a game in Nashville.
    const place = m
      ? [m.venue, m.neutralSite ? "neutral site" : null].filter(Boolean).join(" &middot; ")
      : "";
    const when = m ? [d.kickoff, m.broadcast].filter(Boolean).join(" &middot; ") : d.kickoff;

    const card = m
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
        `style="border-collapse:collapse;margin:18px 0 14px;background:#f7f8f6;border-radius:10px;">` +
        `<tr>${side(m.away, m.awayRank, m.awayLogo)}` +
        `<td align="center" valign="middle" width="20%" style="color:${MUTED};font-size:13px;padding:4px;">` +
        `${m.neutralSite ? "vs" : "at"}</td>` +
        `${side(m.home, m.homeRank, m.homeLogo)}</tr>` +
        `<tr><td colspan="3" align="center" style="padding:2px 12px 14px;color:${MUTED};font-size:13px;line-height:1.5;">` +
        `${when}${place ? `<br />${place}` : ""}</td></tr>` +
        `</table>`
      : `<p style="margin:0 0 10px;">The week ${d.week} board is up.</p>`;

    return (
      (many ? leagueHeading(d.leagueName, first) : "") +
      card +
      `<p style="margin:0;">It is worth <b>${FEATURED_MULTIPLIER}&times; Points</b> in ` +
      `${esc(d.leagueName)}, so it is the one to get right.</p>`
    );
  };

  const heading =
    `Week ${week}&rsquo;s ${plural(leagues.length, "matchup", "matchups")} of the week`;

  const body =
    `<p style="margin:0 0 4px;font-size:19px;font-weight:700;">${heading}</p>` +
    leagues.map((d, i) => section(d, i === 0)).join("");

  const text =
    `Week ${week}'s ${plural(leagues.length, "matchup", "matchups")} of the week\n\n` +
    leagues
      .map((d) => {
        const m = d.matchup;
        const game = m
          ? `${ranked(m.away, m.awayRank)} ${m.neutralSite ? "vs" : "at"} ${ranked(m.home, m.homeRank)}`
          : null;
        return (
          (many ? `${d.leagueName}\n` : "") +
          (game
            ? `${game}\n${d.kickoff}${m?.broadcast ? ` - ${m.broadcast}` : ""}\n` +
              `${[m?.venue, m?.neutralSite ? "neutral site" : null].filter(Boolean).join(" - ")}\n\n`
            : `The week ${d.week} board is up.\n\n`) +
          `It is worth ${FEATURED_MULTIPLIER}x Points in ${d.leagueName}, so it is the one to get right.\n\n` +
          `Make your picks: ${d.url}\n`
        );
      })
      .join("\n") +
    `\nUnsubscribe: ${unsub}`;

  // One league keeps the subject that names the game. Several cannot — they are
  // often the same game, and listing five would not fit an inbox column anyway.
  const only = leagues[0];
  const onlyGame = only.matchup
    ? `${ranked(only.matchup.away, only.matchup.awayRank)} ` +
      `${only.matchup.neutralSite ? "vs" : "at"} ` +
      `${ranked(only.matchup.home, only.matchup.homeRank)}`
    : null;

  const subject = many
    ? `Your matchups of the week`
    : onlyGame
      ? `Matchup of the week: ${onlyGame}`
      : `Week ${week} is up — ${only.leagueName}`;

  return {
    subject,
    html: layout(
      body,
      { href: many ? dashboardUrl : only.url, label: "Make your picks" },
      unsub,
    ),
    text,
  };
}

export function reminderEmail(
  to: Recipient,
  leagues: ReminderData[],
  dashboardUrl: string,
  unsub: string,
) {
  const many = leagues.length > 1;
  const week = leagues[0].week;
  const lastCall = leagues[0].lastCall;

  const headline = lastCall
    ? `Picks close in a few hours.`
    : many
      ? `You have not made your week ${week} picks in ${leagues.length} leagues.`
      : `You have not made your week ${week} picks.`;

  // No count of games left. Picks are submitted once, and whatever has kicked
  // off by then is gone — so "9 games still open" would be both a moving number
  // and a target nobody can hit once the first game starts.
  const body =
    `<p style="margin:0 0 12px;font-size:19px;font-weight:700;">${esc(headline)}</p>` +
    (many
      ? leagues
          .map(
            (d) =>
              `<p style="margin:0 0 6px;">` +
              `<b>${esc(d.leagueName)}</b> &middot; first game ${esc(d.lockAt)}</p>`,
          )
          .join("") +
        `<p style="margin:12px 0 0;">Picks go in once, and each game closes at its own kickoff.</p>`
      : `<p style="margin:0 0 10px;">${esc(leagues[0].leagueName)} &middot; Week ${week}</p>` +
        `<p style="margin:0;">Picks go in once, and each game closes at its own kickoff. ` +
        `The first is ${esc(leagues[0].lockAt)}.</p>`);

  const text =
    `${headline}\n\n` +
    (many
      ? leagues.map((d) => `${d.leagueName} - first game ${d.lockAt}\n  ${d.url}`).join("\n") +
        `\n\nPicks go in once, and each game closes at its own kickoff.\n`
      : `${leagues[0].leagueName} - Week ${week}\n\n` +
        `Picks go in once, and each game closes at its own kickoff. ` +
        `The first is ${leagues[0].lockAt}.\n\n` +
        `Make your picks: ${leagues[0].url}\n`) +
    `\nUnsubscribe: ${unsub}`;

  const subject = lastCall
    ? many
      ? `Last call: week ${week} picks`
      : `Last call: week ${week} picks in ${leagues[0].leagueName}`
    : many
      ? `Your week ${week} picks`
      : `Your week ${week} picks — ${leagues[0].leagueName}`;

  return {
    subject,
    html: layout(
      body,
      { href: many ? dashboardUrl : leagues[0].url, label: "Make your picks" },
      unsub,
    ),
    text,
  };
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
