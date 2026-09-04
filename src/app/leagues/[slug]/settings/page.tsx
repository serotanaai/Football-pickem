import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { loadLeague, resolveCurrentWeek, weekRange } from "@/lib/league";
import { loadMembers } from "@/lib/board";
import { siteUrl } from "@/lib/env";
import { scopeLabel } from "@/lib/format";
import type { LeagueScope } from "@/lib/database.types";
import { leaveLeagueAction } from "../actions";
import { InviteLink } from "./InviteLink";
import { WeekScopeForm } from "./WeekScopeForm";
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
  const [members, { data: conferences }, { data: weeks }, { data: bracket }] = await Promise.all([
    loadMembers(league.id),
    supabase.from("conferences").select("id, name").order("name"),
    supabase
      .from("league_weeks")
      .select("week, scope, conference_id, game_count")
      .eq("league_id", league.id)
      .order("week"),
    supabase
      .from("playoff_matchups")
      .select("id")
      .eq("league_id", league.id)
      .limit(1),
  ]);

  const inviteUrl = `${siteUrl()}/join/${league.invite_code}`;
  const currentWeek = await resolveCurrentWeek(league.season);
  const allWeeks = weekRange(league);

  const currentByWeek: Record<number, { scope: LeagueScope; conference_id: number | null }> =
    Object.fromEntries(
      (weeks ?? []).map((row) => [row.week, { scope: row.scope, conference_id: row.conference_id }]),
    );

  const conferenceNameById = new Map((conferences ?? []).map((c) => [c.id, c.name]));

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
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Weekly slates</h2>
        <div className="surface" style={{ overflow: "hidden", marginBottom: isCommissioner ? "0.85rem" : 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Week</th>
                <th>Slate</th>
                <th style={{ textAlign: "right" }}>Games</th>
              </tr>
            </thead>
            <tbody>
              {allWeeks.map((week) => {
                const row = currentByWeek[week];
                const gameCount = (weeks ?? []).find((w) => w.week === week)?.game_count ?? 0;
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
                    <td className={row ? undefined : "muted"}>
                      {row
                        ? scopeLabel(
                            row.scope,
                            row.conference_id
                              ? conferenceNameById.get(row.conference_id)
                              : null,
                          )
                        : `${scopeLabel(league.scope, conference?.name)} (league default)`}
                    </td>
                    <td
                      className="muted"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {gameCount || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isCommissioner ? (
          <div className="surface" style={{ padding: "1.15rem" }}>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.75rem" }}>Change a week</h3>
            <WeekScopeForm
              leagueId={league.id}
              slug={slug}
              weeks={allWeeks}
              conferences={conferences ?? []}
              defaultWeek={Math.min(Math.max(currentWeek, league.start_week), allWeeks.at(-1)!)}
              currentByWeek={currentByWeek}
            />
          </div>
        ) : null}
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
