"use client";

import { useActionState, useState } from "react";
import { createLeagueAction, type CreateLeagueState } from "./actions";
import type { LeagueScope } from "@/lib/database.types";

type Conference = { id: number; name: string; short_name: string | null };

const SCOPE_OPTIONS: { value: LeagueScope; title: string; blurb: string }[] = [
  {
    value: "conference",
    title: "One conference",
    blurb: "Every game involving a team from the conference you choose.",
  },
  {
    value: "all_fbs",
    title: "All FBS",
    blurb: "The full FBS slate, trimmed to the most interesting games each week.",
  },
  {
    value: "top25",
    title: "Top 25 only",
    blurb: "Only games with at least one ranked team.",
  },
];

export function NewLeagueForm({
  conferences,
  defaultSeason,
}: {
  conferences: Conference[];
  defaultSeason: number;
}) {
  const [state, action, pending] = useActionState<CreateLeagueState, FormData>(
    createLeagueAction,
    {},
  );
  const [scope, setScope] = useState<LeagueScope>("all_fbs");

  return (
    <form action={action} style={{ display: "grid", gap: "1.4rem" }}>
      <div className="surface" style={{ padding: "1.25rem" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div>
            <label htmlFor="name">League name</label>
            <input id="name" name="name" required placeholder="Saturday Regulars" />
          </div>
          <div>
            <label htmlFor="description">Description (optional)</label>
            <input id="description" name="description" placeholder="Loser buys wings" />
          </div>
        </div>
      </div>

      <div className="surface" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}>What do you pick each week?</h2>
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
          This is the league default. As commissioner you can override any single week later.
        </p>

        <div style={{ display: "grid", gap: "0.6rem" }}>
          {SCOPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                gap: "0.7rem",
                alignItems: "flex-start",
                border: `1px solid ${scope === option.value ? "var(--accent)" : "var(--border)"}`,
                background: scope === option.value ? "var(--accent-soft)" : "transparent",
                borderRadius: 10,
                padding: "0.75rem 0.9rem",
                cursor: "pointer",
                margin: 0,
                color: "var(--text)",
                fontWeight: 400,
              }}
            >
              <input
                type="radio"
                name="scope"
                value={option.value}
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
                style={{ width: "auto", marginTop: 3 }}
              />
              <span>
                <strong style={{ display: "block", fontSize: "0.92rem" }}>{option.title}</strong>
                <span className="muted" style={{ fontSize: "0.84rem" }}>{option.blurb}</span>
              </span>
            </label>
          ))}
        </div>

        {scope === "conference" ? (
          <div style={{ marginTop: "1rem" }}>
            <label htmlFor="conference_id">Conference</label>
            <select id="conference_id" name="conference_id" required defaultValue="">
              <option value="" disabled>
                Choose a conference…
              </option>
              {conferences.map((conference) => (
                <option key={conference.id} value={conference.id}>
                  {conference.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div style={{ marginTop: "1rem" }}>
          <label htmlFor="max_games_per_week">Games per week</label>
          <input
            id="max_games_per_week"
            name="max_games_per_week"
            type="number"
            min={3}
            max={60}
            defaultValue={12}
          />
          <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>
            When more games qualify than this, ranked matchups are taken first.
          </p>
        </div>
      </div>

      <div className="surface" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 1rem" }}>Season and playoffs</h2>
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <div>
            <label htmlFor="season">Season</label>
            <input
              id="season"
              name="season"
              type="number"
              min={2020}
              max={2100}
              defaultValue={defaultSeason}
            />
          </div>
          <div>
            <label htmlFor="start_week">First week</label>
            <input id="start_week" name="start_week" type="number" min={1} max={20} defaultValue={1} />
          </div>
          <div>
            <label htmlFor="regular_season_end_week">Last regular-season week</label>
            <input
              id="regular_season_end_week"
              name="regular_season_end_week"
              type="number"
              min={2}
              max={20}
              defaultValue={12}
            />
          </div>
          <div>
            <label htmlFor="playoff_teams">Playoff field</label>
            <select id="playoff_teams" name="playoff_teams" defaultValue="4">
              <option value="0">No playoffs</option>
              <option value="2">2 teams — 1 week</option>
              <option value="4">4 teams — 2 weeks</option>
              <option value="8">8 teams — 3 weeks</option>
            </select>
          </div>
        </div>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.75rem 0 0" }}>
          The playoff runs in the weeks right after the last regular-season week, so leave room
          before the season ends.
        </p>
      </div>

      {state.error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.88rem", margin: 0 }}>{state.error}</p>
      ) : null}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create league"}
        </button>
      </div>
    </form>
  );
}
