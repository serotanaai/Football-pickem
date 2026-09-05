"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TickerGame, TickerState } from "@/lib/ticker";
import {
  countdownLine,
  finalLine,
  liveLine,
  pendingLine,
  recapLine,
} from "@/lib/tickerCopy";

/**
 * A single line of scoreboard, pinned to the top of the page.
 *
 * Two clocks run here and they run at different speeds on purpose. The
 * countdown ticks every second off a timestamp the server already sent, so it
 * stays honest without asking the network anything. Scores are the opposite —
 * they only change when the cron writes them — so they are re-fetched on a slow
 * poll and only while a game is actually on.
 */

const POLL_MS = 45_000;
const ROTATE_MS = 4_500;
const NARROW_PX = 560;

export function Ticker({ initial }: { initial: TickerState }) {
  const [state, setState] = useState(initial);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Starts false so the server's markup and the first client render agree; the
  // effect below corrects it before paint on a narrow screen.
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
        // A failed poll leaves the last good line on screen, which is better
        // than blanking the bar because one request lost the network.
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
  const refetch = useRef(false);
  useEffect(() => {
    if (!expired || refetch.current) return;
    refetch.current = true;
    fetch("/api/ticker", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next: TickerState | null) => {
        if (next) setState(next);
        refetch.current = false;
      })
      .catch(() => {
        refetch.current = false;
      });
  }, [expired]);

  const games: TickerGame[] = state.kind === "live" ? state.games : [];

  // Rotation, only when there is more than one thing to rotate through.
  useEffect(() => {
    if (games.length < 2) return;
    setIndex((i) => (i < games.length ? i : 0));
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % games.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [games.length]);

  const line = render(state, games, index, now, narrow);
  if (!line) return null;

  return (
    <div className="ticker" role="status" aria-live="polite">
      <div className="ticker-inner">
        <span className="ticker-line" key={line.key}>
          {line.text}
        </span>
        {line.href ? (
          <Link className="ticker-more" href={line.href}>
            {line.hrefLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

type Line = { key: string; text: string; href?: string; hrefLabel?: string };

function render(
  state: TickerState,
  games: TickerGame[],
  index: number,
  now: number,
  narrow: boolean,
): Line | null {
  switch (state.kind) {
    case "live": {
      const game = games[Math.min(index, games.length - 1)];
      if (!game) return null;
      return {
        key: `live-${game.id}`,
        // A game that has just gone final still rides the live rotation, but it
        // says FINAL, because calling a finished game live is a lie the bar
        // would tell for up to an hour.
        text: game.justFinished ? finalLine(game, narrow) : liveLine(game, narrow),
      };
    }
    case "countdown":
      return {
        key: "countdown",
        text: countdownLine(state.week, new Date(state.kickoff).getTime() - now),
      };
    case "recap":
      return {
        key: "recap",
        text: recapLine(state.week, state.games, state.total, narrow),
        href: "/join",
        hrefLabel: "See leagues",
      };
    case "pending":
      return { key: "pending", text: pendingLine(state.week) };
    case "idle":
      return null;
  }
}
