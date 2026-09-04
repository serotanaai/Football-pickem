"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error?: string };

export async function joinLeagueAction(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const raw = String(formData.get("code") ?? "").trim();
  if (!raw) return { error: "Paste your invite link or code." };

  // Accept a full invite URL as well as a bare code.
  const code = raw.split(/[/?#]/).filter(Boolean).pop() ?? raw;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league_by_code", { p_code: code });

  if (error || !data) {
    return { error: error?.message ?? "That invite link is not valid." };
  }

  redirect(`/leagues/${data.slug}`);
}
