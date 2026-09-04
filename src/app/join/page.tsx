import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/league";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await requireUser();

  return (
    <AppShell email={user.email}>
      <div style={{ maxWidth: 460 }}>
        <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
          Join a league
        </h1>
        <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.92rem" }}>
          Paste the invite link a friend sent you.
        </p>
        <div className="surface" style={{ padding: "1.25rem" }}>
          <JoinForm />
        </div>
      </div>
    </AppShell>
  );
}
