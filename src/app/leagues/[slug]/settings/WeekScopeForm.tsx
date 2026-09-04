"use client";

import { useActionState, useState } from "react";
import { setWeekScopeAction, type ActionState } from "../actions";
import type { LeagueScope } from "@/lib/database.types";

type Conference = { id: number; name: string };

export function WeekScopeForm({
  leagueId,
  slug,
  weeks,
  conferences,
  defaultWeek,
  currentByWeek,
}: {
  leagueId: string;
  slug: string;
  weeks: number[];
  conferences: Conference[];
  defaultWeek: number;
  currentByWeek: Record<number, { scope: LeagueScope; conference_id: number | null }>;
}) {
  const [week, setWeek] = useState(defaultWeek);
  const existing = currentByWeek[week];
  const [scope, setScope] = useState<LeagueScope>(existing?.scope ?? "all_fbs");
  const [conferenceId, setConferenceId] = useState<number | "">(
    existing?.conference_id ?? conferences[0]?.id ?? "",
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(setWeekScopeAction, {});

  function onWeekChange(next: number) {
    setWeek(next);
    const row = currentByWeek[next];
    if (row) {
      setScope(row.scope);
      if (row.conference_id) setConferenceId(row.conference_id);
    }
  }

  return (
    <form action={action} style={{ display: "grid", gap: "0.85rem" }}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />

      <div
        style={{
          display: "grid",
          gap: "0.85rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <div>
          <label htmlFor="scope-week">Week</label>
          <select
            id="scope-week"
            name="week"
            value={week}
            onChange={(e) => onWeekChange(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="scope-kind">Slate</label>
          <select
            id="scope-kind"
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as LeagueScope)}
          >
            <option value="all_fbs">All FBS games</option>
            <option value="top25">Top 25 games only</option>
            <option value="conference">One conference</option>
          </select>
        </div>

        {scope === "conference" ? (
          <div>
            <label htmlFor="scope-conference">Conference</label>
            <select
              id="scope-conference"
              name="conference_id"
              value={conferenceId}
              onChange={(e) => setConferenceId(Number(e.target.value))}
            >
              {conferences.map((conference) => (
                <option key={conference.id} value={conference.id}>
                  {conference.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
        Rebuilding a week replaces games that have not kicked off — and any picks already made on
        them. Games already underway stay put.
      </p>

      {state.error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{state.error}</p>
      ) : null}
      {state.ok ? (
        <p style={{ color: "var(--accent)", fontSize: "0.85rem", margin: 0 }}>{state.ok}</p>
      ) : null}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Rebuilding…" : `Apply to week ${week}`}
        </button>
      </div>
    </form>
  );
}
