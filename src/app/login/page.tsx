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
          Weekly college football pick&apos;em with your friends — conference slates, all of
          FBS, or just the top 25.
        </p>
        <LoginForm next={next} initialError={params.error} />
      </div>
    </div>
  );
}
