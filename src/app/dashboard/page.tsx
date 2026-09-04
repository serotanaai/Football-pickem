import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/Badge";
import { Reveal } from "@/components/Reveal";
import { CapNotice, LeagueActionButton } from "@/components/CapNotice";
import { createClient } from "@/lib/supabase/server";
import {
  leagueCountThisSeason,
  MAX_LEAGUES_PER_SEASON,
  requireUser,
} from "@/lib/league";
import { ordinal, scopeBadge } from "@/lib/format";
import { DEFAULT_SEASON } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("league_members")
    .select("role, joined_at, league_id")
    .eq("user_id", user.id);

  const leagueIds = (memberships ?? []).map((m) => m.league_id);

  const [{ data: leagues }, { data: conferences }, { data: standings }, { data: counts }] =
    await Promise.all([
      leagueIds.length
        ? supabase.from("leagues").select("*").in("id", leagueIds)
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("conferences").select("id, short_name, name"),
      leagueIds.length
        ? supabase
            .from("league_standings")
            .select("league_id, user_id, points, correct, incorrect")
            .in("league_id", leagueIds)
        : Promise.resolve({ data: [] as never[] }),
      leagueIds.length
        ? supabase.from("league_members").select("league_id, user_id").in("league_id", leagueIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const conferenceById = new Map((conferences ?? []).map((c) => [c.id, c]));
  const roleByLeague = new Map((memberships ?? []).map((m) => [m.league_id, m.role]));

  const memberCount = new Map<string, number>();
  for (const row of counts ?? []) {
    memberCount.set(row.league_id, (memberCount.get(row.league_id) ?? 0) + 1);
  }

  const myStanding = new Map<string, { points: number; place: number }>();
  const byLeague = new Map<string, { user_id: string; points: number }[]>();
  for (const row of standings ?? []) {
    const list = byLeague.get(row.league_id) ?? [];
    list.push({ user_id: row.user_id, points: row.points });
    byLeague.set(row.league_id, list);
  }
  for (const [leagueId, rows] of byLeague) {
    rows.sort((a, b) => b.points - a.points);
    const index = rows.findIndex((r) => r.user_id === user.id);
    if (index >= 0) {
      myStanding.set(leagueId, { points: rows[index].points, place: index + 1 });
    }
  }

  const sorted = [...(leagues ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const leagueCount = await leagueCountThisSeason(user.id, DEFAULT_SEASON);
  const atCap = leagueCount >= MAX_LEAGUES_PER_SEASON;

  return (
    <AppShell email={user.email}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", margin: 0, letterSpacing: "-0.02em" }}>My leagues</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <LeagueActionButton href="/join" atCap={atCap}>
            Join a league
          </LeagueActionButton>
          <LeagueActionButton href="/leagues/new" atCap={atCap} primary>
            New league
          </LeagueActionButton>
        </div>
      </div>

      {atCap ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <CapNotice count={leagueCount} season={DEFAULT_SEASON} />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="surface" style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>No leagues yet.</p>
          <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
            Create one and send your friends the invite link, or paste an invite link you were
            sent.
          </p>
          <LeagueActionButton href="/leagues/new" atCap={atCap} primary>
            Create a league
          </LeagueActionButton>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "0.85rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {sorted.map((league, index) => {
            const conference = league.conference_id
              ? conferenceById.get(league.conference_id)
              : null;
            const standing = myStanding.get(league.id);

            return (
              <Reveal key={league.id} delay={index * 60}>
                <Link
                  href={`/leagues/${league.slug}`}
                  className="surface surface-hover"
                  style={{ padding: "1.05rem 1.15rem", textDecoration: "none", display: "block" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ fontSize: "1rem" }}>{league.name}</strong>
                    <Badge tone="accent">{scopeBadge(league.scope, conference?.short_name)}</Badge>
                    {roleByLeague.get(league.id) === "commissioner" ? (
                      <Badge tone="muted">Commissioner</Badge>
                    ) : null}
                  </div>

                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    {league.season} season · {memberCount.get(league.id) ?? 1}{" "}
                    {(memberCount.get(league.id) ?? 1) === 1 ? "member" : "members"}
                    {standing
                      ? ` · you're ${standing.place === 1 ? "leading" : ordinal(standing.place)} with ${standing.points} pts`
                      : ""}
                  </p>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
