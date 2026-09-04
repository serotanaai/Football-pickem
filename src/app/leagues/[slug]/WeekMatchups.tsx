import { Badge } from "@/components/Badge";
import { TeamChip } from "@/components/TeamChip";
import { formatKickoff, formatTime } from "@/lib/format";
import type { BoardGame, GameConsensus } from "@/lib/board";

/**
 * The week's slate in kickoff order — every game on the board, whether or not
 * this member picked it. Once a game kicks off it carries the score, the winner
 * in green, and how the league split on it.
 */
export function WeekMatchups({
  games,
  consensus,
  memberCount,
}: {
  games: BoardGame[];
  consensus: Map<number, GameConsensus>;
  memberCount: number;
}) {
  if (games.length === 0) {
    return (
      <div className="surface" style={{ padding: "1.5rem", textAlign: "center" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          No games on this week&apos;s slate yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {games.map((game) => {
        const split = consensus.get(game.id);
        const started = split?.revealed ?? false;

        return (
          <div key={game.id} className="surface" style={{ padding: "0.8rem 0.9rem" }}>
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
                {game.completed
                  ? "Final"
                  : game.status === "in_progress"
                    ? (game.status_detail ?? "In progress")
                    : formatKickoff(game.start_time)}
              </span>
              {game.broadcast ? <span className="muted">· {game.broadcast}</span> : null}
              {game.neutral_site ? <Badge tone="muted">Neutral</Badge> : null}
              {game.status === "in_progress" ? (
                <span style={{ marginLeft: "auto" }}>
                  <Badge tone="accent">Live</Badge>
                </span>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "0.4rem" }}>
              {[
                {
                  team: game.away,
                  rank: game.away_rank,
                  score: game.away_score,
                  teamId: game.away_team_id,
                  pct: split?.awayPct ?? 0,
                  count: split?.awayCount ?? 0,
                  home: false,
                },
                {
                  team: game.home,
                  rank: game.home_rank,
                  score: game.home_score,
                  teamId: game.home_team_id,
                  pct: split?.homePct ?? 0,
                  count: split?.homeCount ?? 0,
                  home: true,
                },
              ].map((side) => {
                const won = game.completed && game.winner_team_id === side.teamId;
                const lost =
                  game.completed && game.winner_team_id !== null && !won;
                const mine = split?.myTeamId === side.teamId;

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
                    {/* consensus bar, sitting behind the row */}
                    {started && split && split.total > 0 ? (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${side.pct}%`,
                          background: won ? "transparent" : "var(--border)",
                          opacity: won ? 0 : 0.45,
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
                      {side.home ? (
                        <span className="muted" style={{ fontSize: "0.7rem", flexShrink: 0 }}>
                          @
                        </span>
                      ) : null}
                      <TeamChip team={side.team} rank={side.rank} size={20} />
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
                      {started && split && split.total > 0 ? (
                        <span
                          className={won ? undefined : "muted"}
                          style={{
                            fontSize: "0.78rem",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: won ? "var(--accent)" : undefined,
                          }}
                        >
                          {side.pct}%
                          <span style={{ fontWeight: 400 }}> ({side.count})</span>
                        </span>
                      ) : null}

                      {side.score !== null &&
                      (game.completed || game.status === "in_progress") ? (
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

            {!started ? (
              <p className="note" style={{ margin: "0.5rem 0 0", fontSize: "0.75rem" }}>
                {split?.myTeamId
                  ? `Kicks off ${formatTime(game.start_time)} · league picks reveal then`
                  : `Kicks off ${formatTime(game.start_time)} · you have no pick on this one`}
              </p>
            ) : split && split.total < memberCount ? (
              <p className="note" style={{ margin: "0.5rem 0 0", fontSize: "0.75rem" }}>
                {memberCount - split.total} of {memberCount}{" "}
                {memberCount - split.total === 1 ? "member" : "members"} had no pick here.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
