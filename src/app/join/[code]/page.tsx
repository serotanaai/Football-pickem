import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { scopeBadge } from "@/lib/format";
import { leagueCountThisSeason, MAX_LEAGUES_PER_SEASON } from "@/lib/league";
import { JoinForm } from "../JoinForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Send signed-out visitors through sign-up first, then straight back here.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  const { data } = await supabase.rpc("league_preview_by_code", { p_code: code });
  const league = data?.[0] ?? null;

  // Say so before they click, rather than letting the trigger refuse the join.
  const atCap = league
    ? (await leagueCountThisSeason(user.id, league.season)) >= MAX_LEAGUES_PER_SEASON
    : false;

  return (
    <AppShell email={user.email}>
      <div style={{ maxWidth: 460 }}>
        {league ? (
          <>
            <p className="muted" style={{ margin: "0 0 0.4rem", fontSize: "0.85rem" }}>
              You&apos;ve been invited to
            </p>
            <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.6rem", letterSpacing: "-0.02em" }}>
              {league.name}
            </h1>
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
              <Badge tone="accent">{scopeBadge(league.scope, league.conference_name)}</Badge>
              <Badge tone="muted">{league.season} season</Badge>
              <Badge tone="muted">
                {league.member_count} {league.member_count === 1 ? "member" : "members"}
              </Badge>
            </div>
            {league.description ? (
              <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.92rem" }}>
                {league.description}
              </p>
            ) : null}

            {league.already_member ? (
              <Link className="btn btn-primary" href={`/leagues/${league.slug}`}>
                Go to the league
              </Link>
            ) : atCap ? (
              <div className="surface" style={{ padding: "1.25rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>
                  You&apos;re already in {MAX_LEAGUES_PER_SEASON} leagues this season.
                </p>
                <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
                  That&apos;s the limit for one account. Leave a league from its settings page and
                  this invite will still work.
                </p>
                <Link className="btn" href="/dashboard">
                  Back to my leagues
                </Link>
              </div>
            ) : (
              <div className="surface" style={{ padding: "1.25rem" }}>
                <JoinForm defaultCode={code} label="Invite code" />
              </div>
            )}
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
              That invite isn&apos;t valid
            </h1>
            <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.92rem" }}>
              The link may have been reset by the commissioner. Ask them for a fresh one, or paste
              it again below.
            </p>
            <div className="surface" style={{ padding: "1.25rem" }}>
              <JoinForm defaultCode={code} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
