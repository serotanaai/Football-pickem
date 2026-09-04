import type { LeagueScope } from "@/lib/database.types";

/** Points awarded for one correct pick. */
export const POINTS_PER_PICK = 100;

export function scopeLabel(scope: LeagueScope, conferenceName?: string | null): string {
  switch (scope) {
    case "conference":
      return conferenceName ? `${conferenceName} games` : "Conference games";
    case "top25":
      return "Top 25 games";
    default:
      return "All FBS games";
  }
}

export function scopeBadge(scope: LeagueScope, conferenceShortName?: string | null): string {
  switch (scope) {
    case "conference":
      return conferenceShortName ?? "Conference";
    case "top25":
      return "Top 25";
    default:
      return "All FBS";
  }
}

// Kickoff times render through <LocalTime>, never here: these run inside server
// components, where the runtime zone is the server's (UTC on Vercel).

/**
 * The football day a game belongs to, always in US Eastern.
 *
 * This groups the pick board into sections, so it has to produce the same
 * answer on the server and in the browser — a viewer-local day would regroup
 * the list on hydration. Kickoff times themselves render in the viewer's own
 * zone via <LocalTime>.
 */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export function displayName(profile: {
  display_name?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!profile) return "Unknown";
  return profile.display_name ?? profile.email?.split("@")[0] ?? "Unknown";
}

export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Championship";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

export function totalPlayoffRounds(playoffTeams: number): number {
  if (playoffTeams === 8) return 3;
  if (playoffTeams === 4) return 2;
  if (playoffTeams === 2) return 1;
  return 0;
}
