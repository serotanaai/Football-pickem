"use client";

import { useActionState, useState } from "react";
import { removeMemberAction } from "../actions";
import type { ActionState } from "../actions";

/**
 * Removing someone takes their picks with them, so it asks first.
 *
 * The confirm names the person and says what else goes, because "Remove" on
 * its own reads like it only removes them from a list.
 */
export function RemoveMember({
  leagueId,
  slug,
  userId,
  name,
}: {
  leagueId: string;
  slug: string;
  userId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(removeMemberAction, {});

  if (state.ok) {
    return (
      <span className="muted" style={{ fontSize: "0.78rem" }}>
        Removed
      </span>
    );
  }

  if (!confirming) {
    return (
      <div style={{ display: "grid", gap: "0.2rem", justifyItems: "end" }}>
        <button
          type="button"
          className="btn"
          onClick={() => setConfirming(true)}
          style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
        >
          Remove
        </button>
        {state.error ? (
          <span style={{ color: "var(--danger)", fontSize: "0.74rem" }}>{state.error}</span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: "0.35rem", justifyItems: "end" }}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="name" value={name} />

      <span className="muted" style={{ fontSize: "0.74rem", textAlign: "right" }}>
        Remove {name}? Their picks for this league go too.
      </span>
      <span style={{ display: "flex", gap: "0.35rem" }}>
        <button
          type="submit"
          className="btn"
          disabled={pending}
          style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem", color: "var(--danger)" }}
        >
          {pending ? "Removing…" : "Yes, remove"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setConfirming(false)}
          disabled={pending}
          style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
        >
          Cancel
        </button>
      </span>
    </form>
  );
}
