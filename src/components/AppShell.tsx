import Link from "next/link";

export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "0.85rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <Link
            href="/dashboard"
            style={{ fontWeight: 750, textDecoration: "none", letterSpacing: "-0.01em" }}
          >
            🏈 PickemWeekly
          </Link>
          <nav style={{ display: "flex", gap: "0.85rem", fontSize: "0.9rem" }}>
            <Link href="/dashboard" style={{ textDecoration: "none" }}>
              My leagues
            </Link>
            <Link href="/leagues/new" style={{ textDecoration: "none" }}>
              New league
            </Link>
            <Link href="/join" style={{ textDecoration: "none" }}>
              Join
            </Link>
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {email ? (
              <span className="muted" style={{ fontSize: "0.82rem" }}>
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
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "1.75rem 1.25rem 4rem", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
