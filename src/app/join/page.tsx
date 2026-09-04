import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CapNotice, LeagueActionButton } from "@/components/CapNotice";
import { DEFAULT_SEASON } from "@/lib/env";
import { leagueCountThisSeason, MAX_LEAGUES_PER_SEASON, requireUser } from "@/lib/league";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

/** The one place you come to add a league, by either route. */
export default async function JoinPage() {
  const user = await requireUser();
  const count = await leagueCountThisSeason(user.id, DEFAULT_SEASON);
  const atCap = count >= MAX_LEAGUES_PER_SEASON;

  return (
    <AppShell email={user.email}>
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
          Add a league
        </h1>
        <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.92rem" }}>
          {atCap
            ? `You are in ${count} leagues for ${DEFAULT_SEASON}, which is the limit for one account.`
            : "Paste an invite a friend sent you, or start your own."}
        </p>

        {atCap ? (
          <div className="surface" style={{ padding: "1.25rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>
              You&apos;ve used all {MAX_LEAGUES_PER_SEASON} of your leagues this season.
            </p>
            <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
              That is the limit whether you started them or were invited. Leave one from its
              settings page and you can join or create another — an invite link you were sent will
              still work afterwards.
            </p>
            <Link className="btn btn-primary" href="/dashboard">
              Back to my leagues
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div className="surface" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.15rem" }}>Join with an invite</h2>
              <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.86rem" }}>
                Paste the link or the code from it.
              </p>
              <JoinForm />
            </div>

            <div className="surface" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.15rem" }}>Start your own</h2>
              <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.86rem" }}>
                Pick a slate, then send your friends the invite link.
              </p>
              <LeagueActionButton href="/leagues/new" atCap={atCap} primary>
                Create a league
              </LeagueActionButton>
            </div>

            <CapNotice count={count} season={DEFAULT_SEASON} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
