"use client";

import { useActionState, useState } from "react";
import { regenerateInviteAction, type ActionState } from "../actions";

export function InviteLink({
  leagueId,
  slug,
  url,
  isCommissioner,
}: {
  leagueId: string;
  slug: string;
  url: string;
  isCommissioner: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    regenerateInviteAction,
    {},
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 260px" }} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          className="btn"
          href={`mailto:?subject=${encodeURIComponent("Join my college football pick'em league")}&body=${encodeURIComponent(`Join my pick'em league: ${url}`)}`}
        >
          Email it
        </a>
      </div>

      {isCommissioner ? (
        <form action={action} style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="league_id" value={leagueId} />
          <input type="hidden" name="slug" value={slug} />
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Resetting…" : "Reset invite link"}
          </button>
          {state.error ? (
            <span style={{ color: "var(--danger)", fontSize: "0.85rem", marginLeft: "0.6rem" }}>
              {state.error}
            </span>
          ) : null}
          {state.ok ? (
            <span style={{ color: "var(--accent)", fontSize: "0.85rem", marginLeft: "0.6rem" }}>
              {state.ok}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
