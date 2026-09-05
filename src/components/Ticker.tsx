"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerGame, TickerState } from "@/lib/ticker";
import { LocalTime } from "@/components/LocalTime";
import {
  countdownLine,
  finalLine,
  liveLabel,
  liveLine,
  matchupLine,
  pendingLine,
  periodLabel,
  recapLabel,
  recapScore,
} from "@/lib/tickerCopy";

/**
 * The scoreboard strip: a tape when there are scores, a sign when there are not.
 *
 * Scores scroll, because there are a dozen of them and a bar that swaps one for
 * another every few seconds asks the reader to wait for the game they care
 * about. A countdown is one fact that changes once a second and holds still,
 * because there is nothing to scroll past and motion under a headline you are
 * trying to read is just noise.
 */

const POLL_MS = 45_000;
const NARROW_PX = 560;
/** Reading speed, not animation speed: the duration follows the content. */
const PIXELS_PER_SECOND = 55;
/** Scores between one badge and the next. */
const GAMES_PER_BADGE = 3;

export function Ticker({ initial }: { initial: TickerState }) {
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  // Starts false so the server's markup and the first client render agree; the
  // effect corrects it on a narrow screen before anything is painted.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${NARROW_PX}px)`);
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const live = state.kind === "live";
  const counting = state.kind === "countdown";

  // Scores: polled, and only while something is on. A countdown needs no
  // network at all until it runs out, which the tick below notices.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch("/api/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as TickerState;
        if (!cancelled) setState(next);
      } catch {
        // A failed poll leaves the last good tape on screen, which beats
        // blanking the bar because one request lost the network.
      }
    };

    const timer = window.setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live]);

  // The countdown's own second hand.
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  // Kickoff arrived: the countdown has nothing left to count, so ask the server
  // what the bar says now rather than sitting on "under a minute".
  const kickoff = counting ? new Date(state.kickoff).getTime() : null;
  const expired = kickoff !== null && kickoff <= now;
  const pending = useRef(false);
  useEffect(() => {
    if (!expired || pending.current) return;
    pending.current = true;
    fetch("/api/ticker", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next: TickerState | null) => {
        if (next) setState(next);
        pending.current = false;
      })
      .catch(() => {
        pending.current = false;
      });
  }, [expired]);

  if (state.kind === "idle") return null;

  if (state.kind === "countdown") {
    return (
      <Bar>
        <span className="ticker-static">
          <strong>{countdownLine(state.week, (kickoff ?? now) - now)}</strong>
          {state.game ? (
            <>
              <Dot />
              <span aria-label={matchupLine(state.game, narrow)}>
                <span aria-hidden>
                  <Crest src={state.game.awayLogo} name={state.game.awayTeam} />
                  {narrow ? state.game.awayAbbr : state.game.awayTeam} at{" "}
                  <Crest src={state.game.homeLogo} name={state.game.homeTeam} />
                  {narrow ? state.game.homeAbbr : state.game.homeTeam}
                </span>
              </span>
              <Dot />
              <LocalTime iso={state.game.startTime} mode="kickoff" showZone />
            </>
          ) : null}
        </span>
      </Bar>
    );
  }

  if (state.kind === "pending") {
    return (
      <Bar>
        <span className="ticker-static">{pendingLine(state.week)}</span>
      </Bar>
    );
  }

  const scores: Item[] = state.games.map((g: TickerGame) => ({
    key: `g${g.id}`,
    game: g,
    // A game that just went final still rides the tape, but it says FINAL:
    // calling a finished game live is a lie the bar would tell for up to an
    // hour.
    live: state.kind === "live" && !g.justFinished,
    // The sentence stays the label even though the visual splits it around two
    // logos, so a screen reader hears the score as a sentence rather than as
    // fragments either side of an image.
    text:
      state.kind === "live"
        ? g.justFinished
          ? finalLine(g, narrow)
          : liveLine(g, narrow)
        : recapScore(g, narrow),
    short: narrow,
  }));

  const badge = state.kind === "live" ? liveLabel(state.week) : recapLabel(state.week);

  return (
    <Bar>
      <Marquee items={withBadges(scores, badge)} />
    </Bar>
  );
}

type Item = {
  key: string;
  text: string;
  badge?: true;
  game?: TickerGame;
  live?: boolean;
  short?: boolean;
};

/**
 * A badge at the front and every few scores after it.
 *
 * A tape you glance at gives you a score with no idea which week it belongs to,
 * and a single label at the head of the run is off screen most of the time. So
 * it repeats — often enough to always be a moment away, rarely enough not to
 * crowd out the scores it is labelling.
 */
function withBadges(scores: Item[], text: string): Item[] {
  if (scores.length === 0) return [];

  const out: Item[] = [];
  scores.forEach((item, i) => {
    if (i % GAMES_PER_BADGE === 0) out.push({ key: `badge-${i}`, text, badge: true });
    out.push(item);
  });
  return out;
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="ticker" role="status" aria-live="polite">
      <div className="ticker-inner">{children}</div>
    </div>
  );
}

