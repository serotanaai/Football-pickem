"use client";

import { useEffect, useState } from "react";

export type TimeMode = "kickoff" | "time" | "datetime";

const OPTIONS: Record<TimeMode, Intl.DateTimeFormatOptions> = {
  // "Sat, Sep 5, 3:30 PM"
  kickoff: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  // "3:30 PM"
  time: { hour: "numeric", minute: "2-digit" },
  // "Sep 5, 3:30 PM"
  datetime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

/** How kickoff times are published, and the fallback before the viewer's own zone is known. */
const PUBLISHED_ZONE = "America/New_York";

function render(iso: string, mode: TimeMode, timeZone: string | undefined, withZone: boolean) {
  const options: Intl.DateTimeFormatOptions = { ...OPTIONS[mode] };
  if (timeZone) options.timeZone = timeZone;
  if (withZone) options.timeZoneName = "short";
  return new Date(iso).toLocaleString(undefined, options);
}

/**
 * A timestamp in the viewer's own time zone.
 *
 * These render inside server components, where `toLocaleString` would otherwise
 * use the server's zone — UTC on Vercel — and show everyone the wrong kickoff.
 * The first paint (server and hydration alike) uses US Eastern, which is how
 * college football times are published, so the two agree and hydration is
 * clean; the effect then switches to whatever zone the browser is actually in.
 */
export function LocalTime({
  iso,
  mode = "kickoff",
  showZone = false,
}: {
  iso: string;
  mode?: TimeMode;
  showZone?: boolean;
}) {
  const [text, setText] = useState(() => render(iso, mode, PUBLISHED_ZONE, showZone));

  useEffect(() => {
    setText(render(iso, mode, undefined, showZone));
  }, [iso, mode, showZone]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
