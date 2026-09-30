import Link from "next/link";
import type { TickerState } from "@/lib/ticker";
import { Ticker } from "./Ticker";
import { StickyHeader } from "./StickyHeader";

export function AppShell({
  email,
  ticker,
  children,
}: {
  email?: string | null;
  /**
   * The scoreboard strip, for the pages where the week is the point: what is
   * on, what it finished, and how long until the next one. Optional because
   * not every page in this shell wants it -- a picks board is already a list
   * of these games, and a settings form is not about the week at all.
   */
  ticker?: TickerState | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {ticker ? (
        <div className="ticker-flow">
          <Ticker initial={ticker} />
        </div>
      ) : null}

      <StickyHeader>
        <div className="app-header-inner">
          <Link href="/dashboard" className="brand">
            🏈 PickemWeekly
          </Link>
          <nav className="app-header-nav" style={{ display: "flex", gap: "0.2rem", fontSize: "0.9rem" }}>
            <Link href="/dashboard" className="nav-link">
              My leagues
            </Link>
            <Link href="/join" className="nav-link">
              Join
            </Link>
          </nav>
          <div className="app-header-actions">
            {email ? (
              <span className="muted app-header-email" style={{ fontSize: "0.82rem" }}>
                {email}
              </span>
            ) : null}
            <form action="/auth/signout" method="post">
              <button className="btn" type="submit" style={{ padding: "0.35rem 0.7rem" }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </StickyHeader>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "1.75rem 1.25rem 4rem", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
