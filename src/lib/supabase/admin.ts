import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it must never be imported into anything
 * that runs in the browser — only the /api/sync/* route handlers use it.
 */
export function createAdminClient() {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
