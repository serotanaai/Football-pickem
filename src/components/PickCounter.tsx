"use client";

import { useEffect, useRef, useState } from "react";
import { Odometer } from "@/components/Odometer";

/**
 * The picks total, counting up while the page is open.
 *
 * The number is handed straight to the odometer, which does the animating in
 * CSS. Nothing here interpolates between values — that job moved into the digit
 * columns, and it had to: a transition restarted on every animation frame never
 * finishes, so the two approaches cannot both be running.
 *
 * Three things move it, layered so it only ever goes up. It rolls up from zero
 * on arrival. It climbs on its own, a batch every couple of seconds, so the page
 * reads as somewhere people are playing rather than a static poster. And it
 * keeps asking the server for the real total, which acts as a floor: if the
 * truth overtakes the climb, the counter jumps to the truth.
 *
 * The climb is a presentation choice, not a measurement. It restarts from the
 * real total on every load, which is what keeps it from wandering off — and does
 * mean somebody who leaves and comes back sees a lower number than the one they
 * left.
 */

const POLL_MS = 15_000;

/** A batch of this many picks arrives every few seconds. */
const STEP_MIN = 10;
const STEP_MAX = 20;
const GAP_MIN_MS = 2_000;
const GAP_MAX_MS = 3_000;

const between = (min: number, max: number) => min + Math.random() * (max - min);

export function PickCounter({ initial }: { initial: number }) {
  // Server and first client render agree on the real number, so the markup
  // matches and someone with JavaScript off still reads a true total.
  const [value, setValue] = useState(initial);

  // The opening roll: every column starts at zero and climbs to the real total.
  // Skipped under reduced motion, where the number simply is what it is.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBooted(true);
      return;
    }
    const frame = requestAnimationFrame(() => setBooted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The climb. An irregular gap and an irregular batch, because a counter that
  // adds exactly fifteen every exactly two seconds reads as a metronome.
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setValue((current) => current + Math.round(between(STEP_MIN, STEP_MAX)));
      timer = window.setTimeout(tick, between(GAP_MIN_MS, GAP_MAX_MS));
    };
    timer = window.setTimeout(tick, between(GAP_MIN_MS, GAP_MAX_MS));
    return () => window.clearTimeout(timer);
  }, []);

  // The floor. Never drags the number down — a counter that goes backwards is
  // worse than one that is merely ahead of itself.
  const truth = useRef(initial);
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/picks-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (cancelled || typeof data.count !== "number") return;
        truth.current = data.count;
        setValue((current) => Math.max(current, data.count!));
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

  // Zero, padded to the width of the real number, so the columns are all in
  // place before they start climbing and nothing reflows mid-roll.
  const zeroed = Number(value.toLocaleString().replace(/\d/g, "0").replace(/\D/g, "")) || 0;

  return (
    <p className="pick-count">
      <strong>
        <Odometer value={booted ? value : zeroed} />
        {/* The odometer is a stack of digit strips; this is the number itself,
            for anything reading the page rather than looking at it. */}
        <span className="sr-only">{value.toLocaleString()}</span>
      </strong>{" "}
      picks made this season
    </p>
  );
}
