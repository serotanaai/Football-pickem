"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { NAME_MAX, nameProblem, passwordIsValid } from "@/lib/password";

type Mode = "signup" | "password" | "magic";

/** An error that can offer the way out of itself. */
type FormError = {
  message: string;
  links?: { href: string; label: string }[];
};

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(
    initialError ? { message: initialError } : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const redirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  function switchMode(to: Mode) {
    setMode(to);
    setError(null);
    setNotice(null);
    setConfirm("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setNotice(`Sign-in link sent to ${email}. Check your inbox.`);
        return;
      }

      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // A rejected password and an unreachable network both arrive here.
          // Telling someone their password is wrong when the request never
          // left the browser sends them off to reset a password that is fine.
          const status = (error as { status?: number }).status;
          const rejected =
            status === 400 || /invalid login credentials|invalid email or password/i.test(error.message);
          if (!rejected) throw error;

          // Supabase does not say which half was wrong, and neither should we —
          // but the two things worth doing about it both get a link.
          setError({
            message: "That email and password don't match an account.",
            links: [
              { href: "/reset-password", label: "Reset your password" },
              { href: "#signup", label: "Create an account" },
            ],
          });
          return;
        }
        router.push(next);
        router.refresh();
        return;
      }

      // --- signing up ---
      const trimmedName = name.trim();
      const badName = nameProblem(trimmedName);
      if (badName) {
        setError({ message: badName });
        return;
      }
      if (!passwordIsValid(password)) {
        setError({ message: "Your password does not meet all of the requirements yet." });
        return;
      }
      if (password !== confirm) {
        setError({ message: "The two passwords do not match." });
        return;
      }

      // Ask before signing up, because Supabase deliberately answers a taken
      // address with a success that looks like any other.
      const taken = await supabase.rpc("email_has_account", { p_email: email });
      if (taken.data === true) {
        setError({
          message: "That email already has an account.",
          links: [{ href: "#signin", label: "Sign in instead" }],
        });
        return;
      }

      const free = await supabase.rpc("username_available", { p_name: trimmedName });
      if (free.data === false) {
        setError({ message: `"${trimmedName}" is taken. Pick another display name.` });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo, data: { display_name: trimmedName } },
      });

      if (error) {
        // The database refuses a duplicate name, which only happens if someone
        // took it in the seconds since the check above.
        if (/display name|Database error saving new user/i.test(error.message)) {
          setError({ message: `"${trimmedName}" was just taken. Pick another display name.` });
          return;
        }
        if (/already registered|already exists/i.test(error.message)) {
          setError({
            message: "That email already has an account.",
            links: [{ href: "#signin", label: "Sign in instead" }],
          });
          return;
        }
        throw error;
      }

      // Backstop: with confirmations on, a taken address comes back as a user
      // with no identities rather than an error.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError({
          message: "That email already has an account.",
          links: [{ href: "#signin", label: "Sign in instead" }],
        });
        return;
      }

      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setNotice(`Almost there — confirm your account with the link we sent to ${email}.`);
      }
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "Something went wrong." });
    } finally {
      setPending(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "signup", label: "Sign up" },
    { id: "password", label: "Sign in" },
    { id: "magic", label: "Email link" },
  ];

  return (
    <div className="surface" style={{ padding: "1.5rem", maxWidth: 420, width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.35rem",
          marginBottom: "1.25rem",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={mode === tab.id ? "btn btn-primary" : "btn"}
            onClick={() => switchMode(tab.id)}
            style={{ padding: "0.4rem 0.5rem", fontSize: "0.82rem" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: "0.9rem" }}>
        {mode === "signup" ? (
          <div>
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How your picks show up"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              required
            />
            <p className="note" style={{ margin: "0.35rem 0 0" }}>
              Everyone in a league sees this, so it has to be unique.
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        {mode !== "magic" ? (
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Choose a password" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" ? <PasswordRequirements password={password} /> : null}
          </div>
        ) : null}

        {mode === "signup" ? (
          <div>
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              autoComplete="new-password"
            />
            {confirm && password !== confirm ? (
              <p className="note" style={{ margin: "0.35rem 0 0", color: "var(--danger)" }}>
                The two passwords do not match.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div style={{ fontSize: "0.85rem" }}>
            <p style={{ color: "var(--danger)", margin: 0 }}>{error.message}</p>
            {error.links ? (
              <p style={{ margin: "0.3rem 0 0", display: "flex", gap: "0.75rem" }}>
                {error.links.map((link) =>
                  link.href === "#signin" || link.href === "#signup" ? (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => switchMode(link.href === "#signin" ? "password" : "signup")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        color: "var(--accent)",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{ color: "var(--accent)", textDecoration: "underline" }}
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {notice ? (
          <p style={{ color: "var(--accent)", fontSize: "0.85rem", margin: 0 }}>{notice}</p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending
            ? "Working…"
            : mode === "signup"
              ? "Create account"
              : mode === "password"
                ? "Sign in"
                : "Send me a link"}
        </button>

        {mode === "password" ? (
          <p className="note" style={{ margin: 0, textAlign: "center" }}>
            <Link href="/reset-password" style={{ color: "var(--accent)" }}>
              Forgot your password?
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}
