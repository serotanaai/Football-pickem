import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  {
    title: "Pick the slate you want",
    body: "Choose one slate at kickoff of the season — a single conference, every FBS matchup, or just games with a ranked team — and your league follows it all year.",
  },
  {
    title: "Games arrive on their own",
    body: "Schedules, kickoff times, rankings and final scores come straight from ESPN's college football feed. Rankings refresh every week, so a top-25 slate follows the poll.",
  },
  {
    title: "Weekly winners",
    body: "100 points per correct pick. Every week gets its own leaderboard and winner, and the season standings track weekly wins alongside total points.",
  },
  {
    title: "A real playoff",
    body: "The last weeks of the regular season become a fantasy-style bracket. Seeds go to the members with the most weekly wins, with total points breaking ties, and the higher seed takes a tie.",
  },
  {
    title: "Picks stay secret",
    body: "Every game locks at its own kickoff, and nobody sees your pick until it does. Turn up late and you keep the games that have not started — you just forfeit the ones that have.",
  },
  {
    title: "Invite by link",
    body: "Every league gets a private invite link. Friends sign up with an email address and they are in.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "4rem 1.25rem 5rem" }}>
      <p style={{ fontWeight: 750, letterSpacing: "-0.01em", marginBottom: "2.5rem" }}>
        🏈 PickemWeekly
      </p>

      <h1
        style={{
          fontSize: "clamp(2.1rem, 5vw, 3.2rem)",
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          margin: "0 0 1rem",
          maxWidth: "18ch",
        }}
      >
        College football pick&apos;em, run properly.
      </h1>

      <p className="muted" style={{ fontSize: "1.05rem", maxWidth: "58ch", margin: "0 0 2rem" }}>
        Start a league, invite your friends with a link, and pick winners every week. Weekly
        leaderboards all season, then a bracket to close it out.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "3.5rem" }}>
        <Link className="btn btn-primary" href="/login">
          Create your league
        </Link>
        <Link className="btn" href="/join">
          I have an invite link
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        {FEATURES.map((feature) => (
          <div key={feature.title} className="surface" style={{ padding: "1.1rem 1.2rem" }}>
            <h2 style={{ fontSize: "0.98rem", margin: "0 0 0.4rem" }}>{feature.title}</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>
              {feature.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
