"use client";

import { useActionState } from "react";
import {
  MAX_GAMES_PER_WEEK,
  MIN_GAMES_PER_WEEK,
  scopePicksItsOwnSize,
} from "@/lib/format";
import {
  seedPlayoffsAction,
  updateLeagueAction,
  type ActionState,
} from "../actions";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{state.error}</p>;
  }
  if (state.ok) {
    return <p style={{ color: "var(--accent)", fontSize: "0.85rem", margin: 0 }}>{state.ok}</p>;
  }
  return null;
}

export function LeagueSettingsForm({
  leagueId,
  slug,
  name,
  description,
  maxGames,
  scope,
  endWeek,
  playoffTeams,
}: {
  leagueId: string;
  slug: string;
  name: string;
  description: string | null;
  maxGames: number;
  scope: string;
  endWeek: number;
  playoffTeams: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateLeagueAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.9rem" }}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label htmlFor="league-name">League name</label>
        <input id="league-name" name="name" defaultValue={name} required />
      </div>
      <div>
        <label htmlFor="league-description">Description</label>
        <input id="league-description" name="description" defaultValue={description ?? ""} />
      </div>

      <div
        style={{
          display: "grid",
          gap: "0.9rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        {scopePicksItsOwnSize(scope) ? (
          <div>
            <label htmlFor="league-max-games">Games per week</label>
            <input
              id="league-max-games"
              name="max_games_per_week"
              type="number"
              min={MIN_GAMES_PER_WEEK}
              max={MAX_GAMES_PER_WEEK}
              defaultValue={maxGames}
            />
          </div>
        ) : (
          <input type="hidden" name="max_games_per_week" value={maxGames} />
        )}
        <div>
          <label htmlFor="league-end-week">Last regular-season week</label>
          <input
            id="league-end-week"
            name="regular_season_end_week"
            type="number"
            min={2}
            max={20}
            defaultValue={endWeek}
          />
        </div>
        <div>
          <label htmlFor="league-playoff-teams">Playoff field</label>
          <select id="league-playoff-teams" name="playoff_teams" defaultValue={String(playoffTeams)}>
            <option value="0">No playoffs</option>
            <option value="2">2 teams</option>
            <option value="4">4 teams</option>
            <option value="8">8 teams</option>
          </select>
        </div>
      </div>

      <Feedback state={state} />

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

export function SeedPlayoffsForm({
  leagueId,
  slug,
  playoffTeams,
  alreadySeeded,
}: {
  leagueId: string;
  slug: string;
  playoffTeams: number;
  alreadySeeded: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(seedPlayoffsAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />

      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        {alreadySeeded
          ? "Re-seeding wipes the current bracket and rebuilds it from the standings as they are now."
          : `Locks in the top ${playoffTeams} members by weekly wins (total points break ties) and builds the bracket.`}
      </p>

      <Feedback state={state} />

      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Seeding…" : alreadySeeded ? "Re-seed bracket" : "Seed the bracket"}
        </button>
      </div>
    </form>
  );
}
