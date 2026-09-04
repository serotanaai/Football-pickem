import { Suspense } from "react";
import { Badge } from "@/components/Badge";
import { TeamChip } from "@/components/TeamChip";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, parseWeek, resolveCurrentWeek, weekRange } from "@/lib/league";
import { isLocked, loadMembers, loadWeekBoard } from "@/lib/board";
import { ordinal } from "@/lib/format";
import { WeekPicker } from "../WeekPicker";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;

  const { league, userId } = await loadLeague(slug);
  const week = parseWeek(league, weekParam, await resolveCurrentWeek(league.season));

  const supabase = await createClient();
  const [members, board, { data: picks }, { data: results }] = await Promise.all([
    loadMembers(league.id),
    loadWeekBoard(league.id, week),
    supabase.from("picks").select("*").eq("league_id", league.id).eq("week", week),
    supabase
      .from("weekly_results_ranked")
      .select("*")
      .eq("league_id", league.id)
      .eq("week", week),
  ]);

  const resultByUser = new Map((results ?? []).map((row) => [row.user_id, row]));
  const pickKey = (userId: string, gameId: number) => `${userId}:${gameId}`;
  const pickByKey = new Map(
    (picks ?? []).map((pick) => [pickKey(pick.user_id, pick.game_id), pick]),
  );

  const rows = members
    .map((member) => {
      const result = resultByUser.get(member.user_id);
      return {
        ...member,
        points: result?.points ?? 0,
        correct: result?.correct ?? 0,
        incorrect: result?.incorrect ?? 0,
        rank: result?.week_rank ?? null,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const anyGraded = board.games.some((game) => game.completed);
  const winners = rows.filter((row) => row.rank === 1 && row.points > 0);
  // A pick reveals when its own game kicks off, matching how it locked.
  const shownGames = board.games.filter((game) => isLocked(game));

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Week {week} results</h2>
        <Suspense fallback={null}>
          <WeekPicker
            weeks={weekRange(league)}
            current={week}
            regularSeasonEndWeek={league.regular_season_end_week}
          />
        </Suspense>
      </div>

      {winners.length > 0 && anyGraded ? (
        <div
          className="surface"
          style={{
            padding: "1rem 1.15rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          <Badge tone="accent">🏆 Week {week} winner</Badge>
          <strong>{winners.map((w) => w.name).join(" and ")}</strong>
          <span className="muted" style={{ fontSize: "0.88rem" }}>
            {winners[0].points.toLocaleString()} points
            {winners.length > 1 ? " (tied)" : ""}
          </span>
        </div>
      ) : null}

      <div className="surface" style={{ overflow: "hidden", marginBottom: "1.5rem" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Member</th>
              <th style={{ textAlign: "right" }}>Points</th>
              <th style={{ textAlign: "right" }}>Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.user_id}>
                <td className="muted">{ordinal(index + 1)}</td>
                <td style={{ fontWeight: row.user_id === userId ? 700 : 500 }}>{row.name}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  <strong>{row.points.toLocaleString()}</strong>
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

      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.6rem" }}>Pick sheet</h3>
      {shownGames.length === 0 ? (
        <div className="surface" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Picks stay hidden until each game kicks off. Nothing in week {week} has started
            yet.
          </p>
        </div>
      ) : (
        <div className="surface" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 210 }}>Game</th>
                {rows.map((row) => (
                  <th key={row.user_id} style={{ textAlign: "center", minWidth: 92 }}>
                    {row.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownGames.map((game) => (
                <tr key={game.id}>
                  <td>
                    <div style={{ display: "grid", gap: "0.2rem" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <TeamChip team={game.away} rank={game.away_rank} size={18} />
                        {game.away_score !== null ? (
                          <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {game.away_score}
                          </span>
                        ) : null}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <span className="muted" style={{ fontSize: "0.7rem" }}>
                          @
                        </span>
                        <TeamChip team={game.home} rank={game.home_rank} size={18} />
                        {game.home_score !== null ? (
                          <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {game.home_score}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>

                  {rows.map((row) => {
                    const pick = pickByKey.get(pickKey(row.user_id, game.id));
                    if (!pick) {
                      return (
                        <td key={row.user_id} style={{ textAlign: "center" }}>
                          <span className="muted">—</span>
                        </td>
                      );
                    }

                    const team =
                      pick.team_id === game.home_team_id ? game.home : game.away;
                    const correct = pick.is_correct;

                    return (
                      <td key={row.user_id} style={{ textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.85rem",
                            color:
                              correct === true
                                ? "var(--accent)"
                                : correct === false
                                  ? "var(--muted)"
                                  : "var(--text)",
                            textDecoration: correct === false ? "line-through" : "none",
                          }}
                        >
                          {team?.abbreviation ?? team?.school ?? "?"}
                          {correct === true ? " ✓" : ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
