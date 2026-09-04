"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { TeamChip } from "@/components/TeamChip";
import { LocalTime } from "@/components/LocalTime";

export type MatchupSide = {
  teamId: number;
  school: string;
  abbreviation: string | null;
  logo: string | null;
  rank: number | null;
  score: number | null;
  pct: number;
  count: number;
};

export type MatchupRow = {
  id: number;
  startTime: string;
  status: string;
  completed: boolean;
  statusDetail: string | null;
  broadcast: string | null;
  neutralSite: boolean;
  winnerTeamId: number | null;
  /** false until kickoff — the picks policy hides other members' rows before then */
  revealed: boolean;
  totalPicks: number;
  myTeamId: number | null;
  home: MatchupSide;
  away: MatchupSide;
};

function statusLabel(row: MatchupRow) {
  if (row.completed) return "Final";
  if (row.status === "in_progress") return row.statusDetail ?? "Live";
  return null;
}

/**
 * The week's slate in kickoff order — every game on the board, whether or not
 * this member picked it. Table by default, since the point is a quick glance.
 */
export function WeekMatchups({
  rows,
  memberCount,
}: {
  rows: MatchupRow[];
  memberCount: number;
}) {
  const [view, setView] = useState<"table" | "cards">("table");

  if (rows.length === 0) {
    return (
      <div className="surface" style={{ padding: "1.5rem", textAlign: "center" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          No games on this week&apos;s slate yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.7rem" }}>
        {(["table", "cards"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={view === option ? "btn btn-primary" : "btn"}
            onClick={() => setView(option)}
            style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
          >
            {option === "table" ? "Table" : "Detail"}
          </button>
        ))}
      </div>

      {view === "table" ? (
        <TableView rows={rows} />
      ) : (
        <CardView rows={rows} memberCount={memberCount} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ table

function TableView({ rows }: { rows: MatchupRow[] }) {
  return (
    <div className="surface scroll-x">
      <table style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th>Matchup</th>
            <th style={{ width: 74 }}>You</th>
            <th style={{ width: 108 }}>League</th>
            <th style={{ textAlign: "right", width: 96 }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = statusLabel(row);

            return (
              <tr key={row.id}>
                <td>
                  <div style={{ display: "grid", gap: "0.15rem", fontSize: "0.85rem" }}>
                    {[row.away, row.home].map((side, i) => {
                      const won = row.completed && row.winnerTeamId === side.teamId;
                      const lost =
                        row.completed && row.winnerTeamId !== null && !won;
                      return (
                        <span
                          key={side.teamId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontWeight: won ? 700 : 500,
                            color: won
                              ? "var(--accent)"
                              : lost
                                ? "var(--muted)"
                                : "var(--text)",
                          }}
                        >
                          {i === 1 ? (
                            <span className="muted" style={{ fontSize: "0.68rem" }}>
                              @
                            </span>
                          ) : null}
                          {side.rank ? (
                            <span className="muted" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                              #{side.rank}
                            </span>
                          ) : null}
                          {side.school}
                          {won ? " ✓" : ""}
                        </span>
                      );
                    })}
                    <span className="muted" style={{ fontSize: "0.72rem" }}>
                      {label ?? <LocalTime iso={row.startTime} mode="kickoff" />}
                      {row.broadcast ? ` · ${row.broadcast}` : ""}
                    </span>
                  </div>
                </td>

                <td>
                  {row.myTeamId ? (
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 650,
                        color:
                          row.completed && row.winnerTeamId === row.myTeamId
                            ? "var(--accent)"
                            : row.completed
                              ? "var(--muted)"
                              : "var(--text)",
                        textDecoration:
                          row.completed && row.winnerTeamId !== row.myTeamId
                            ? "line-through"
                            : "none",
                      }}
                    >
                      {(row.myTeamId === row.home.teamId ? row.home : row.away).abbreviation ??
                        (row.myTeamId === row.home.teamId ? row.home : row.away).school}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>

                <td>
                  {row.revealed && row.totalPicks > 0 ? (
                    <div style={{ display: "grid", gap: "0.15rem", fontSize: "0.76rem" }}>
                      {[row.away, row.home].map((side) => (
                        <span
                          key={side.teamId}
                          className={side.pct >= 50 ? undefined : "muted"}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {side.pct}% {side.abbreviation ?? side.school.slice(0, 4)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: "0.76rem" }}>
                      at kickoff
                    </span>
                  )}
                </td>

                <td className="num">
                  {row.completed || row.status === "in_progress" ? (
                    <span style={{ display: "grid", gap: "0.15rem", fontSize: "0.85rem" }}>
                      {[row.away, row.home].map((side) => {
                        const won = row.completed && row.winnerTeamId === side.teamId;
                        return (
                          <strong
                            key={side.teamId}
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: won ? "var(--accent)" : "var(--muted)",
                              fontWeight: won ? 700 : 500,
                            }}
                          >
                            {side.score ?? "–"}
                          </strong>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      <LocalTime iso={row.startTime} mode="time" />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ cards

function CardView({ rows, memberCount }: { rows: MatchupRow[]; memberCount: number }) {
  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {rows.map((row) => {
        const label = statusLabel(row);

        return (
          <div key={row.id} className="surface" style={{ padding: "0.8rem 0.9rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.6rem",
                fontSize: "0.76rem",
                flexWrap: "wrap",
              }}
            >
              <span className="muted">
                {label ?? <LocalTime iso={row.startTime} mode="kickoff" showZone />}
              </span>
              {row.broadcast ? <span className="muted">· {row.broadcast}</span> : null}
              {row.neutralSite ? <Badge tone="muted">Neutral</Badge> : null}
              {row.status === "in_progress" ? (
                <span style={{ marginLeft: "auto" }}>
                  <Badge tone="accent">Live</Badge>
                </span>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "0.4rem" }}>
              {[row.away, row.home].map((side, index) => {
                const won = row.completed && row.winnerTeamId === side.teamId;
                const lost = row.completed && row.winnerTeamId !== null && !won;
                const mine = row.myTeamId === side.teamId;

                return (
                  <div
                    key={side.teamId}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.6rem",
                      borderRadius: 9,
                      overflow: "hidden",
                      border: `1.5px solid ${
                        won ? "var(--accent)" : mine ? "var(--border)" : "transparent"
                      }`,
                      background: won ? "var(--accent-soft)" : "transparent",
                      color: lost ? "var(--muted)" : "var(--text)",
                    }}
                  >
                    {row.revealed && row.totalPicks > 0 && !won ? (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: `${side.pct}%`,
                          background: "var(--border)",
                          opacity: 0.45,
                        }}
                      />
                    ) : null}

                    <span
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        minWidth: 0,
                      }}
                    >
                      {index === 1 ? (
                        <span className="muted" style={{ fontSize: "0.7rem", flexShrink: 0 }}>
                          @
                        </span>
                      ) : null}
                      <TeamChip
                        team={{
                          school: side.school,
                          display_name: side.school,
                          abbreviation: side.abbreviation,
                          logo: side.logo,
                        }}
                        rank={side.rank}
                        size={20}
                      />
                      {mine ? <Badge tone="accent">Your pick</Badge> : null}
                    </span>

                    <span
                      style={{
                        position: "relative",
                        marginLeft: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        flexShrink: 0,
                      }}
                    >
                      {row.revealed && row.totalPicks > 0 ? (
                        <span
                          className={won ? undefined : "muted"}
                          style={{
                            fontSize: "0.78rem",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: won ? "var(--accent)" : undefined,
                          }}
                        >
                          {side.pct}%<span style={{ fontWeight: 400 }}> ({side.count})</span>
                        </span>
                      ) : null}

                      {side.score !== null &&
                      (row.completed || row.status === "in_progress") ? (
                        <strong
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontSize: "1rem",
                            color: won ? "var(--accent)" : undefined,
                          }}
                        >
                          {side.score}
                        </strong>
                      ) : null}

                      {won ? <span style={{ color: "var(--accent)" }}>✓</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>

            {!row.revealed ? (
              <p className="note" style={{ margin: "0.5rem 0 0", fontSize: "0.75rem" }}>
                Kicks off <LocalTime iso={row.startTime} mode="time" /> ·{" "}
                {row.myTeamId ? "league picks reveal then" : "you have no pick on this one"}
              </p>
            ) : row.totalPicks < memberCount ? (
              <p className="note" style={{ margin: "0.5rem 0 0", fontSize: "0.75rem" }}>
                {memberCount - row.totalPicks} of {memberCount}{" "}
                {memberCount - row.totalPicks === 1 ? "member" : "members"} had no pick here.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
