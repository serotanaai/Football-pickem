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

export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
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
