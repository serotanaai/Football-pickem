import { Badge } from "@/components/Badge";
import { Reveal } from "@/components/Reveal";
import { LocalTime } from "@/components/LocalTime";
import { teamFill, teamInk } from "@/lib/teamColor";

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
  /** true once you have submitted this week, or the game has kicked off */
  revealed: boolean;
  totalPicks: number;
  myTeamId: number | null;
  home: MatchupSide;
  away: MatchupSide;
};

/**
 * How far the bar is allowed to swing.
 *
 * A team picked by nobody would otherwise be left a sliver too narrow for its
 * own crest, so the fill is held inside these bounds while the printed
 * percentage stays exact.
 */
const MIN_SHARE = 22;

function clampShare(pct: number): number {
  return Math.min(100 - MIN_SHARE, Math.max(MIN_SHARE, pct));
}

function TeamSide({
  side,
  row,
  home,
  width,
}: {
  side: MatchupSide;
  row: MatchupRow;
  home: boolean;
  width: number;
}) {
  const won = row.completed && row.winnerTeamId === side.teamId;
  const mine = row.myTeamId === side.teamId;
  const showScore = side.score !== null && (row.completed || row.status === "in_progress");
  const slim = width <= 30;

  return (
    <div
      className={`tug-side${home ? " is-home" : ""}${slim ? " is-slim" : ""}${
        won ? " is-won" : ""
      }${side.logo ? " has-logo" : ""}`}
      style={
        {
          width: `${width}%`,
          background: teamFill(side.color),
          "--ink": teamInk(side.color),
        } as React.CSSProperties
      }
    >
      {side.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.logo} alt="" className="tug-logo" />
      ) : (
        <span
          aria-hidden
          className="tug-logo"
          style={{ background: "rgba(255,255,255,0.18)", borderRadius: 5 }}
        />
      )}

      <span className="tug-label">
        <b>
          {side.rank ? <span className="tug-rank">#{side.rank}</span> : null}
          <span className="tug-name">
            <span className="tug-school">{side.school}</span>
            <span className="tug-abbr">{side.abbreviation ?? side.school}</span>
          </span>
          {won ? <span className="tug-won" title="Winner">✓</span> : null}
          {mine ? <span className="tug-mine" title="Your pick">●</span> : null}
        </b>
        {row.revealed && row.totalPicks > 0 ? (
          <span className="tug-pct">{side.pct}%</span>
        ) : null}
      </span>

      {showScore ? <strong className="tug-score">{side.score}</strong> : null}
    </div>
  );
}

/**
 * The week's slate in kickoff order — every game on the board, whether or not
 * you picked it. One bar per game: the two teams' colours push against each
 * other, meeting at the league's pick split.
 */
export function WeekMatchups({
  rows,
  memberCount,
  submitted,
}: {
  rows: MatchupRow[];
  memberCount: number;
  submitted: boolean;
}) {
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
    <div style={{ display: "grid", gap: "0.55rem" }}>
      {!submitted ? (
        <p className="note" style={{ margin: "0 0 0.1rem" }}>
          Submit your picks to see how the league is split on each game.
        </p>
      ) : null}

      {rows.map((row, index) => {
        const label = row.completed
          ? "Final"
          : row.status === "in_progress"
            ? (row.statusDetail ?? "Live")
            : null;

        const split = row.revealed && row.totalPicks > 0;
        // The bar is the split itself; with nothing to show yet it rests even.
        const awayWidth = split ? clampShare(row.away.pct) : 50;

        return (
          <Reveal key={row.id} delay={Math.min(index, 8) * 55}>
            <div
              className="glass matchup surface-hover"
              style={{ "--shine-delay": `${(index % 6) * 1.1}s` } as React.CSSProperties}
            >
              <div className="matchup-meta">
                <span className="muted">
                  {label ?? <LocalTime iso={row.startTime} mode="kickoff" showZone />}
                </span>
                {row.broadcast ? <span className="muted">· {row.broadcast}</span> : null}
                {row.neutralSite ? <Badge tone="muted">Neutral</Badge> : null}
                <span style={{ marginLeft: "auto", display: "flex", gap: "0.35rem" }}>
                  {row.status === "in_progress" ? <Badge tone="accent">Live</Badge> : null}
                  {!row.myTeamId ? <Badge tone="muted">No pick</Badge> : null}
                </span>
              </div>

              <div className={`tug${split ? " is-split" : ""}`}>
                <TeamSide side={row.away} row={row} home={false} width={awayWidth} />
                <TeamSide side={row.home} row={row} home width={100 - awayWidth} />
              </div>

              {split && row.totalPicks < memberCount ? (
                <p className="note" style={{ fontSize: "0.72rem" }}>
                  {memberCount - row.totalPicks} of {memberCount}{" "}
                  {memberCount - row.totalPicks === 1 ? "member" : "members"} had no pick here.
                </p>
              ) : null}
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
