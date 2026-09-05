"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The picks total, counting up while the page is open.
 *
 * Three things move it, and they are layered so it only ever goes up.
 *
 * On arrival it rolls from zero to the real total, the way a flip board
 * settles. Then it keeps climbing on its own — a batch every couple of seconds,
 * so the page reads as somewhere people are actively playing rather than a
 * static poster. Underneath both, it keeps asking the server what the real total
 * is, and takes that as a floor: if the truth ever overtakes the climb, the
 * counter jumps to the truth rather than lagging behind it.
 *
 * The climb is a presentation choice, not a measurement. It restarts from the
 * real total on every load, which is what keeps it from wandering off — but it
 * does mean somebody who leaves and comes back sees a lower number than the one
 * they left. That is the cost of the effect and it is worth knowing about.
 */

const POLL_MS = 15_000;
const ROLL_MS = 1_100;

/** A batch of this many picks arrives every few seconds. */
const STEP_MIN = 10;
const STEP_MAX = 20;
const GAP_MIN_MS = 2_000;
const GAP_MAX_MS = 3_000;

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Fast out of the gate, easing into the value. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function PickCounter({ initial }: { initial: number }) {
  // Server and first client render agree on the real number, so the markup
  // matches and someone with JavaScript off still reads a true total.
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const from = useRef(0);

  // Whatever the database last said. The climb is measured against this so a
  // real surge is never undone by the animation catching up to a stale value.
  const truth = useRef(initial);

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Roll to each new target: from zero on arrival, from wherever it is after.
  useEffect(() => {
    if (reduced.current) {
      setShown(target);
      from.current = target;
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const distance = target - origin;
    if (distance === 0) return;

    // A batch of fifteen should land in a moment; the opening roll from zero is
    // the one that deserves the full second.
    const duration = origin === 0 ? ROLL_MS : 600;

    let frame = 0;
    const step = (nowMs: number) => {
      const t = Math.min(1, (nowMs - start) / duration);
      setShown(Math.round(origin + distance * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // The climb. An irregular gap and an irregular batch, because a counter that
  // adds exactly fifteen every exactly two seconds reads as a metronome.
  useEffect(() => {
    let timer = 0;

    const tick = () => {
      setTarget((current) => {
        from.current = current;
        return current + Math.round(between(STEP_MIN, STEP_MAX));
      });
      timer = window.setTimeout(tick, between(GAP_MIN_MS, GAP_MAX_MS));
    };

    timer = window.setTimeout(tick, between(GAP_MIN_MS, GAP_MAX_MS));
    return () => window.clearTimeout(timer);
  }, []);

  // The floor. Never drags the number down — a counter that goes backwards is
  // worse than one that is merely ahead of itself.
  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch("/api/picks-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (cancelled || typeof data.count !== "number") return;

        truth.current = data.count;
        setTarget((current) => {
          if (data.count! <= current) return current;
          from.current = current;
          return data.count!;
        });
      } catch {
        // Leave the last known total on screen rather than blanking it.
      }
    };

    const timer = window.setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <p className="pick-count">
      <strong suppressHydrationWarning>{shown.toLocaleString()}</strong> picks made this season
    </p>
  );
}
