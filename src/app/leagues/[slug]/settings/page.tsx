import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, weekRange } from "@/lib/league";
import { loadMembers } from "@/lib/board";
import { siteUrl } from "@/lib/env";
import { scopeLabel } from "@/lib/format";
import { LocalTime } from "@/components/LocalTime";
import { leaveLeagueAction } from "../actions";
import { InviteLink } from "./InviteLink";
import { LeagueSettingsForm, SeedPlayoffsForm } from "./CommissionerForms";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const { created } = await searchParams;

  const { league, conference, role, userId } = await loadLeague(slug);
  const isCommissioner = role === "commissioner";

  const supabase = await createClient();
  const [members, { data: weeks }, { data: bracket }] = await Promise.all([
    loadMembers(league.id),
    supabase
      .from("league_weeks")
      .select("week, game_count, lock_at")
      .eq("league_id", league.id)
      .order("week"),
    supabase
      .from("playoff_matchups")
      .select("id")
      .eq("league_id", league.id)
      .limit(1),
  ]);

  const inviteUrl = `${siteUrl()}/join/${league.invite_code}`;
  const allWeeks = weekRange(league);

  const gamesByWeek = new Map((weeks ?? []).map((row) => [row.week, row.game_count]));

  return (
    <div style={{ display: "grid", gap: "1.75rem" }}>
      {created ? (
        <div
          className="surface"
          style={{
            padding: "1rem 1.15rem",
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <strong>League created.</strong>{" "}
          <span style={{ fontSize: "0.92rem" }}>
            Send the invite link below to your friends — they sign up with an email address and
            land straight in the league.
          </span>
        </div>
      ) : null}

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Invite link</h2>
        <div className="surface" style={{ padding: "1.15rem" }}>
          <InviteLink
            leagueId={league.id}
            slug={slug}
            url={inviteUrl}
            isCommissioner={isCommissioner}
          />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>
          Members ({members.length})
        </h2>
        <div className="surface" style={{ overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td style={{ fontWeight: member.user_id === userId ? 700 : 500 }}>
                    {member.name}
                    {member.email ? (
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        {" "}
                        · {member.email}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {member.role === "commissioner" ? (
                      <Badge tone="accent">Commissioner</Badge>
                    ) : (
                      <span className="muted">Member</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Season slate</h2>
        <div className="surface" style={{ padding: "1.15rem", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <Badge tone="accent">{scopeLabel(league.scope, conference?.name)}</Badge>
            <span className="muted" style={{ fontSize: "0.88rem" }}>
              every week, all season
            </span>
          </div>
          <p className="note">
            A league follows one slate for its whole season, so the rules never move mid-year.
            {league.scope === "top25"
              ? " Rankings refresh every week, and a ranked team's game counts whoever it plays."
              : " Games against non-FBS opponents never appear."}{" "}
            It can only be changed before the first pick is made.
          </p>
        </div>

        <div className="surface" style={{ overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Week</th>
                <th>Locks at</th>
                <th style={{ textAlign: "right" }}>Games</th>
              </tr>
            </thead>
            <tbody>
              {allWeeks.map((week) => {
                const row = (weeks ?? []).find((w) => w.week === week);
                const isPlayoffWeek =
                  league.playoff_teams > 0 && week > league.regular_season_end_week;

                return (
                  <tr key={week}>
                    <td>
                      {week}
                      {isPlayoffWeek ? (
                        <span style={{ marginLeft: "0.4rem" }}>
                          <Badge tone="muted">Playoff</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className={row?.lock_at ? undefined : "muted"}>
                      {row?.lock_at ? <LocalTime iso={row.lock_at} /> : "Not built yet"}
                    </td>
                    <td
                      className="muted"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {gamesByWeek.get(week) || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Each game locks at its own kickoff, and a correct pick is worth 100 points. Members
          who pick late keep every game that has not started yet.
        </p>
      </section>

      {isCommissioner ? (
        <>
          <section>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>League settings</h2>
            <div className="surface" style={{ padding: "1.15rem" }}>
              <LeagueSettingsForm
                leagueId={league.id}
                slug={slug}
                name={league.name}
                description={league.description}
                maxGames={league.max_games_per_week}
          scope={league.scope}
                endWeek={league.regular_season_end_week}
                playoffTeams={league.playoff_teams}
              />
            </div>
          </section>

          {league.playoff_teams > 0 ? (
            <section>
              <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Playoffs</h2>
              <div className="surface" style={{ padding: "1.15rem" }}>
                <SeedPlayoffsForm
                  leagueId={league.id}
                  slug={slug}
                  playoffTeams={league.playoff_teams}
                  alreadySeeded={(bracket ?? []).length > 0}
                />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Leave league</h2>
          <div className="surface" style={{ padding: "1.15rem" }}>
            <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
              Your picks stay on record, but you drop out of the standings.
            </p>
            <form action={leaveLeagueAction}>
              <input type="hidden" name="league_id" value={league.id} />
              <button className="btn" type="submit" style={{ color: "var(--danger)" }}>
                Leave {league.name}
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
