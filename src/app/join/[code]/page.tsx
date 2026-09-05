import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { scopeBadge } from "@/lib/format";
import {
  leagueCountThisSeason,
  MAX_LEAGUE_MEMBERS,
  MAX_LEAGUES_PER_SEASON,
} from "@/lib/league";
import { JoinForm } from "../JoinForm";
import { loadInvitePreview } from "./invite";

export const dynamic = "force-dynamic";

/**
 * The words beside the card. An unfurl is a picture and a line of text, and a
 * generic title under a league-specific image reads as a mistake.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const invite = await loadInvitePreview(code);

  // openGraph and twitter are set explicitly, not left to inherit from the
  // title above: the root layout sets openGraph.title itself, and an explicit
  // parent value wins over a child's plain title — which is how an invite ends
  // up unfurling with a league-specific image under the generic headline.
  const title = invite ? `Join ${invite.name} · PickemWeekly` : "Join a league · PickemWeekly";
  const description = invite
    ? `${invite.detail}. Pick winners every week, and settle the season in a bracket.`
    : "You've been invited to a college football pick'em league.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { title, description, card: "summary_large_image" },
  };
}

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

  // Say so before they click, rather than letting a trigger refuse the join.
  const atCap = league
    ? (await leagueCountThisSeason(user.id, league.season)) >= MAX_LEAGUES_PER_SEASON
    : false;
  const isFull = league ? Number(league.member_count) >= MAX_LEAGUE_MEMBERS : false;

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
            ) : isFull ? (
              <div className="surface" style={{ padding: "1.25rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>
                  This league is full.
                </p>
                <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
                  It has all {MAX_LEAGUE_MEMBERS} of its members. Ask whoever sent you the link to
                  free up a place, or start a league of your own.
                </p>
                <Link className="btn" href="/join">
                  Start a league
                </Link>
              </div>
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
