import { Badge } from "@/components/Badge";
import { Reveal } from "@/components/Reveal";
import { LocalTime } from "@/components/LocalTime";
import { teamFill, teamInk } from "@/lib/teamColor";
import { FEATURED_MULTIPLIER } from "@/lib/format";
import { periodLabel } from "@/lib/tickerCopy";

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
  period: number | null;
  clock: string | null;
  broadcast: string | null;
  neutralSite: boolean;
  venue: string | null;
  featured: boolean;
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

/**
 * How much the winning side takes off the loser once a game is decided.
 *
 * The bar is the league's pick split, and this bends it — but the printed
 * percentages stay exact, so nothing is misreported, and the clamp above
 * already bends the same way for the same kind of reason. A result is worth
 * more than a few points of width in how the row reads.
 */
const WINNER_BONUS = 7;

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
  const decided = row.completed && row.winnerTeamId !== null;
  const won = decided && row.winnerTeamId === side.teamId;
  // Only a decided game has a loser. A game that ended in no winner — a tie, or
  // one the feed never resolved — leaves both sides alone rather than greying
  // out whichever happens not to be listed as the winner.
  const lost = decided && !won;
  const mine = row.myTeamId === side.teamId;
  const showScore = side.score !== null && (row.completed || row.status === "in_progress");
  const slim = width <= 30;

  return (
    <div
      className={`tug-side${home ? " is-home" : ""}${slim ? " is-slim" : ""}${
        won ? " is-won" : ""
      }${lost ? " is-lost" : ""}${side.logo ? " has-logo" : ""}`}
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
          {won ? (
            <span className="tug-won" title="Winner" aria-label="Winner">
              W
            </span>
          ) : null}
          {/* Which side you took, and nothing about how it went. Green on this
              board means the team won, full stop — laying a personal verdict
              over the same colour would make one green mean two things. The
              pick screen is where your week is scored. */}
          {mine ? (
            <span className="tug-mine" title="Your pick" aria-label="Your pick">
              ●
            </span>
          ) : null}
        </b>
        {row.revealed && row.totalPicks > 0 ? (
          <span className="tug-pct">{side.pct}%</span>
        ) : null}
      </span>

      {showScore ? (
        <strong className={`tug-score${won ? " is-won" : ""}`}>{side.score}</strong>
      ) : null}
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
  week,
}: {
  rows: MatchupRow[];
  memberCount: number;
  submitted: boolean;
  week: number;
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

  const featured = rows.find((row) => row.featured) ?? null;
  const rest = rows.filter((row) => !row.featured);

  return (
    <div style={{ display: "grid", gap: "1.4rem" }}>
      {featured ? (
        <section>
          <div className="featured-head">
            <span className="chip-featured">Week {week} featured matchup</span>
            <span className="chip-multiplier">{FEATURED_MULTIPLIER}× points</span>
          </div>
          <MatchupCard row={featured} memberCount={memberCount} index={0} featured />
        </section>
      ) : null}

      <section style={{ display: "grid", gap: "0.55rem" }}>
        {!submitted ? (
          <p className="note" style={{ margin: "0 0 0.1rem" }}>
            Submit your picks to see how the league is split on each game.
          </p>
        ) : null}

        {rest.map((row, index) => (
          <MatchupCard key={row.id} row={row} memberCount={memberCount} index={index} />
        ))}
      </section>
    </div>
  );
}

/**
 * One game.
 *
 * Every state renders the same box — the live outline is drawn inside the
 * card's own edge rather than around it, so a live game does not sit a few
 * pixels wider than the final above it and the column stays straight.
 *
 * The featured card is the same card, scaled up: a taller bar and bigger type,
 * with the kickoff and the ground underneath, because a game worth two and a
 * half times the others should not have to be found.
 */
function MatchupCard({
  row,
  memberCount,
  index,
  featured = false,
}: {
  row: MatchupRow;
  memberCount: number;
  index: number;
  featured?: boolean;
}) {
  const live = row.status === "in_progress";
  // Period and clock when the feed has them, its own wording when it does not —
  // "3rd 4:22" beats "In Progress", but neither beats nothing.
  const clock =
    [row.period ? periodLabel(row.period) : null, row.clock].filter(Boolean).join(" ") ||
    row.statusDetail;

  const split = row.revealed && row.totalPicks > 0;
  // The bar is the split itself; with nothing to show yet it rests even.
  const base = split ? clampShare(row.away.pct) : 50;
  const decided = row.completed && row.winnerTeamId !== null;
  const awayWon = decided && row.winnerTeamId === row.away.teamId;
  const awayWidth = decided
    ? Math.min(
        100 - MIN_SHARE,
        Math.max(MIN_SHARE, base + (awayWon ? WINNER_BONUS : -WINNER_BONUS)),
      )
    : base;

  return (
    <Reveal delay={Math.min(index, 8) * 55}>
      <div
        className={`glass matchup surface-hover${live ? " is-live" : ""}${
          row.completed ? " is-final" : ""
        }${featured ? " is-featured" : ""}`}
        style={{ "--shine-delay": `${(index % 6) * 1.1}s` } as React.CSSProperties}
      >
        <div className="matchup-meta">
          {live ? (
            <span className="chip-live">
              <span className="chip-live-dot" aria-hidden />
              Live
            </span>
          ) : row.completed ? (
            <span className="chip-final">Final</span>
          ) : null}

          <span className="muted">
            {/* The featured card spells the kickoff out underneath, with the
                ground next to it, so printing it here too would just be the
                same fact twice on one card. */}
            {live ? (
              clock
            ) : row.completed || featured ? null : (
              <LocalTime iso={row.startTime} mode="kickoff" showZone />
            )}
          </span>
          {row.broadcast && !row.completed ? (
            <span className="muted">· {row.broadcast}</span>
          ) : null}
          {row.neutralSite ? <Badge tone="muted">Neutral</Badge> : null}
          <span style={{ marginLeft: "auto", display: "flex", gap: "0.35rem" }}>
            {!row.myTeamId ? <Badge tone="muted">No pick</Badge> : null}
          </span>
        </div>

        <div className={`tug${split ? " is-split" : ""}`}>
          <TeamSide side={row.away} row={row} home={false} width={awayWidth} />
          <TeamSide side={row.home} row={row} home width={100 - awayWidth} />
        </div>

        {/* The featured card earns the extra line: where and when, spelled out
            rather than left in the meta row where it would be one more muted
            fragment among several. */}
        {featured ? (
          <p className="featured-where">
            <LocalTime iso={row.startTime} mode="kickoff" showZone />
            {row.venue ? <span className="ticker-dot">·</span> : null}
            {row.venue}
          </p>
        ) : null}

        {split && row.totalPicks < memberCount ? (
          <p className="note" style={{ fontSize: "0.72rem" }}>
            {memberCount - row.totalPicks} of {memberCount}{" "}
            {memberCount - row.totalPicks === 1 ? "member" : "members"} had no pick here.
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}
