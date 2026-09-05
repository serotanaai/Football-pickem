import type { TickerGame } from "@/lib/ticker";

/**
 * Every sentence the ticker and the hero counter can say.
 *
 * They live together, away from the components, because both the server render
 * and the client's own tick have to produce the same string from the same data
 * — and because a number typed into a component is a number that stops being
 * true the moment the data moves.
 */

/** A rank as it prefixes a team name, or nothing at all. */
function rankPrefix(rank: number | null): string {
  return typeof rank === "number" && rank > 0 ? `#${rank} ` : "";
}

function side(name: string, rank: number | null, score: number | null): string {
  return `${rankPrefix(rank)}${name} ${score ?? 0}`;
}

/**
 * A countdown in at most two units, skipping any that are zero.
 *
 * Days and hours are dropped as they run out rather than shown as "0d", so the
 * line shortens on its own as kickoff gets close.
 */
export function countdownParts(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const units: string[] = [];
  if (days > 0) units.push(`${days}d`);
  if (hours > 0) units.push(`${hours}h`);
  if (minutes > 0) units.push(`${minutes}m`);

  // Under a minute there is nothing non-zero left to show, and "kicks off in"
  // followed by silence reads as broken.
  if (units.length === 0) return "under a minute";
  return units.slice(0, 2).join(" ");
}

export function countdownLine(week: number, msRemaining: number): string {
  return `Week ${week} kicks off in ${countdownParts(msRemaining)}`;
}

/**
 * `short` swaps full school names for their abbreviations. Same sentence, same
 * data — a narrow screen just cannot hold "Ohio State 21, Texas 17 — 3rd 4:22"
 * without cutting the clock off the end, and the clock is the part that makes
 * it a live score rather than a result.
 */
export function liveLine(game: TickerGame, short = false): string {
  const home = short ? game.homeAbbr : game.homeTeam;
  const away = short ? game.awayAbbr : game.awayTeam;
  const clock = [game.period ? periodLabel(game.period) : null, game.clock]
    .filter(Boolean)
    .join(" ");
  const head = `🔴 LIVE — ${side(home, game.homeRank, game.homeScore)}, ${side(
    away,
    game.awayRank,
    game.awayScore,
  )}`;
  return clock ? `${head} — ${clock}` : head;
}

export function finalLine(game: TickerGame, short = false): string {
  const home = short ? game.homeAbbr : game.homeTeam;
  const away = short ? game.awayAbbr : game.awayTeam;
  return `FINAL — ${side(home, game.homeRank, game.homeScore)}, ${side(
    away,
    game.awayRank,
    game.awayScore,
  )}`;
}

/** 1 through 4 are quarters; anything past that is overtime. */
export function periodLabel(period: number): string {
  if (period <= 4) return `${["1st", "2nd", "3rd", "4th"][period - 1]}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/** The two best matchups of a finished week, then a count of the rest. */
export function recapLine(week: number, games: TickerGame[], total: number, short = false): string {
  const shown = games
    .slice(0, 2)
    .map((g) => {
      const home = short ? g.homeAbbr : g.homeTeam;
      const away = short ? g.awayAbbr : g.awayTeam;
      return `${home} ${g.homeScore ?? 0} — ${away} ${g.awayScore ?? 0}`;
    })
    .join(" · ");
  const rest = total - Math.min(2, games.length);
  return `Week ${week} final: ${shown}${rest > 0 ? ` · +${rest} more` : ""}`;
}

export function pendingLine(week: number): string {
  return `Week ${week} matchups drop soon`;
}

/**
 * The hero's social proof.
 *
 * Below the cutoff the wording drops the seasonal claim: "so far" is honest
 * about a number that is small because the season is young, where "this season"
 * next to a two-digit count reads as a season nobody is playing.
 */
export const PICK_COUNT_THRESHOLD = 500;

export function pickCountLine(count: number): string {
  const n = count.toLocaleString();
  return count >= PICK_COUNT_THRESHOLD
    ? `${n} picks made this season`
    : `${n} picks made so far`;
}
