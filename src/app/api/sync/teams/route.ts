import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConferences, syncSecretMatches, syncTeams } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!syncSecretMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const conferences = await syncConferences(db);
    const teams = await syncTeams(db);
    return NextResponse.json({ ok: true, conferences, teams });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export const GET = POST;
