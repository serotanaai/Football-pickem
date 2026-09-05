import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Where the link in the reset email lands, by way of /auth/callback, which
 * turns the one-time code into the short-lived session this page needs.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means the link was never followed, or has already been used or
  // expired. Say which, rather than showing a form that cannot work.
  if (!user) {
    return (
      <Shell>
        <div className="surface" style={{ padding: "1.5rem", maxWidth: 420, width: "100%" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>This reset link has expired.</p>
          <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
            Reset links can only be used once, and they do not last long. Ask for a fresh one and
            it will work.
          </p>
          <Link className="btn btn-primary" href="/reset-password">
            Send a new link
          </Link>
        </div>
      </Shell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Shell>
      <SetPasswordForm
        email={user.email ?? ""}
        displayName={profile?.display_name ?? ""}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.25rem",
      }}
    >
      <div style={{ display: "grid", gap: "1.25rem", justifyItems: "center", width: "100%" }}>
        <Link href="/" style={{ textDecoration: "none", fontWeight: 750, fontSize: "1.15rem" }}>
          🏈 PickemWeekly
        </Link>
        {children}
      </div>
    </div>
  );
}
