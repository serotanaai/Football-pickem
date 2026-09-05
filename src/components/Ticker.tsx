"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerGame, TickerState } from "@/lib/ticker";
import { LocalTime } from "@/components/LocalTime";
import {
  countdownLine,
  finalLine,
  liveLine,
  matchupLine,
  pendingLine,
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
              {matchupLine(state.game, narrow)}
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

  const items =
    state.kind === "live"
      ? state.games.map((g) => ({
          id: g.id,
          // A game that just went final still rides the tape, but it says
          // FINAL: calling a finished game live is a lie the bar would tell for
          // up to an hour.
          text: g.justFinished ? finalLine(g, narrow) : liveLine(g, narrow),
        }))
      : [
          { id: -1, text: recapLabel(state.week) },
          ...state.games.map((g: TickerGame) => ({ id: g.id, text: recapScore(g, narrow) })),
        ];

  return (
    <Bar>
      <Marquee items={items} />
    </Bar>
  );
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
function Marquee({ items }: { items: { id: number; text: string }[] }) {
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

  const copy = (
    <span className="ticker-run" ref={run}>
      {items.map((item) => (
        <span className="ticker-item" key={item.id}>
          {item.text}
        </span>
      ))}
    </span>
  );

  return (
    <div className="ticker-window">
      <div
        className="ticker-track"
        style={seconds > 0 ? { animationDuration: `${seconds}s` } : undefined}
      >
        {copy}
        {/* The understudy. Hidden from screen readers, which would otherwise
            hear every score twice. */}
        <span className="ticker-run" aria-hidden>
          {items.map((item) => (
            <span className="ticker-item" key={`echo-${item.id}`}>
              {item.text}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
