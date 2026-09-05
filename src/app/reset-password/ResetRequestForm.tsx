"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setUnknown(false);

    try {
      const supabase = createClient();

      // Supabase reports success whether or not the address exists. Asking
      // first is what lets us tell someone there is nothing to reset, rather
      // than leaving them waiting on an email that will never arrive.
      const { data: exists, error: lookupError } = await supabase.rpc("email_has_account", {
        p_email: email,
      });
      if (lookupError) throw lookupError;

      if (exists !== true) {
        setUnknown(true);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          "/reset-password/set",
        )}`,
      });
      if (error) throw error;
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="surface" style={{ padding: "1.5rem", maxWidth: 420, width: "100%" }}>
        <p style={{ margin: "0 0 0.5rem", fontWeight: 650 }}>Check your email.</p>
        <p className="muted" style={{ margin: "0 0 1.25rem", fontSize: "0.9rem" }}>
          We sent a password reset link to <strong>{email}</strong>. It opens a page where you can
          set a new one. If it has not arrived in a few minutes, look in your spam folder.
        </p>
        <Link className="btn" href="/login">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="surface"
      style={{ padding: "1.5rem", maxWidth: 420, width: "100%", display: "grid", gap: "0.9rem" }}
    >
      <div>
        <label htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setUnknown(false);
          }}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      {unknown ? (
        <div style={{ fontSize: "0.85rem" }}>
          <p style={{ color: "var(--danger)", margin: 0 }}>
            No account uses that email address.
          </p>
          <p style={{ margin: "0.3rem 0 0" }}>
            <Link href="/login" style={{ color: "var(--accent)", textDecoration: "underline" }}>
              Create an account instead
            </Link>
          </p>
        </div>
      ) : null}

      {error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{error}</p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Send reset link"}
      </button>

      <p className="note" style={{ margin: 0, textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
