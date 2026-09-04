import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { requireUser, leagueCountThisSeason, MAX_LEAGUES_PER_SEASON } from "@/lib/league";
import { DEFAULT_SEASON } from "@/lib/env";
import { NewLeagueForm } from "./NewLeagueForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // FBS Independents is excluded: it is only 1-2 games a week, so a league
  // scoped to it would have almost nothing to pick.
  const leagueCount = await leagueCountThisSeason(user.id, DEFAULT_SEASON);
  const atCap = leagueCount >= MAX_LEAGUES_PER_SEASON;

  const { data: conferences } = await supabase
    .from("conferences")
    .select("id, name, short_name")
    .eq("selectable", true)
    .order("name");

  return (
    <AppShell email={user.email}>
      <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
        New league
      </h1>
      <p className="muted" style={{ margin: "0 0 1.5rem", fontSize: "0.92rem" }}>
        You&apos;ll be the commissioner. Everything here can be changed afterwards.
      </p>

      {atCap ? (
        <div className="surface" style={{ padding: "1.25rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>
            You&apos;re in {leagueCount} leagues for {DEFAULT_SEASON}, which is the limit.
          </p>
          <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
            Everyone gets {MAX_LEAGUES_PER_SEASON} a season, whether you started them or were
            invited to them. Leave one from its settings page to make room.
          </p>
          <Link className="btn" href="/dashboard">
            Back to my leagues
          </Link>
        </div>
      ) : (
        <NewLeagueForm conferences={conferences ?? []} defaultSeason={DEFAULT_SEASON} />
      )}
    </AppShell>
  );
}
