/**
 * Thin adapter over ESPN's public college football endpoints.
 *
 * Group 80 is FBS (Division I-A); each conference is a child group of it. These
 * endpoints need no API key, but they are undocumented, so every field is read
 * defensively and anything missing is treated as absent rather than fatal.
 */

import type { GameState } from "@/lib/database.types";

// site.api.espn.com is fronted by an Akamai rule that returns 403 to datacenter
// IPs — verified from Supabase, and it would have hit Vercel too. site.web.api
// serves the identical paths and payloads without that block.
const BASE = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football";

export const FBS_GROUP = 80;

/**
 * ESPN group id -> conference. Mirrors supabase/migrations/0005.
 *
 * Independents (18) belongs here so Notre Dame and UConn count as FBS, but it is
 * flagged not-selectable in the database — a league scoped to it would see one
 * or two games a week.
 */
export const FBS_CONFERENCES: { id: number; name: string; shortName: string }[] = [
  { id: 1, name: "Atlantic Coast Conference", shortName: "ACC" },
  { id: 4, name: "Big 12 Conference", shortName: "Big 12" },
  { id: 5, name: "Big Ten Conference", shortName: "Big Ten" },
  { id: 8, name: "Southeastern Conference", shortName: "SEC" },
  { id: 9, name: "Pac-12 Conference", shortName: "Pac-12" },
  { id: 12, name: "Conference USA", shortName: "C-USA" },
  { id: 15, name: "Mid-American Conference", shortName: "MAC" },
  { id: 17, name: "Mountain West Conference", shortName: "Mountain West" },
  { id: 18, name: "FBS Independents", shortName: "Independents" },
  { id: 37, name: "Sun Belt Conference", shortName: "Sun Belt" },
  { id: 151, name: "American Athletic Conference", shortName: "American" },
];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ESPN request failed (${res.status}) for ${url}`);
  }
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ shapes

type EspnLogo = { href?: string };

type EspnTeam = {
  id?: string;
  conferenceId?: string;
  slug?: string;
  location?: string;
  name?: string;
  nickname?: string;
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  logos?: EspnLogo[];
};

type EspnTeamsResponse = {
  sports?: { leagues?: { teams?: { team?: EspnTeam }[] }[] }[];
};

type EspnCompetitor = {
  id?: string;
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean;
  curatedRank?: { current?: number };
  team?: EspnTeam;
};

type EspnCompetition = {
  neutralSite?: boolean;
  conferenceCompetition?: boolean;
  venue?: { fullName?: string };
  broadcasts?: { names?: string[] }[];
  odds?: { details?: string; overUnder?: number }[];
  competitors?: EspnCompetitor[];
  status?: EspnStatus;
};

type EspnStatus = {
  // Period and clock sit on the status itself, not on status.type.
  period?: number;
  displayClock?: string;
  type?: {
    name?: string;
    state?: "pre" | "in" | "post";
    completed?: boolean;
    shortDetail?: string;
    detail?: string;
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  status?: EspnStatus;
  competitions?: EspnCompetition[];
};

type EspnScoreboard = {
  season?: { year?: number; type?: number };
  week?: { number?: number };
  events?: EspnEvent[];
};

type EspnRankings = {
  rankings?: {
    name?: string;
    shortName?: string;
    type?: string;
    ranks?: { current?: number; points?: number; team?: EspnTeam }[];
  }[];
};

// ----------------------------------------------------------------- outputs

export type NormalizedTeam = {
  id: number;
  slug: string | null;
  school: string;
  mascot: string | null;
  display_name: string;
  abbreviation: string | null;
  color: string | null;
  alt_color: string | null;
  logo: string | null;
  conference_id: number | null;
  is_fbs: boolean;
};

export type NormalizedGame = {
  id: number;
  season: number;
  week: number;
  season_type: number;
  start_time: string;
  name: string | null;
  short_name: string | null;
  neutral_site: boolean;
  conference_game: boolean;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  home_rank: number | null;
  away_rank: number | null;
  status: GameState;
  completed: boolean;
  period: number | null;
  clock: string | null;
  winner_team_id: number | null;
  status_detail: string | null;
  venue: string | null;
  broadcast: string | null;
  odds_details: string | null;
  over_under: number | null;
};

function hex(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? `#${trimmed.toLowerCase()}` : null;
}

const FBS_CONFERENCE_IDS = new Set(FBS_CONFERENCES.map((c) => c.id));

function normalizeTeam(team: EspnTeam): NormalizedTeam | null {
  const id = Number(team.id);
  if (!Number.isFinite(id)) return null;

  // conferenceId covers every division, so FBS membership is just set lookup.
  const conference = Number(team.conferenceId);
  const isFbs = Number.isFinite(conference) && FBS_CONFERENCE_IDS.has(conference);
  const conferenceId = isFbs ? conference : null;

  const school = team.location ?? team.displayName ?? team.name ?? `Team ${id}`;
  const mascot = team.name ?? team.nickname ?? null;

  return {
    id,
    slug: team.slug ?? null,
    school,
    mascot: mascot === school ? null : mascot,
    display_name: team.displayName ?? [school, mascot].filter(Boolean).join(" "),
    abbreviation: team.abbreviation ?? null,
    color: hex(team.color),
    alt_color: hex(team.alternateColor),
    logo: team.logo ?? team.logos?.[0]?.href ?? null,
    conference_id: conferenceId,
    is_fbs: isFbs,
  };
}

/**
 * Every team seen across a range of weeks, conference and division included.
 *
 * The /teams endpoint ignores its `groups` filter on this host and returns all
 * divisions, so the scoreboard is the reliable source — and it already carries
 * conferenceId on each team.
 */
