"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const SEASON = "season";

export function WeekPicker({
  weeks,
  current,
  regularSeasonEndWeek,
  /** Adds a season-to-date option above the weeks. Rankings only. */
  includeSeason = false,
  seasonSelected = false,
}: {
  weeks: number[];
  current: number;
  regularSeasonEndWeek: number;
  includeSeason?: boolean;
  seasonSelected?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(week: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", week);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <label htmlFor="week-select" style={{ margin: 0 }}>
        {includeSeason ? "Showing" : "Week"}
      </label>
      <select
        id="week-select"
        value={seasonSelected ? SEASON : current}
        onChange={(event) => go(event.target.value)}
        style={{ width: "auto", minWidth: 190 }}
      >
        {/* First, because it is the standing that decides the season — a week
            is one instalment of it. */}
        {includeSeason ? <option value={SEASON}>Season to date</option> : null}
        {weeks.map((week) => (
          <option key={week} value={week}>
            {week > regularSeasonEndWeek
              ? `Week ${week} · playoff round ${week - regularSeasonEndWeek}`
              : `Week ${week}`}
          </option>
        ))}
      </select>
    </div>
  );
}
