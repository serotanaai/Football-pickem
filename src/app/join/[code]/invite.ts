import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { scopeLabel } from "@/lib/format";

export type InvitePreview = {
  name: string;
  detail: string;
};

/**
 * What an invite link should say about itself before anyone signs in.
 *
 * Read through invite_card, which returns only the three things the card
 * prints. Link crawlers carry no session, so this runs as anon — hence a
 * keyless client rather than the cookie-bound one, which has nothing to read.
 *
 * Returns null for an unknown code, or if anything goes wrong at all: a link
 * that unfurls plainly is far better than one that errors.
 */
export async function loadInvitePreview(code: string): Promise<InvitePreview | null> {
  try {
    const db = createClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await db.rpc("invite_card", { p_code: code });
    const card = data?.[0];
    if (!card) return null;

    const members = card.member_count ?? 0;
    return {
      name: card.name,
      detail: `${scopeLabel(card.scope, card.conference_name)} · ${members} ${
        members === 1 ? "member" : "members"
      }`,
    };
  } catch {
    return null;
  }
}