function Dot() {
  return <span className="ticker-dot" aria-hidden>·</span>;
}

/**
 * The tape.
 *
 * The run of items is rendered twice and the pair slid left by exactly half its
 * width, so the moment the first copy leaves the frame the second is sitting
 * where it started and the loop is seamless. The duration is measured from the
 * content rather than fixed, so twelve games scroll at the same reading speed
 * as three rather than three times as fast.
 */
function Marquee({ items }: { items: Item[] }) {
  const run = useRef<HTMLSpanElement>(null);
  const [seconds, setSeconds] = useState(0);

  // The content itself, not the array holding it: a poll that returns the same
  // scores rebuilds the array, and re-measuring on that would restart the
  // animation and jump the tape back to the start.
  const signature = items.map((i) => i.text).join("|");

  useEffect(() => {
    const measure = () => {
      const width = run.current?.offsetWidth ?? 0;
      setSeconds(width > 0 ? width / PIXELS_PER_SECOND : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [signature]);

  const run1 = items.map((item) => <Cell item={item} key={item.key} />);
  const run2 = items.map((item) => <Cell item={item} key={`echo-${item.key}`} />);

  return (
    <div className="ticker-window">
      <div
        className="ticker-track"
        style={seconds > 0 ? { animationDuration: `${seconds}s` } : undefined}
      >
        <span className="ticker-run" ref={run}>
          {run1}
        </span>
        {/* The understudy. Hidden from screen readers, which would otherwise
            hear every score twice. */}
        <span className="ticker-run" aria-hidden>
          {run2}
        </span>
      </div>
    </div>
  );
}

/**
 * One stop on the tape.
 *
 * A score is drawn from its parts so a crest can sit against the team it
 * belongs to, but the label stays the whole sentence — the logos are there to
 * be recognised at a glance, not to carry meaning nothing else carries.
 */
function Cell({ item }: { item: Item }) {
  if (item.badge || !item.game) {
    return <span className={item.badge ? "ticker-item is-badge" : "ticker-item"}>{item.text}</span>;
  }

  const g = item.game;
  const short = item.short === true;

  return (
    <span className="ticker-item" aria-label={item.text}>
      <span aria-hidden className="ticker-score">
        <span className={item.live ? "ticker-tag is-live" : "ticker-tag"}>
          {item.live ? "LIVE" : "FINAL"}
        </span>
        {/* Away first, home second — a game is "X at Y", and a scoreboard names
            the visiting side first. */}
        <Side
          logo={g.awayLogo}
          name={short ? g.awayAbbr : g.awayTeam}
          full={g.awayTeam}
          rank={g.awayRank}
          score={g.awayScore}
          comma
        />
        <Side
          logo={g.homeLogo}
          name={short ? g.homeAbbr : g.homeTeam}
          full={g.homeTeam}
          rank={g.homeRank}
          score={g.homeScore}
        />
        {item.live && (g.period || g.clock) ? (
          <span className="ticker-clock">
            {[g.period ? periodLabel(g.period) : null, g.clock].filter(Boolean).join(" ")}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * One team's crest, rank, name and score, as a single unit.
 *
 * Grouping matters for spacing rather than for structure: the row is a flex
 * line with a gap, so left as loose tokens the gap lands between a score and
 * the comma after it too, and the punctuation drifts away from the number it
 * belongs to.
 */
function Side({
  logo,
  name,
  full,
  rank,
  score,
  comma,
}: {
  logo: string | null;
  name: string;
  full: string;
  rank: number | null;
  score: number | null;
  comma?: boolean;
}) {
  return (
    <span className="ticker-side">
      <Crest src={logo} name={full} />
      {rank ? <span className="ticker-rank">#{rank}</span> : null}
      <span className="ticker-name">{name}</span>
      {/* Score and its comma are one flex item, or the row's gap opens up
          between the number and the punctuation that belongs to it. */}
      <span className="ticker-num">
        <b>{score ?? 0}</b>
        {comma ? "," : null}
      </span>
    </span>
  );
}

/**
 * A team crest at a fixed size, always.
 *
 * The box is sized in CSS rather than by the image, which matters more here
 * than it looks: the tape sets its own scroll duration from the measured width
 * of one run, and a crest that arrives late and widens the row afterwards would
 * leave the animation running at a length the content no longer has — the seam
 * would drift open. A reserved box means the measurement is right before a
 * single image has loaded.
 */
function Crest({ src, name }: { src: string | null; name: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="ticker-crest"
      src={src}
      alt=""
      aria-hidden
      width={18}
      height={18}
      title={name}
      // A crest that fails to load is hidden rather than removed. Browsers draw
      // a torn-page glyph for a broken image, and two of those per score is
      // worse than no crest at all — but removing the element would shrink the
      // row and desync the measured scroll, so the box stays and only the
      // picture goes.
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
