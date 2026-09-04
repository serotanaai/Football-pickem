"use client";

import { useActionState, useState } from "react";
import { TeamChip } from "@/components/TeamChip";
import { Badge } from "@/components/Badge";
import { formatDay, formatTime } from "@/lib/format";
import { savePicksAction } from "../actions";
import type { ActionState } from "../actions";

export type PickGame = {
  id: number;
  start_time: string;
  neutral_site: boolean;
  status: string;
  completed: boolean;
  status_detail: string | null;
  broadcast: string | null;
  odds_details: string | null;
  home_score: number | null;
  away_score: number | null;
  home_rank: number | null;
  away_rank: number | null;
  winner_team_id: number | null;
  home: { id: number; school: string; display_name: string; abbreviation: string | null; logo: string | null } | null;
  away: { id: number; school: string; display_name: string; abbreviation: string | null; logo: string | null } | null;
  locked: boolean;
};

export function PickBoard({
  leagueId,
  slug,
  week,
  games,
  initialPicks,
}: {
  leagueId: string;
  slug: string;
  week: number;
  games: PickGame[];
  initialPicks: Record<number, number>;
}) {
  const [picks, setPicks] = useState<Record<number, number>>(initialPicks);
  const [state, action, pending] = useActionState<ActionState, FormData>(savePicksAction, {});

  const openGames = games.filter((game) => !game.locked);
  const made = openGames.filter((game) => picks[game.id]).length;

  const payload = JSON.stringify(
    openGames
      .filter((game) => picks[game.id])
      .map((game) => ({ game_id: game.id, team_id: picks[game.id] })),
  );

  const byDay = new Map<string, PickGame[]>();
  for (const game of games) {
    const day = formatDay(game.start_time);
    byDay.set(day, [...(byDay.get(day) ?? []), game]);
  }

  return (
    <form action={action}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="picks" value={payload} />

      <div style={{ display: "grid", gap: "1.5rem" }}>
        {[...byDay.entries()].map(([day, dayGames]) => (
          <section key={day}>
            <h2
              style={{
                fontSize: "0.78rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--muted)",
                margin: "0 0 0.6rem",
              }}
            >
              {day}
            </h2>

            <div style={{ display: "grid", gap: "0.6rem" }}>
              {dayGames.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  picked={picks[game.id]}
                  onPick={(teamId) =>
                    setPicks((prev) => ({ ...prev, [game.id]: teamId }))
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: "1.5rem",
          padding: "0.85rem 1rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
          {made} of {openGames.length} open {openGames.length === 1 ? "game" : "games"} picked
        </span>

        {state.error ? (
          <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</span>
        ) : null}
        {state.ok ? (
          <span style={{ color: "var(--accent)", fontSize: "0.85rem" }}>{state.ok}</span>
        ) : null}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || made === 0}
          style={{ marginLeft: "auto" }}
        >
          {pending ? "Saving…" : "Save picks"}
        </button>
      </div>
    </form>
  );
}

function GameRow({
  game,
  picked,
  onPick,
}: {
  game: PickGame;
  picked: number | undefined;
  onPick: (teamId: number) => void;
}) {
  const detail = game.completed
    ? "Final"
    : game.status === "in_progress"
      ? (game.status_detail ?? "In progress")
      : formatTime(game.start_time);

  return (
    <div
      className="surface"
      style={{
        padding: "0.75rem 0.9rem",
        opacity: game.locked && !picked ? 0.72 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.55rem",
          fontSize: "0.76rem",
        }}
      >
        <span className="muted">{detail}</span>
        {game.neutral_site ? <Badge tone="muted">Neutral</Badge> : null}
        {game.broadcast ? <span className="muted">· {game.broadcast}</span> : null}
        {game.odds_details ? <span className="muted">· {game.odds_details}</span> : null}
        {game.locked ? (
          <span style={{ marginLeft: "auto" }}>
            <Badge tone="muted">{game.completed ? "Final" : "Locked"}</Badge>
          </span>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "0.4rem", gridTemplateColumns: "1fr 1fr" }}>
        {[
          { team: game.away, rank: game.away_rank, score: game.away_score, at: false },
          { team: game.home, rank: game.home_rank, score: game.home_score, at: true },
        ].map(({ team, rank, score, at }) => {
          if (!team) return <div key={at ? "away" : "home"} />;

          const selected = picked === team.id;
          const won = game.completed && game.winner_team_id === team.id;
          const lost = game.completed && game.winner_team_id !== null && !won;

          return (
            <button
              key={team.id}
              type="button"
              disabled={game.locked}
              onClick={() => onPick(team.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                textAlign: "left",
                padding: "0.55rem 0.65rem",
                borderRadius: 9,
                cursor: game.locked ? "default" : "pointer",
                background: selected ? "var(--accent-soft)" : "transparent",
                border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                color: lost ? "var(--muted)" : "var(--text)",
                font: "inherit",
                minWidth: 0,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                {at ? (
                  <span className="muted" style={{ fontSize: "0.7rem", flexShrink: 0 }}>
                    @
                  </span>
                ) : null}
                <TeamChip team={team} rank={rank} />
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                {score !== null ? (
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{score}</strong>
                ) : null}
                {won ? <span title="Winner">✓</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
