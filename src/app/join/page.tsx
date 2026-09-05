import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/Badge";
import { Reveal } from "@/components/Reveal";
import { CapNotice, LeagueActionButton } from "@/components/CapNotice";
import { DEFAULT_SEASON } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { scopeBadge } from "@/lib/format";
import {
  leagueCountThisSeason,
  MAX_LEAGUE_MEMBERS,
  MAX_LEAGUES_PER_SEASON,
  requireUser,
} from "@/lib/league";
import { JoinForm } from "./JoinForm";
import { LeaderboardCard } from "./Leaderboards";
import { JoinLeagueButton } from "./JoinLeagueButton";

export const dynamic = "force-dynamic";

const SCOPES = [
  { id: "all", label: "All" },
  { id: "top25", label: "Top 25" },
  { id: "conference", label: "Conference" },
  { id: "all_fbs", label: "All FBS" },
] as const;

/** The front door: how everyone is doing, then somewhere to join. */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { scope: rawScope, q } = await searchParams;

  // Only the four we offer; anything else is treated as no filter at all.
  const scope = SCOPES.some((s) => s.id === rawScope) ? rawScope! : "all";
  const search = (q ?? "").trim();

  const supabase = await createClient();
  const [count, week, players, leagueBoard, browse] = await Promise.all([
    leagueCountThisSeason(user.id, DEFAULT_SEASON),
    supabase.rpc("leaderboard_week", { p_season: DEFAULT_SEASON, p_week: null, p_limit: 5 }),
    supabase.rpc("leaderboard_players", { p_season: DEFAULT_SEASON, p_limit: 5 }),
    supabase.rpc("leaderboard_leagues", { p_season: DEFAULT_SEASON, p_limit: 5 }),
    supabase.rpc("browse_leagues", {
      p_season: DEFAULT_SEASON,
      p_scope: scope,
      p_search: search || null,
    }),
  ]);

  const atCap = count >= MAX_LEAGUES_PER_SEASON;
  const weekRows = week.data ?? [];
  const weekNumber = weekRows[0]?.week ?? null;
  const leagues = browse.data ?? [];

  return (
    <AppShell email={user.email}>
      <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
        Join a league
      </h1>
      <p className="muted" style={{ margin: "0 0 1.5rem", fontSize: "0.92rem" }}>
        {atCap
          ? `You're in ${count} leagues for ${DEFAULT_SEASON}, which is the limit for one account.`
          : "Join one that's open to anyone, paste an invite, or start your own."}
      </p>

      {/* --------------------------- invite and create --------------------------- */}
      <div
        style={{
          display: "grid",
          gap: "0.85rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          marginBottom: "2.25rem",
        }}
      >
        <div className="surface" style={{ padding: "1.15rem" }}>
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.15rem" }}>Have an invite?</h2>
          <p className="muted" style={{ margin: "0 0 0.85rem", fontSize: "0.84rem" }}>
            Paste the link or the code from it.
          </p>
          {atCap ? (
            <p className="note" style={{ margin: 0 }}>
              You&apos;ll need to leave a league before you can take up another invite.
            </p>
          ) : (
            <JoinForm />
          )}
        </div>

        <div className="surface" style={{ padding: "1.15rem" }}>
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.15rem" }}>Start your own</h2>
          <p className="muted" style={{ margin: "0 0 0.85rem", fontSize: "0.84rem" }}>
            Pick a slate, then send your friends the link — or list it here for anyone to join.
          </p>
          <LeagueActionButton href="/leagues/new" atCap={atCap} primary>
            Create a league
          </LeagueActionButton>
        </div>
      </div>

      {/* ------------------------------- browsing ------------------------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.85rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: 0, letterSpacing: "-0.01em" }}>Open leagues</h2>

        {/* A plain GET form, so searching works with no JavaScript at all. */}
        <form method="get" style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="hidden" name="scope" value={scope} />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search leagues"
            aria-label="Search open leagues"
            style={{ width: 190 }}
          />
          <button className="btn" type="submit" style={{ fontSize: "0.8rem" }}>
            Search
          </button>
        </form>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {SCOPES.map((option) => {
          const params = new URLSearchParams();
          if (option.id !== "all") params.set("scope", option.id);
          if (search) params.set("q", search);
          const href = params.toString() ? `/join?${params}` : "/join";

          return (
            <Link
              key={option.id}
              href={href}
              className="nav-link"
              aria-current={scope === option.id ? "page" : undefined}
              style={{ fontSize: "0.84rem" }}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {leagues.length === 0 ? (
        <div className="surface" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>
            {search || scope !== "all"
              ? "No open leagues match that."
              : "No leagues are open to join yet."}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {search || scope !== "all"
              ? "Try a different slate, or clear the search."
              : "Start one and it shows up here — new leagues are public unless you make them private."}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {leagues.map((league, index) => {
            const full = league.member_count >= MAX_LEAGUE_MEMBERS;

            return (
              <Reveal key={league.id} delay={Math.min(index, 8) * 45}>
                <div
                  className="surface surface-hover"
                  style={{ padding: "1rem 1.1rem", height: "100%", display: "grid", gap: "0.55rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.98rem" }}>{league.name}</strong>
                    <Badge tone="accent">{scopeBadge(league.scope, league.conference)}</Badge>
                  </div>

                  {league.description ? (
                    <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
                      {league.description}
                    </p>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      marginTop: "auto",
                    }}
                  >
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {league.member_count} of {MAX_LEAGUE_MEMBERS} members
                    </span>

                    {league.already_member ? (
                      <Link className="btn" href={`/leagues/${league.slug}`} style={{ fontSize: "0.8rem" }}>
                        Open
                      </Link>
                    ) : (
                      <JoinLeagueButton
                        leagueId={league.id}
                        disabled={full || atCap}
                        disabledLabel={full ? "Full" : "At your limit"}
                      />
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ------------------------------ standings ------------------------------ */}
      {/* Below the fold on purpose: you come here to join something, and the
          boards are what makes it worth joining rather than the way in. */}
      <h2
        style={{
          fontSize: "1.05rem",
          margin: "2.5rem 0 0.85rem",
          letterSpacing: "-0.01em",
        }}
      >
        Around the app
      </h2>
      <div
        style={{
          display: "grid",
          gap: "0.85rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <LeaderboardCard
          title={weekNumber ? `Week ${weekNumber}` : "This week"}
          caption="Best cards of the week, everywhere"
          empty="No games have been scored yet this week."
          rows={weekRows.map((row) => ({
            label: row.display_name,
            sub: `${row.correct} correct`,
            value: row.points.toLocaleString(),
          }))}
        />

        <LeaderboardCard
          title="Season leaders"
          caption="Most points across every league"
          empty="Nobody has been scored yet this season."
          delay={70}
          rows={(players.data ?? []).map((row) => ({
            label: row.display_name,
            sub: `${row.leagues} ${row.leagues === 1 ? "league" : "leagues"}`,
            value: row.points.toLocaleString(),
          }))}
        />

        <LeaderboardCard
          title="Top leagues"
          caption="Open leagues by total points"
          empty="No public league has been scored yet this season."
          delay={140}
          rows={(leagueBoard.data ?? []).map((row) => ({
            label: row.name,
            sub: `${row.member_count} ${row.member_count === 1 ? "member" : "members"}`,
            value: row.points.toLocaleString(),
            href: `/leagues/${row.slug}`,
          }))}
        />
      </div>

      {atCap ? (
        <div style={{ marginTop: "1.25rem" }}>
          <CapNotice count={count} season={DEFAULT_SEASON} />
        </div>
      ) : null}
    </AppShell>
  );
}
