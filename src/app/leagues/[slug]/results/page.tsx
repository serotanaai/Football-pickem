import { Suspense } from "react";
import { Badge } from "@/components/Badge";
import { TeamChip } from "@/components/TeamChip";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, parseWeek, resolveCurrentWeek, weekRange } from "@/lib/league";
import { isLocked, loadMembers, loadWeekBoard, weekIsSettled } from "@/lib/board";
import { ordinal } from "@/lib/format";
import { SEASON, WeekPicker } from "../WeekPicker";
import { SeasonStandings } from "./SeasonStandings";

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

  // "Season to date" is a mode rather than another week, so it rides the same
  // query parameter the weeks use: one control, one piece of state, and a
  // shareable URL for either.
  const seasonView = weekParam === SEASON;
  const week = parseWeek(league, weekParam, await resolveCurrentWeek(league.season));

  const picker = (
    <Suspense fallback={null}>
      <WeekPicker
        weeks={weekRange(league)}
        current={week}
        regularSeasonEndWeek={league.regular_season_end_week}
        includeSeason
        seasonSelected={seasonView}
      />
    </Suspense>
  );

  if (seasonView) {
    return <SeasonStandings league={league} userId={userId} picker={picker} />;
  }

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
    // week_rank first, because it is the only thing that knows the league's
    // tiebreak. Sorting on points and falling back to the alphabet put the
    // member who actually won the week below somebody they had beaten, under a
    // banner naming them the winner. Members who did not pick have no rank and
    // sit at the bottom.
    .sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        b.points - a.points ||
        a.name.localeCompare(b.name),
    );

  // A week has a winner when the week is over, and says nothing before then.
  // One graded game used to be enough here, which crowned somebody at lunchtime
  // and re-crowned them all afternoon; a running leader was no better, since
  // whoever is shown at the top of a half-played week is still not the winner.
  // The table below already shows where everyone stands.
  const winners = weekIsSettled(board.games)
    ? rows.filter((row) => row.rank === 1 && row.points > 0)
    : [];
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
        {picker}
      </div>

      {winners.length > 0 ? (
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
                <td className="muted">{ordinal(row.rank ?? index + 1)}</td>
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
