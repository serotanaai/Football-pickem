import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/dashboard";

  // An invite link has to send you through sign-in first. Say why, so the
  // detour reads as part of joining rather than as something going wrong.
  const fromInvite = next.startsWith("/join/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

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
        <p className="muted" style={{ margin: 0, textAlign: "center", maxWidth: 380 }}>
          {fromInvite
            ? "You've been invited to a pick'em league. Sign in or create an account and you'll go straight to it."
            : "Weekly college football pick'em with your friends — conference slates, all of FBS, or just the top 25."}
        </p>
        <LoginForm next={next} initialError={params.error} />
      </div>
    </div>
  );
}
