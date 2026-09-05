"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The picks total, counted up rather than simply printed.
 *
 * Two kinds of movement, and the difference between them is the whole point.
 *
 * On arrival the number rolls up to the real total — an entrance, the way a
 * flip board settles, and it lands on the truth within a second. Nobody reads a
 * value flashing past mid-roll as a claim about anything.
 *
 * After that it only moves when the total actually moves. It asks the server
 * every few seconds and animates to whatever comes back, so a Saturday morning
 * with people filling in their cards climbs in front of you. A quiet Tuesday
 * holds still, which is the honest thing for it to do — a counter that drifts
 * upward on its own is claiming picks nobody made, and it only takes one person
 * opening two tabs to catch it.
 */

const POLL_MS = 8_000;
const ROLL_MS = 1_100;

/** Fast out of the gate, easing into the final value. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function PickCounter({ initial }: { initial: number }) {
  // Server and first client render agree on the real number, so the markup
  // matches and someone with JavaScript off still reads a true total.
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const from = useRef(0);

  // Roll from zero on arrival, then from wherever it is to wherever it lands.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const distance = target - origin;
    if (distance === 0) return;

    let frame = 0;
    const step = (nowMs: number) => {
      const t = Math.min(1, (nowMs - start) / ROLL_MS);
      setShown(Math.round(origin + distance * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // The real total, asked for rather than assumed.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/picks-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") {
          setTarget((current) => {
            if (data.count === current) return current;
            from.current = current;
            return data.count!;
          });
        }
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
