import Link from "next/link";
import { redirect } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { Ticker } from "@/components/Ticker";
import { createClient } from "@/lib/supabase/server";
import { loadPickCount, loadTicker } from "@/lib/ticker";
import { pickCountLine } from "@/lib/tickerCopy";

/**
 * The payoff first, then where the games come from, then the choice you make.
 * Somebody deciding whether to start a league wants to know what they get out
 * of it before they hear how the plumbing works.
 */
const FEATURES = [
  {
    title: "Weekly winners",
    body: "100 points per correct pick. Every week gets its own leaderboard and winner — season standings track it all.",
  },
  {
    title: "Games arrive on their own",
    body: "Schedules, kickoff times, rankings, and final scores pulled straight from ESPN. Rankings refresh weekly, so a Top 25 slate follows the poll all year.",
  },
  {
    title: "Pick the slate you want",
    body: "Every FBS matchup, one conference, or just ranked teams — choose what your league follows for the season.",
  },
  {
    title: "A real playoff",
    body: "The last weeks of the regular season become a fantasy-style bracket. Seeds go to the members with the most weekly wins, with total points breaking ties.",
  },
  {
    title: "Picks stay secret",
    body: "Every game locks at its own kickoff, and nobody sees your pick until it does. Turn up late and you keep the games that have not started.",
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

  // Both read live on every render. The page is already dynamic — it checks for
  // a session — so there is no cache here to go stale.
  const [ticker, pickCount] = await Promise.all([loadTicker(), loadPickCount()]);

  return (
    <>
      <Ticker initial={ticker} />

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "3rem 1.25rem 5rem" }}>
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
          College football pick&apos;em that&apos;s actually yours.
        </h1>

        <p className="muted" style={{ fontSize: "1.05rem", maxWidth: "58ch", margin: "0 0 1.25rem" }}>
          Custom slates, live scores, and weekly leaderboards — free to join, no ads, no clutter.
        </p>

        {/* The count is whatever the database says at render time; the sentence
            around it changes with the size of the number, not the other way. */}
        <p
          style={{
            margin: "0 0 1.75rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            color: "var(--accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pickCountLine(pickCount)}
        </p>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <Link className="btn btn-primary" href="/login">
            Create your league
          </Link>
          <Link className="btn" href="/join">
            I have an invite link
          </Link>
          <Link
            href="/join"
            style={{
              color: "var(--muted)",
              fontSize: "0.88rem",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Browse open leagues
          </Link>
        </div>

        <p className="note" style={{ margin: "0.7rem 0 2.25rem" }}>
          Free to join — no card, no trial, no ads.
        </p>

        {/* The bar the whole app is built around, so the pitch shows the product
            rather than describing it.

            It is labelled an example and it stays one. The two teams could be
            swapped for a real matchup easily enough, but the split is a
            league's own pick consensus — private to its members by design — so
            a live-looking card here would be showing a number nobody voted
            for. */}
        <Reveal delay={80}>
          <figure style={{ margin: "0 0 3.5rem" }}>
            <div className="glass" aria-hidden style={{ padding: "0.85rem 0.9rem" }}>
              <div className="matchup-meta" style={{ marginBottom: "0.55rem" }}>
                <span className="muted">Sat, 3:30 PM · ABC</span>
                <span style={{ marginLeft: "auto" }} className="muted">
                  12 of 12 picked
                </span>
              </div>
              <div className="tug is-split">
                <div
                  className="tug-side"
                  style={{ width: "63%", background: "#bb0000", ["--ink" as string]: "#ffffff" }}
                >
                  <span className="tug-label">
                    <b>
                      <span className="tug-rank">#1</span>
                      <span className="tug-name">Ohio State</span>
                    </b>
                    <span className="tug-pct">63%</span>
                  </span>
                </div>
                <div
                  className="tug-side is-home"
                  style={{ width: "37%", background: "#0021a5", ["--ink" as string]: "#ffffff" }}
                >
                  <span className="tug-label">
                    <b>
                      <span className="tug-rank">#9</span>
                      <span className="tug-name">Florida</span>
                    </b>
                    <span className="tug-pct">37%</span>
                  </span>
                </div>
              </div>
            </div>
            <figcaption className="note" style={{ margin: "0.5rem 0 0" }}>
              Example board — how a league sees its week once everyone has picked.
            </figcaption>
          </figure>
        </Reveal>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70}>
              <div
                className="surface surface-hover"
                style={{ padding: "1.1rem 1.2rem", height: "100%" }}
              >
                <h2 style={{ fontSize: "0.98rem", margin: "0 0 0.4rem" }}>{feature.title}</h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
