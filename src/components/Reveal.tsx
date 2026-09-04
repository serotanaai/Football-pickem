"use client";

import { useEffect, useRef } from "react";

/**
 * One observer for the whole page.
 *
 * A slate can be fifteen cards, and fifteen IntersectionObservers watching one
 * element each costs more than one watching fifteen.
 */
let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (observer) return observer;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer?.unobserve(entry.target);
        // Drop the compositor layer once it has arrived; this is an entrance,
        // not an effect that should keep paying rent for the whole session.
        window.setTimeout(() => entry.target.classList.add("is-settled"), 900);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );

  return observer;
}

/**
 * Fades and lifts its children into place the first time they scroll into view.
 *
 * The hidden state hangs off the `js` class the document head sets before
 * first paint, so content stays visible to crawlers and to anyone whose bundle
 * never arrives.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
  style,
}: {
  children: React.ReactNode;
  /** Stagger, in ms, for items revealed as a group. */
  delay?: number;
  as?: "div" | "section" | "li";
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = shared();
    if (!io || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in", "is-settled");
      return;
    }

    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={className ? `reveal ${className}` : "reveal"}
      style={delay ? ({ ...style, "--reveal-delay": `${delay}ms` } as React.CSSProperties) : style}
    >
      {children}
    </Tag>
  );
}
