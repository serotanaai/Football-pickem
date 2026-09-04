import Link from "next/link";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { loadLeague } from "@/lib/league";
import { loadMembers } from "@/lib/board";
import { roundName, totalPlayoffRounds } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlayoffsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { league, role, userId } = await loadLeague(slug);

  if (league.playoff_teams === 0) {
    return (
      <div className="surface" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>This league has no playoff.</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          {role === "commissioner"
            ? "Turn one on from the Manage tab and the bracket appears here."
            : "The commissioner can turn one on from the league settings."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [members, { data: matchups }, { data: standings }] = await Promise.all([
    loadMembers(league.id),
    supabase
      .from("playoff_matchups")
      .select("*")
      .eq("league_id", league.id)
      .order("round", { ascending: true })
      .order("slot", { ascending: true }),
    supabase.from("league_standings").select("*").eq("league_id", league.id),
  ]);

  const nameById = new Map(members.map((m) => [m.user_id, m.name]));
  const rounds = totalPlayoffRounds(league.playoff_teams);

  if (!matchups || matchups.length === 0) {
    const projected = members
      .map((member) => {
        const row = (standings ?? []).find((s) => s.user_id === member.user_id);
        return {
          ...member,
          points: row?.points ?? 0,
          weeklyWins: row?.weekly_wins ?? 0,
        };
      })
      .sort((a, b) => b.weeklyWins - a.weeklyWins || b.points - a.points)
      .slice(0, league.playoff_teams);

    return (
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div className="surface" style={{ padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Bracket not seeded yet</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            The top {league.playoff_teams} members by weekly wins make a{" "}
            {rounds}-week bracket starting in week {league.regular_season_end_week + 1}. The
            commissioner seeds it once week {league.regular_season_end_week} is final.
          </p>
          {role === "commissioner" ? (
            <p style={{ margin: "0.8rem 0 0" }}>
              <Link className="btn btn-primary" href={`/leagues/${slug}/settings`}>
                Seed the bracket
              </Link>
            </p>
          ) : null}
        </div>

        <section>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.6rem" }}>Projected field</h3>
          <div className="surface" style={{ overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Seed</th>
                  <th>Member</th>
                  <th style={{ textAlign: "right" }}>Week wins</th>
                  <th style={{ textAlign: "right" }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {projected.map((member, index) => (
                  <tr key={member.user_id}>
                    <td className="muted">{index + 1}</td>
                    <td style={{ fontWeight: member.user_id === userId ? 700 : 500 }}>
                      {member.name}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <strong>{member.weeklyWins}</strong>
                    </td>
                    <td
                      className="muted"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {member.points.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  const byRound = new Map<number, typeof matchups>();
  for (const matchup of matchups) {
    byRound.set(matchup.round, [...(byRound.get(matchup.round) ?? []), matchup]);
  }

  const champion = matchups.find((m) => m.round === rounds && m.is_final)?.winner_user_id ?? null;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {champion ? (
        <div
          className="surface"
          style={{
            padding: "1.15rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            flexWrap: "wrap",
          }}
        >
          <Badge tone="accent">🏆 Champion</Badge>
          <strong style={{ fontSize: "1.05rem" }}>{nameById.get(champion) ?? "Member"}</strong>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
          alignItems: "start",
        }}
      >
        {[...byRound.entries()].map(([round, roundMatchups]) => (
          <section key={round}>
            <h3
              style={{
                fontSize: "0.78rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--muted)",
                margin: "0 0 0.6rem",
              }}
            >
              {roundName(round, rounds)} · week {roundMatchups[0].week}
            </h3>

            <div style={{ display: "grid", gap: "0.7rem" }}>
              {roundMatchups.map((matchup) => (
                <div key={matchup.id} className="surface" style={{ padding: "0.8rem 0.9rem" }}>
                  {[
                    {
                      user: matchup.home_user_id,
                      seed: matchup.home_seed,
                      points: matchup.home_points,
                    },
                    {
                      user: matchup.away_user_id,
                      seed: matchup.away_seed,
                      points: matchup.away_points,
                    },
                  ].map((side, index) => {
                    const won = matchup.is_final && matchup.winner_user_id === side.user;
                    const lost = matchup.is_final && !won;

                    return (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.35rem 0",
                          borderTop: index === 1 ? "1px solid var(--border)" : "none",
                          color: lost ? "var(--muted)" : "var(--text)",
                        }}
                      >
                        <span
                          className="muted"
                          style={{ fontSize: "0.75rem", width: 18, flexShrink: 0 }}
                        >
                          {side.seed ?? "–"}
                        </span>
                        <span
                          style={{
                            fontWeight: won ? 700 : side.user === userId ? 650 : 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {side.user ? (nameById.get(side.user) ?? "Member") : "TBD"}
                        </span>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: won ? 700 : 500,
                          }}
                        >
                          {side.points ?? "–"}
                        </span>
                        {won ? <span>✓</span> : null}
                      </div>
                    );
                  })}

                  {!matchup.is_final ? (
                    <p className="muted" style={{ margin: "0.45rem 0 0", fontSize: "0.75rem" }}>
                      Settles when every week {matchup.week} game is final.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
        Seeds come from weekly wins through week {league.regular_season_end_week}, with total
        points breaking ties. Each round is a head-to-head on that week&apos;s picks, and a tie
        goes to the higher seed.
      </p>
    </div>
  );
}
