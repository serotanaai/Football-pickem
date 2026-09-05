"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { passwordIsValid } from "@/lib/password";

const REDIRECT_AFTER_MS = 3000;

export function SetPasswordForm({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the password is changed, the recovery session has served its purpose.
  // Signing out and sending them to sign in proves the new password works.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, REDIRECT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [done, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!passwordIsValid(password)) {
      setError("Your password does not meet all of the requirements yet.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        className="surface"
        style={{ padding: "1.75rem 1.5rem", maxWidth: 420, width: "100%", textAlign: "center" }}
      >
        <p style={{ margin: "0 0 0.4rem", fontWeight: 700, fontSize: "1.05rem" }}>
          Password reset complete
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Taking you to sign in…
        </p>
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
        <p style={{ margin: 0, fontWeight: 650 }}>Set a new password</p>
        <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.86rem" }}>
          You&apos;re resetting the password for this account.
        </p>
      </div>

      {/* Shown so it is obvious which account this is, locked because the link
          is what identifies it — changing either here would mean nothing. */}
      <div>
        <label htmlFor="reset-account-email">Email</label>
        <input id="reset-account-email" value={email} disabled readOnly />
      </div>

      <div>
        <label htmlFor="reset-account-name">Display name</label>
        <input id="reset-account-name" value={displayName} disabled readOnly />
      </div>

      <div>
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Choose a password"
        />
        <PasswordRequirements password={password} />
      </div>

      <div>
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Type it again"
        />
        {confirm && password !== confirm ? (
          <p className="note" style={{ margin: "0.35rem 0 0", color: "var(--danger)" }}>
            The two passwords do not match.
          </p>
        ) : null}
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{error}</p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
