"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { LocalTime } from "@/components/LocalTime";
import { teamFill, teamInk, teamWash } from "@/lib/teamColor";

export type MatchupSide = {
  teamId: number;
  school: string;
  abbreviation: string | null;
  logo: string | null;
  color: string | null;
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

// ------------------------------------------------------------------- table

function TeamCell({ side, won, lost }: { side: MatchupSide; won: boolean; lost: boolean }) {
  return (
    <span className="team-cell" style={{ opacity: lost ? 0.55 : 1 }}>
      {side.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.logo} alt="" />
      ) : (
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: teamFill(side.color),
          }}
        />
      )}
      <b style={{ color: won ? "var(--accent)" : undefined }}>
        {side.school}
        {won ? " ✓" : ""}
      </b>
      {side.rank ? <span className="team-rank">#{side.rank}</span> : null}
    </span>
  );
}

function TableView({ rows }: { rows: MatchupRow[] }) {
  return (
    <div className="surface scroll-x">
      <table style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "center" }}>Away</th>
            <th style={{ textAlign: "center" }}>Home</th>
            <th style={{ width: 118 }}>League split</th>
            <th style={{ width: 78 }}>You</th>
            <th style={{ textAlign: "right", width: 92 }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = statusLabel(row);
            const mySide =
              row.myTeamId === row.home.teamId
                ? row.home
                : row.myTeamId === row.away.teamId
                  ? row.away
                  : null;

            return (
              <tr key={row.id}>
                {[row.away, row.home].map((side) => {
                  const won = row.completed && row.winnerTeamId === side.teamId;
                  const lost = row.completed && row.winnerTeamId !== null && !won;
                  return (
                    <td key={side.teamId} style={{ textAlign: "center" }}>
                      <TeamCell side={side} won={won} lost={lost} />
                    </td>
                  );
                })}

                <td>
                  {row.revealed && row.totalPicks > 0 ? (
                    <div style={{ display: "grid", gap: "3px" }}>
                      {[row.away, row.home].map((side) => (
                        <span
                          key={side.teamId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            fontSize: "0.72rem",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span style={{ minWidth: "3ch", fontWeight: 700 }}>{side.pct}%</span>
                          <span
                            aria-hidden
                            style={{
                              flex: 1,
                              height: 6,
                              borderRadius: 3,
                              background: "var(--border)",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                height: "100%",
                                width: `${side.pct}%`,
                                background: teamFill(side.color),
                              }}
                            />
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: "0.74rem" }}>
                      at kickoff
                    </span>
                  )}
                </td>

                <td>
                  {mySide ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.4rem",
                        borderRadius: 6,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: teamFill(mySide.color),
                        color: teamInk(mySide.color),
                        opacity:
                          row.completed && row.winnerTeamId !== mySide.teamId ? 0.5 : 1,
                      }}
                    >
                      {mySide.abbreviation ?? mySide.school.slice(0, 4)}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>

                <td className="num">
                  {row.completed || row.status === "in_progress" ? (
                    <span style={{ display: "grid", gap: "3px", fontSize: "0.85rem" }}>
                      {[row.away, row.home].map((side) => {
                        const won = row.completed && row.winnerTeamId === side.teamId;
                        return (
                          <strong
                            key={side.teamId}
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: won ? "var(--accent)" : "var(--muted)",
                              fontWeight: won ? 750 : 500,
                            }}
                          >
                            {side.score ?? "–"}
                          </strong>
                        );
                      })}
                      <span className="muted" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                        {label}
                      </span>
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: "0.76rem" }}>
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

// ------------------------------------------------------------------- cards

function TugSide({
  side,
  row,
  home,
}: {
  side: MatchupSide;
  row: MatchupRow;
  home: boolean;
}) {
  const fill = teamFill(side.color);
  const ink = teamInk(side.color);
  const won = row.completed && row.winnerTeamId === side.teamId;
  const lost = row.completed && row.winnerTeamId !== null && !won;
  const mine = row.myTeamId === side.teamId;

  // Before kickoff the split is genuinely unknown, so the track stays empty
  // rather than resting at half — a 50/50 fill would read as real data.
  const showSplit = row.revealed && row.totalPicks > 0;

  return (
    <div className={`tug-row${home ? " is-home" : ""}`} style={{ opacity: lost ? 0.62 : 1 }}>
      <div
        className="tug-badge"
        style={{
          background: fill,
          color: ink,
          boxShadow: won ? `0 0 0 2px var(--accent)` : mine ? `0 0 0 2px ${fill}` : "none",
        }}
      >
        {side.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.logo} alt="" />
        ) : null}
        <span className="tug-name">
          <b>{side.school}</b>
          <span>
            {side.rank ? `#${side.rank} · ` : ""}
            {side.abbreviation ?? (home ? "Home" : "Away")}
          </span>
        </span>
      </div>

      {side.score !== null && (row.completed || row.status === "in_progress") ? (
        <span
          className="tug-score"
          style={{ color: won ? "var(--accent)" : "var(--muted)" }}
        >
          {side.score}
          {won ? " ✓" : ""}
        </span>
      ) : null}

      <div className="tug-track">
        {showSplit ? (
          <div
            className="tug-fill"
            style={{
              width: `${side.pct}%`,
              background: `linear-gradient(${home ? "270deg" : "90deg"}, ${teamWash(
                side.color,
                0.9,
              )}, ${teamWash(side.color, 0.42)})`,
            }}
          />
        ) : null}
      </div>

      {showSplit ? (
        <span className="tug-pct" style={{ color: fill }}>
          {side.pct}%
        </span>
      ) : null}
    </div>
  );
}

function CardView({ rows, memberCount }: { rows: MatchupRow[]; memberCount: number }) {
  return (
    <div style={{ display: "grid", gap: "0.7rem" }}>
      {rows.map((row, index) => {
        const label = statusLabel(row);

        return (
          <div
            key={row.id}
            className="glass"
            style={
              {
                padding: "0.85rem 0.95rem",
                // stagger the sweep so the slate shimmers in sequence
                "--shine-delay": `${(index % 6) * 1.1}s`,
              } as React.CSSProperties
            }
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.6rem",
                fontSize: "0.75rem",
                flexWrap: "wrap",
                position: "relative",
                zIndex: 1,
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
              {row.myTeamId ? null : (
                <span style={{ marginLeft: "auto" }}>
                  <Badge tone="muted">No pick</Badge>
                </span>
              )}
            </div>

            <div className="tug">
              <TugSide side={row.away} row={row} home={false} />
              <TugSide side={row.home} row={row} home />
            </div>

            {!row.revealed ? (
              <p className="note" style={{ position: "relative", zIndex: 1, fontSize: "0.73rem" }}>
                Kicks off <LocalTime iso={row.startTime} mode="time" /> · league split reveals
                then
              </p>
            ) : row.totalPicks < memberCount ? (
              <p className="note" style={{ position: "relative", zIndex: 1, fontSize: "0.73rem" }}>
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
