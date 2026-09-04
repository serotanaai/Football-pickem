import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/league";
import { DEFAULT_SEASON } from "@/lib/env";
import { NewLeagueForm } from "./NewLeagueForm";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: conferences } = await supabase
    .from("conferences")
    .select("id, name, short_name")
    .order("name");

  return (
    <AppShell email={user.email}>
      <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
        New league
      </h1>
      <p className="muted" style={{ margin: "0 0 1.5rem", fontSize: "0.92rem" }}>
        You&apos;ll be the commissioner. Everything here can be changed afterwards.
      </p>

      <NewLeagueForm conferences={conferences ?? []} defaultSeason={DEFAULT_SEASON} />
    </AppShell>
  );
}
