import Link from "next/link";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, resolveCurrentWeek, weekRange } from "@/lib/league";
import { loadMembers, loadSubmission, loadWeekBoard, loadWeekConsensus } from "@/lib/board";
import { ordinal } from "@/lib/format";
import { WeekMatchups } from "./WeekMatchups";

export const dynamic = "force-dynamic";

export default async function LeagueOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { league, userId } = await loadLeague(slug);
  const currentWeek = await resolveCurrentWeek(league.season);
  const week = Math.min(Math.max(currentWeek, league.start_week), weekRange(league).at(-1)!);

  const supabase = await createClient();
  const [members, { data: standings }, { data: weekly }, board] = await Promise.all([
    loadMembers(league.id),
    supabase
      .from("league_standings")
      .select("*")
      .eq("league_id", league.id),
    supabase
      .from("weekly_results_ranked")
      .select("*")
      .eq("league_id", league.id)
      .order("week", { ascending: false }),
    loadWeekBoard(league.id, week),
  ]);

  const nameById = new Map(members.map((m) => [m.user_id, m.name]));

  const table = members
    .map((member) => {
      const row = (standings ?? []).find((s) => s.user_id === member.user_id);
      return {
        ...member,
        points: row?.points ?? 0,
        correct: row?.correct ?? 0,
        incorrect: row?.incorrect ?? 0,
        weeklyWins: row?.weekly_wins ?? 0,
      };
    })
    .sort((a, b) => b.weeklyWins - a.weeklyWins || b.points - a.points);

  const lastCompletedWeek = (weekly ?? []).find((row) => row.week < week)?.week ?? null;
  const lastWinners = lastCompletedWeek
    ? (weekly ?? []).filter((row) => row.week === lastCompletedWeek && row.week_rank === 1)
    : [];

  const consensus = await loadWeekConsensus(league.id, week, userId, board.games);
  const submission = await loadSubmission(league.id, userId, week);

  const myPickCount = board.games.length
    ? (
        await supabase
          .from("picks")
          .select("game_id", { count: "exact", head: true })
          .eq("league_id", league.id)
          .eq("user_id", userId)
          .eq("week", week)
      ).count ?? 0
    : 0;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div
        className="surface"
        style={{
          padding: "1.15rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: "0 0 0.2rem", fontWeight: 650 }}>
            Week {week}
            {board.leagueWeek?.is_playoff ? " · playoff" : ""}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {board.games.length === 0
              ? "No games loaded yet."
              : `${myPickCount} of ${board.games.length} picks in.`}
          </p>
        </div>
        <Link
          className="btn btn-primary"
          href={`/leagues/${slug}/picks?week=${week}`}
          style={{ marginLeft: "auto" }}
        >
          {submission ? "View submitted picks" : myPickCount > 0 ? "Review picks" : "Make picks"}
        </Link>
      </div>

      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.7rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Week {week} matchups</h2>
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            League picks and scores appear as each game kicks off
          </span>
        </div>
        <WeekMatchups
          games={board.games}
          consensus={consensus}
          memberCount={members.length}
        />
      </section>

      {lastWinners.length > 0 ? (
        <div className="surface" style={{ padding: "1.15rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <h2 style={{ fontSize: "0.95rem", margin: 0 }}>Week {lastCompletedWeek} winner</h2>
            <Badge tone="accent">🏆</Badge>
          </div>
          <p style={{ margin: 0, fontSize: "0.92rem" }}>
            {lastWinners.map((w) => nameById.get(w.user_id) ?? "Member").join(" and ")} —{" "}
            {lastWinners[0].points} {lastWinners[0].points === 1 ? "point" : "points"}
          </p>
          <Link
            href={`/leagues/${slug}/results?week=${lastCompletedWeek}`}
            style={{ fontSize: "0.85rem", color: "var(--accent)" }}
          >
            See the full week →
          </Link>
        </div>
      ) : null}

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.7rem" }}>Season standings</h2>
        <div className="surface" style={{ overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Member</th>
                <th style={{ textAlign: "right" }}>Week wins</th>
                <th style={{ textAlign: "right" }}>Points</th>
                <th style={{ textAlign: "right" }}>Record</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, index) => (
                <tr key={row.user_id}>
                  <td className="muted">{ordinal(index + 1)}</td>
                  <td>
                    <span style={{ fontWeight: row.user_id === userId ? 700 : 500 }}>
                      {row.name}
                    </span>
                    {row.role === "commissioner" ? (
                      <span style={{ marginLeft: "0.4rem" }}>
                        <Badge tone="muted">C</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <strong>{row.weeklyWins}</strong>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.points.toLocaleString()}
                  </td>
                  <td
                    className="muted"
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.correct}–{row.incorrect}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.55rem 0 0" }}>
          100 points per correct pick. Ordered the way the playoff bracket seeds: weekly wins
          first, total points breaking ties. Totals only count games that have kicked off, so an
          in-progress week fills in as it goes.
        </p>
      </section>
    </div>
  );
}
