"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function WeekPicker({
  weeks,
  current,
  regularSeasonEndWeek,
}: {
  weeks: number[];
  current: number;
  regularSeasonEndWeek: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(week: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", String(week));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <label htmlFor="week-select" style={{ margin: 0 }}>
        Week
      </label>
      <select
        id="week-select"
        value={current}
        onChange={(event) => go(Number(event.target.value))}
        style={{ width: "auto", minWidth: 190 }}
      >
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