export async function fetchTeamsForWeeks(
  season: number,
  weeks: number[],
): Promise<NormalizedTeam[]> {
  const byId = new Map<number, NormalizedTeam>();

  for (const week of weeks) {
    const { teams } = await fetchWeekGames(season, week);
    for (const team of teams) byId.set(team.id, team);
  }

  return [...byId.values()];
}

function mapStatus(status: EspnStatus | undefined): {
  status: GameState;
  completed: boolean;
} {
  const name = status?.type?.name ?? "";
  if (name === "STATUS_POSTPONED") return { status: "postponed", completed: false };
  if (name === "STATUS_CANCELED") return { status: "canceled", completed: false };

  const state = status?.type?.state;
  const completed = status?.type?.completed === true;
  if (completed || state === "post") return { status: "final", completed };
  if (state === "in") return { status: "in_progress", completed: false };
  return { status: "scheduled", completed: false };
}

function rank(competitor: EspnCompetitor): number | null {
  const value = competitor.curatedRank?.current;
  return typeof value === "number" && value > 0 && value <= 25 ? value : null;
}

function score(competitor: EspnCompetitor): number | null {
  const value = Number(competitor.score);
  return Number.isFinite(value) ? value : null;
}

/**
 * Games plus every team referenced by them, each already tagged with its
 * conference and whether it is FBS.
 */
export async function fetchWeekGames(
  season: number,
  week: number,
  seasonType = 2,
): Promise<{ games: NormalizedGame[]; teams: NormalizedTeam[] }> {
  const data = await getJson<EspnScoreboard>(
    `${BASE}/scoreboard?groups=${FBS_GROUP}&dates=${season}` +
      `&seasontype=${seasonType}&week=${week}&limit=400`,
  );

  const games: NormalizedGame[] = [];
  const teams = new Map<number, NormalizedTeam>();

  for (const event of data.events ?? []) {
    const id = Number(event.id);
    const competition = event.competitions?.[0];
    if (!Number.isFinite(id) || !competition) continue;

    const home = competition.competitors?.find((c) => c.homeAway === "home");
    const away = competition.competitors?.find((c) => c.homeAway === "away");
    if (!home?.team || !away?.team) continue;

    const homeId = Number(home.team.id);
    const awayId = Number(away.team.id);
    if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) continue;

    for (const competitor of [home, away]) {
      const team = normalizeTeam(competitor.team!);
      if (team) teams.set(team.id, team);
    }

    const liveStatus = competition.status ?? event.status;
    const { status, completed } = mapStatus(liveStatus);
    const homeScore = score(home);
    const awayScore = score(away);

    let winner: number | null = null;
    if (completed) {
      if (home.winner) winner = homeId;
      else if (away.winner) winner = awayId;
      else if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
        winner = homeScore > awayScore ? homeId : awayId;
      }
    }

    games.push({
      id,
      season: event.season?.year ?? season,
      week: event.week?.number ?? week,
      season_type: event.season?.type ?? seasonType,
      start_time: event.date ?? new Date().toISOString(),
      name: event.name ?? null,
      short_name: event.shortName ?? null,
      neutral_site: competition.neutralSite === true,
      conference_game: competition.conferenceCompetition === true,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score: homeScore,
      away_score: awayScore,
      home_rank: rank(home),
      away_rank: rank(away),
      status,
      completed,
      // Only meaningful while a game is on: ESPN keeps sending the last values
      // after a final, and a ticker that says "4th 0:00" next to a final score
      // is worse than one that says nothing.
      period: status === "in_progress" ? (liveStatus?.period ?? null) : null,
      clock: status === "in_progress" ? (liveStatus?.displayClock ?? null) : null,
      winner_team_id: winner,
      status_detail:
        competition.status?.type?.shortDetail ?? event.status?.type?.shortDetail ?? null,
      venue: competition.venue?.fullName ?? null,
      broadcast: competition.broadcasts?.[0]?.names?.[0] ?? null,
      odds_details: competition.odds?.[0]?.details ?? null,
      over_under: competition.odds?.[0]?.overUnder ?? null,
    });
  }

  return { games, teams: [...teams.values()] };
}

/** The week ESPN currently considers live. */
export async function fetchCurrentWeek(): Promise<{
  season: number;
  week: number;
  seasonType: number;
}> {
  const data = await getJson<EspnScoreboard>(`${BASE}/scoreboard?groups=${FBS_GROUP}&limit=1`);
  return {
    season: data.season?.year ?? new Date().getFullYear(),
    week: data.week?.number ?? 1,
    seasonType: data.season?.type ?? 2,
  };
}

export type NormalizedRanking = {
  season: number;
  week: number;
  poll: string;
  rank: number;
  team_id: number;
  points: number | null;
};

const POLL_SLUGS: Record<string, string> = {
  "AP Top 25": "ap",
  "AFCA Coaches Poll": "coaches",
  "Playoff Committee Rankings": "cfp",
};

export async function fetchRankings(
  season: number,
  week: number,
  seasonType = 2,
): Promise<NormalizedRanking[]> {
  const data = await getJson<EspnRankings>(
    `${BASE}/rankings?year=${season}&week=${week}&seasontype=${seasonType}`,
  );

  const out: NormalizedRanking[] = [];
  const seen = new Set<string>();

  for (const poll of data.rankings ?? []) {
    const slug = POLL_SLUGS[poll.name ?? ""] ?? poll.type ?? null;
    if (!slug) continue;

    for (const entry of poll.ranks ?? []) {
      const teamId = Number(entry.team?.id);
      const position = entry.current;
      if (!Number.isFinite(teamId) || typeof position !== "number") continue;

      const key = `${slug}:${position}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        season,
        week,
        poll: slug,
        rank: position,
        team_id: teamId,
        points: entry.points ?? null,
      });
    }
  }

  return out;
}
