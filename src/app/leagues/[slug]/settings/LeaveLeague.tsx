"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { leaveLeagueAction } from "../actions";

/**
 * The two buttons that live inside the dialog.
 *
 * They read the form's own pending state rather than one of their own:
 * disabling a submit button from its own click handler can cancel the
 * submission it was pressed to start.
 */
function Buttons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();

  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
      <button type="button" className="btn" disabled={pending} onClick={onCancel}>
        Stay
      </button>
      <button type="submit" className="btn" disabled={pending} style={{ color: "var(--danger)" }}>
        {pending ? "Leaving…" : "Yes, leave"}
      </button>
    </div>
  );
}

/**
 * Leaving is one click away from a page people open to change a setting, and it
 * cannot be undone without an invite back — so it asks first.
 *
 * The dialog lives inside the form. A modal <dialog> moves to the top layer but
 * stays in the tree, so the button inside it still submits the form it is
 * written in, and the browser handles the focus trap and the Escape key.
 *
 * The trigger is a real submit button whose handler cancels the submission and
 * opens the dialog instead. Where that handler never runs — no JavaScript —
 * pressing it still leaves the league, which is what it did before this
 * existed. A dead button would be the worse failure.
 */
export function LeaveLeague({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // A dialog opened by rendering rather than by showModal() is not modal at
  // all, so the state drives the call.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <form action={leaveLeagueAction}>
      <input type="hidden" name="league_id" value={leagueId} />

      <button
        className="btn"
        type="submit"
        style={{ color: "var(--danger)" }}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        Leave {leagueName}
      </button>

      <dialog
        className="modal"
        ref={dialog}
        aria-labelledby="leave-title"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the dialog element itself; a click
        // on anything inside it lands on that child instead.
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
      >
        <div style={{ padding: "1.35rem" }}>
          <h2 id="leave-title" style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
            Leave {leagueName}?
          </h2>
          <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
            You&apos;ll drop out of the standings and stop seeing this league&apos;s board. Your
            picks stay on record. To come back you&apos;ll need the invite code again.
          </p>

          <Buttons onCancel={() => setOpen(false)} />
        </div>
      </dialog>
    </form>
  );
}
