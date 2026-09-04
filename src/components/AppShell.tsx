import Link from "next/link";
import { StickyHeader } from "./StickyHeader";

export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
