"use client";

import { useActionState } from "react";
import { joinPublicLeagueAction, type JoinState } from "./actions";

export function JoinLeagueButton({
  leagueId,
  disabled,
  disabledLabel,
}: {
  leagueId: string;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(
    joinPublicLeagueAction,
    {},
  );

  if (disabled) {
    return (
      <span className="btn is-disabled" aria-disabled="true" style={{ fontSize: "0.8rem" }}>
        {disabledLabel}
      </span>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: "0.3rem", justifyItems: "end" }}>
      <input type="hidden" name="league_id" value={leagueId} />
      <button className="btn btn-primary" type="submit" disabled={pending} style={{ fontSize: "0.8rem" }}>
        {pending ? "Joining…" : "Join"}
      </button>
      {state.error ? (
        <span style={{ color: "var(--danger)", fontSize: "0.72rem" }}>{state.error}</span>
      ) : null}
    </form>
  );
}
