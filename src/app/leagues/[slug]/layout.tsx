import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/Badge";
import { loadLeague, requireUser } from "@/lib/league";
import { scopeBadge } from "@/lib/format";
import { LeagueTabs } from "./LeagueTabs";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const { league, conference, role } = await loadLeague(slug);

  return (
    <AppShell email={user.email}>
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.3rem",
          }}
        >
          <h1 style={{ fontSize: "1.45rem", margin: 0, letterSpacing: "-0.02em" }}>
            {league.name}
          </h1>
          <Badge tone="accent">{scopeBadge(league.scope, conference?.short_name)}</Badge>
          {role === "commissioner" ? <Badge tone="muted">Commissioner</Badge> : null}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
          {league.season} season · weeks {league.start_week}–{league.regular_season_end_week}
          {league.playoff_teams > 0
            ? ` · ${league.playoff_teams}-team playoff after week ${league.regular_season_end_week}`
            : " · no playoffs"}
        </p>
      </div>

      <LeagueTabs slug={slug} isCommissioner={role === "commissioner"} />
      {children}
    </AppShell>
  );
}
