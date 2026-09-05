"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls, one digit column at a time.
 *
 * Each digit is a window onto a strip of 0-9 that slides upward, so a 3 turning
 * into a 4 lifts the 3 out of the frame and brings the 4 in from below. The
 * strip moves under a CSS transition, which is what makes this the animation
 * rather than something driven from JavaScript on every frame — a transition
 * restarted sixty times a second never gets anywhere.
 *
 * The strip moves in multiples of a cell height set in CSS, not in ems, because
 * the cell has to be taller than the type — at exactly 1em the numerals paint
 * outside their line box and the digit above shows as a sliver along the top of
 * every column.
 *
 * Two details do the work.
 *
 * A column always rolls forward. Going 9 to 0 is one step up, not nine steps
 * back, so the strip carries two runs of 0-9 and a column that climbs past the
 * first is snapped back by ten once the transition ends — with transitions off
 * for that frame, so the jump is invisible. Without it a carry would visibly
 * spin the wrong way.
 *
 * And a digit further left starts a little later, the way a mechanical counter
 * carries: the ones are already moving when the tens begin to follow.
 */

const ROLL_MS = 620;
const STAGGER_MS = 45;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Odometer({ value }: { value: number }) {
  const text = value.toLocaleString();
  const chars = text.split("");

  // How many columns are digits, counted from the right, so the stagger is
  // measured from the ones place rather than from the start of the string.
  let place = chars.filter((c) => /\d/.test(c)).length;

  return (
    <span className="odo" aria-hidden>
      {chars.map((char, i) => {
        if (!/\d/.test(char)) {
          return (
            <span className="odo-sep" key={`s${i}`}>
              {char}
            </span>
          );
        }
        place -= 1;
        return <Column key={`d${i}`} digit={Number(char)} delay={place * STAGGER_MS} />;
      })}
    </span>
  );
}

function Column({ digit, delay }: { digit: number; delay: number }) {
  const strip = useRef<HTMLSpanElement>(null);
  // Where the strip sits, in cells. Lives in a ref rather than in state because
  // it is a position on screen, not something the render needs to reason about.
  const pos = useRef(digit);
  const previous = useRef(digit);
  const [, force] = useState(0);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    if (digit === previous.current) return;

    // Always forward: 9 to 0 is one step up, never nine steps back.
    const steps = (digit - previous.current + 10) % 10;
    previous.current = digit;
    pos.current += steps;
    el.style.transitionDelay = `${delay}ms`;
    el.style.setProperty("--pos", String(pos.current));

    // Once it has come to rest past the first run of ten, drop back by a run
    // with the transition off. Same digit on screen, room to keep climbing.
    const settle = window.setTimeout(() => {
      if (pos.current < 10) return;
      pos.current -= 10;
      el.style.transition = "none";
      el.style.setProperty("--pos", String(pos.current));
      // Read a layout property to commit that frame before transitions return,
      // or the browser coalesces both changes and animates the snap.
      void el.offsetHeight;
      el.style.transition = "";
      force((n) => n + 1);
    }, ROLL_MS + delay + 30);

    return () => window.clearTimeout(settle);
  }, [digit, delay]);

  return (
    <span className="odo-col">
      <span
        className="odo-strip"
        ref={strip}
        style={{ ["--pos" as string]: pos.current }}
      >
        {/* Two runs, so a column can always climb into the next one. */}
        {[...DIGITS, ...DIGITS].map((d, i) => (
          <span className="odo-cell" key={i}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
