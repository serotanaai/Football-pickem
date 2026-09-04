"use client";

import { useActionState, useState } from "react";
import { TeamChip } from "@/components/TeamChip";
import { Badge } from "@/components/Badge";
import { formatDay, POINTS_PER_PICK } from "@/lib/format";
import { LocalTime } from "@/components/LocalTime";
import { submitPicksAction } from "../actions";
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
  submitted,
}: {
  leagueId: string;
  slug: string;
  week: number;
  games: PickGame[];
  initialPicks: Record<number, number>;
  /** Once the week is in, the board becomes a record of what you picked. */
  submitted: boolean;
}) {
  const [picks, setPicks] = useState<Record<number, number>>(initialPicks);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(submitPicksAction, {});

  const openGames = games.filter((game) => !game.locked);
  const made = openGames.filter((game) => picks[game.id]).length;
  const gone = games.length - openGames.length;

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
                  readOnly={submitted}
                  onPick={(teamId) =>
                    setPicks((prev) => ({ ...prev, [game.id]: teamId }))
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {submitted ? null : (
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: "1.5rem",
          padding: "0.85rem 1rem",
          background: "var(--surface)",
          border: `1px solid ${confirming ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 12,
          display: "grid",
          gap: "0.6rem",
        }}
      >
        {confirming ? (
          <>
            <div>
              <p style={{ margin: "0 0 0.2rem", fontWeight: 650, fontSize: "0.92rem" }}>
                Submit {made} {made === 1 ? "pick" : "picks"} for week {week}?
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                This is final — you will not be able to change them afterwards.
                {made < openGames.length
                  ? ` You are leaving ${openGames.length - made} open ${
                      openGames.length - made === 1 ? "game" : "games"
                    } unpicked, worth ${(
                      (openGames.length - made) * POINTS_PER_PICK
                    ).toLocaleString()} points.`
                  : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Yes, submit — final"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Go back
              </button>
            </div>
          </>
        ) : (
          <div
            style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
          >
            <span style={{ display: "grid", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                {made} of {openGames.length} open{" "}
                {openGames.length === 1 ? "game" : "games"} picked
              </span>
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {openGames.length === 0
                  ? `Every game in week ${week} has kicked off.`
                  : `Still on the table: ${(
                      openGames.length * POINTS_PER_PICK
                    ).toLocaleString()} points`}
                {gone > 0
                  ? ` · ${gone} ${gone === 1 ? "game" : "games"} already kicked off`
                  : ""}
              </span>
            </span>

            {state.error ? (
              <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</span>
            ) : null}

            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setConfirming(true)}
              disabled={made === 0}
              style={{ marginLeft: "auto" }}
            >
              Submit picks
            </button>
          </div>
        )}
      </div>
      )}
    </form>
  );
}

function GameRow({
  game,
  picked,
  onPick,
  readOnly,
}: {
  game: PickGame;
  picked: number | undefined;
  onPick: (teamId: number) => void;
  readOnly: boolean;
}) {
  const detail = game.completed
    ? "Final"
    : game.status === "in_progress"
      ? (game.status_detail ?? "In progress")
      : null;

  // What this game did to your week, once it is out of reach — or, on a week
  // you have already submitted, what you did with it.
  const outcome = !game.locked
    ? !readOnly
      ? null
      : picked === undefined
        ? { label: "No pick", tone: "muted" as const }
        : { label: "Your pick", tone: "accent" as const }
    : picked === undefined
      ? { label: "Missed — no pick", tone: "muted" as const }
      : !game.completed
        ? { label: "Pick locked in", tone: "muted" as const }
        : game.winner_team_id === null
          ? { label: "No result", tone: "muted" as const }
          : game.winner_team_id === picked
            ? { label: `+${POINTS_PER_PICK}`, tone: "accent" as const }
            : { label: "0", tone: "muted" as const };

  return (
    <div
      className="surface"
      style={{
        padding: "0.75rem 0.9rem",
        // A submitted week is not a disabled one; only games out of reach recede.
        opacity: game.locked ? 0.7 : 1,
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
        <span className="muted">
          {detail ?? <LocalTime iso={game.start_time} mode="time" />}
        </span>
        {game.neutral_site ? <Badge tone="muted">Neutral</Badge> : null}
        {game.broadcast ? <span className="muted">· {game.broadcast}</span> : null}
        {game.odds_details ? <span className="muted">· {game.odds_details}</span> : null}
        {game.locked || outcome ? (
          <span
            style={{ marginLeft: "auto", display: "flex", gap: "0.35rem", alignItems: "center" }}
          >
            {outcome ? <Badge tone={outcome.tone}>{outcome.label}</Badge> : null}
            {game.locked ? (
              <Badge tone="muted">
                {game.completed ? "Final" : game.status === "in_progress" ? "In progress" : "Locked"}
              </Badge>
            ) : null}
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
              disabled={game.locked || readOnly}
              onClick={() => onPick(team.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                textAlign: "left",
                padding: "0.55rem 0.65rem",
                borderRadius: 9,
                cursor: game.locked || readOnly ? "default" : "pointer",
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
                {score !== null && (game.completed || game.status === "in_progress") ? (
                  <strong
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "0.95rem",
                      color: won ? "var(--accent)" : "inherit",
                    }}
                  >
                    {score}
                  </strong>
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
