import { createClient } from "@/lib/supabase/server";
import { loadMembers } from "@/lib/board";
import { ordinal } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

/**
 * Where everybody stands across the whole season, rather than in one week.
 *
 * The order is the league's own: points first, then weekly wins, because a
 * season is scored on points and two people level on them are separated by who
 * actually took weeks. Alphabetical last, so the table is stable rather than
 * reshuffling between renders when nothing has changed.
 *
 * There is no pick sheet here. A pick sheet is a grid of one week's games and
 * has no season-long form — fifteen weeks of them side by side is not a table
 * anybody reads.
 */
export async function SeasonStandings({
  league,
  userId,
  picker,
}: {
  league: Tables<"leagues">;
  userId: string;
  picker: React.ReactNode;
}) {
  const supabase = await createClient();

  const [members, { data: standings }] = await Promise.all([
    loadMembers(league.id),
    supabase
      .from("league_standings")
      .select("user_id, points, correct, incorrect, weekly_wins")
      .eq("league_id", league.id),
  ]);

  const byUser = new Map((standings ?? []).map((row) => [row.user_id, row]));

  // Driven off the roster rather than off the standings view, so somebody who
  // has joined and not yet picked appears on nil instead of vanishing.
  const rows = members
    .map((member) => {
      const row = byUser.get(member.user_id);
      return {
        ...member,
        points: row?.points ?? 0,
        correct: row?.correct ?? 0,
        incorrect: row?.incorrect ?? 0,
        weeklyWins: row?.weekly_wins ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points || b.weeklyWins - a.weeklyWins || a.name.localeCompare(b.name),
    );

  const played = rows.reduce((total, row) => total + row.correct + row.incorrect, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{league.season} season standings</h2>
        {picker}
      </div>

      {played === 0 ? (
        <div className="surface" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Nothing has been graded yet. The table fills in as the first week&rsquo;s games go
            final.
          </p>
        </div>
      ) : (
        <div className="surface" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Member</th>
                <th style={{ textAlign: "right" }}>Points</th>
                <th style={{ textAlign: "right" }}>Record</th>
                <th style={{ textAlign: "right" }}>Weeks won</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.user_id}>
                  <td className="muted">{ordinal(index + 1)}</td>
                  <td style={{ fontWeight: row.user_id === userId ? 700 : 500 }}>{row.name}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <strong>{row.points.toLocaleString()}</strong>
                  </td>
                  <td
                    className="muted"
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.correct}–{row.incorrect}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.weeklyWins}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
