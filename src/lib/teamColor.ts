/** Neutral fill for the handful of teams ESPN gives us no colour for. */
const FALLBACK = "#4a5058";

function channel(hex: string, from: number): number {
  return parseInt(hex.slice(from, from + 2), 16) / 255;
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const linear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return (
    0.2126 * linear(channel(hex, 1)) +
    0.7152 * linear(channel(hex, 3)) +
    0.0722 * linear(channel(hex, 5))
  );
}

export function teamFill(color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK;
}

/**
 * Text colour to lay over a team's fill.
 *
 * Most school primaries are dark enough for white, but a few are not — Iowa's
 * gold and Missouri's yellow among them — and white on those is unreadable.
 * Rather than pick a threshold, this compares the contrast ratio each way and
 * takes the better one, so it stays correct whatever ESPN returns.
 */
export function teamInk(color: string | null | undefined): string {
  const fill = teamFill(color);
  const l = luminance(fill);
  const againstWhite = 1.05 / (l + 0.05);
  const againstBlack = (l + 0.05) / 0.05;
  return againstWhite >= againstBlack ? "#ffffff" : "#12151a";
}

/** The same hue at partial strength, for the stretch of bar past the badge. */
export function teamWash(color: string | null | undefined, alpha: number): string {
  const fill = teamFill(color);
  const r = Math.round(channel(fill, 1) * 255);
  const g = Math.round(channel(fill, 3) * 255);
  const b = Math.round(channel(fill, 5) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
