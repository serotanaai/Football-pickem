import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The page behind the unsubscribe link in every message.
 *
 * It opts the reader out on arrival rather than asking them to confirm first.
 * Someone who clicked unsubscribe has already made the decision, and a page
 * that answers it with another button is a page that gets the spam complaint
 * instead — which costs the sending domain far more than the one reader.
 *
 * Nothing here needs a session, and it must not want one: this is opened from
 * an inbox, quite possibly by somebody who will never sign in again.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // An unknown token is not an error worth explaining. Saying "no such
  // subscriber" to whoever holds a bad link tells them something about who is
  // and is not on the list, and helps nobody who arrived here honestly.
  const { data } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  const done = data === true;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "5rem 1.25rem" }}>
      <p style={{ fontWeight: 750, letterSpacing: "-0.01em", marginBottom: "2rem" }}>
        🏈 PickemWeekly
      </p>

      <h1 style={{ fontSize: "1.5rem", letterSpacing: "-0.02em", margin: "0 0 0.75rem" }}>
        {done ? "You're unsubscribed." : "That link has already been used."}
      </h1>

      <p className="muted" style={{ margin: "0 0 1.5rem", lineHeight: 1.6 }}>
        {done
          ? "No more weekly results, matchup previews or pick reminders. Your leagues and your picks are untouched, and you can still sign in whenever you like."
          : "Either this link was used already or it is no longer valid. If you are still getting mail you do not want, sign in and let us know."}
      </p>

      <Link className="btn" href="/">
        Back to PickemWeekly
      </Link>
    </div>
  );
}
