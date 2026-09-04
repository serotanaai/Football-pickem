import { Suspense } from "react";
import { Badge } from "@/components/Badge";
import Link from "next/link";
import { ensureWeekBoard, isLocked, loadSubmission } from "@/lib/board";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, parseWeek, resolveCurrentWeek, weekRange } from "@/lib/league";
import { POINTS_PER_PICK, scopeLabel } from "@/lib/format";
import { LocalTime } from "@/components/LocalTime";
import { WeekPicker } from "../WeekPicker";
import { PickBoard, type PickGame } from "./PickBoard";

export const dynamic = "force-dynamic";

export default async function PicksPage({
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

  const { leagueWeek, games } = await ensureWeekBoard(league.id, week);
  const submission = await loadSubmission(league.id, userId, week);

  const supabase = await createClient();
  const { data: myPicks } = await supabase
    .from("picks")
    .select("game_id, team_id")
    .eq("league_id", league.id)
    .eq("user_id", userId)
    .eq("week", week);

  const initialPicks = Object.fromEntries(
    (myPicks ?? []).map((pick) => [pick.game_id, pick.team_id]),
  );

  const conferenceName = leagueWeek?.conference_id
    ? (
        await supabase
          .from("conferences")
          .select("name")
          .eq("id", leagueWeek.conference_id)
          .maybeSingle()
      ).data?.name
    : null;

  const boardGames: PickGame[] = games.map((game) => ({
    id: game.id,
    start_time: game.start_time,
    neutral_site: game.neutral_site,
    status: game.status,
    completed: game.completed,
    status_detail: game.status_detail,
    broadcast: game.broadcast,
    odds_details: game.odds_details,
    home_score: game.home_score,
    away_score: game.away_score,
    home_rank: game.home_rank,
    away_rank: game.away_rank,
    winner_team_id: game.winner_team_id,
    home: game.home,
    away: game.away,
    locked: isLocked(game),
  }));

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
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Week {week}</h2>
            {leagueWeek ? (
              <Badge tone="accent">{scopeLabel(leagueWeek.scope, conferenceName)}</Badge>
            ) : null}
            {leagueWeek?.is_playoff ? <Badge tone="muted">Playoff week</Badge> : null}
          </div>
          {leagueWeek?.lock_at ? (
            <p className="muted" style={{ margin: "0.3rem 0 0", fontSize: "0.85rem" }}>
              First kickoff <LocalTime iso={leagueWeek.lock_at} showZone />. Every game locks at its own
              kickoff, and each correct pick is worth {POINTS_PER_PICK} points.
            </p>
          ) : null}
        </div>

        <Suspense fallback={null}>
          <WeekPicker
            weeks={weekRange(league)}
            current={week}
            regularSeasonEndWeek={league.regular_season_end_week}
          />
        </Suspense>
      </div>

      {submission ? (
        <div className="surface" style={{ padding: "1.75rem 1.5rem", marginBottom: "1.5rem" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}
          >
            <Badge tone="accent">✓ Submitted</Badge>
            <strong style={{ fontSize: "1rem" }}>Week {week} is locked in</strong>
          </div>
          <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
            You submitted {submission.pick_count}{" "}
            {submission.pick_count === 1 ? "pick" : "picks"} on{" "}
            <LocalTime iso={submission.submitted_at} />. Picks are final once submitted, so there is
            nothing left to change this week.
          </p>
          <Link className="btn btn-primary" href={`/leagues/${slug}`}>
            Back to league overview
          </Link>
        </div>
      ) : null}

      {submission ? null : boardGames.length === 0 ? (
        <div className="surface" style={{ padding: "2.25rem 1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>No games on this week&apos;s slate yet.</p>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Schedules load from ESPN when the sync job runs. If this is a brand-new setup, run{" "}
            <code>/api/sync/teams</code> and then <code>/api/sync/games</code>.
          </p>
        </div>
      ) : (
        <PickBoard
          leagueId={league.id}
          slug={slug}
          week={week}
          games={boardGames}
          initialPicks={initialPicks}
        />
      )}
    </div>
  );
}
