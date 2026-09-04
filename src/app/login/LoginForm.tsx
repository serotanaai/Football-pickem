"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signup" | "password" | "magic";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const redirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

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
        if (error) throw error;
        router.push(next);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { display_name: name.trim() || email.split("@")[0] },
        },
      });
      if (error) throw error;

      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setNotice(
          `Almost there — confirm your account with the link we sent to ${email}.`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
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
            onClick={() => {
              setMode(tab.id);
              setError(null);
              setNotice(null);
            }}
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
            />
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
        ) : null}

        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{error}</p>
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
      </form>
    </div>
  );
}
