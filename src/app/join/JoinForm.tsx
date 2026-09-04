"use client";

import { useActionState } from "react";
import { joinLeagueAction, type JoinState } from "./actions";

export function JoinForm({ defaultCode = "", label = "Invite link or code" }: {
  defaultCode?: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinLeagueAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.85rem" }}>
      <div>
        <label htmlFor="code">{label}</label>
        <input
          id="code"
          name="code"
          required
          defaultValue={defaultCode}
          placeholder="https://…/join/ABCD2345"
          autoCapitalize="characters"
        />
      </div>

      {state.error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.86rem", margin: 0 }}>{state.error}</p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join league"}
      </button>
    </form>
  );
}
