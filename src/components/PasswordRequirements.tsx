"use client";

import { passwordRules } from "@/lib/password";

/**
 * The rules, ticking off as they are met.
 *
 * Shown from the moment there is something to check, so the requirements
 * arrive while the password is being chosen rather than after it is rejected.
 */
export function PasswordRequirements({ password }: { password: string }) {
  if (!password) return null;

  return (
    <ul
      aria-label="Password requirements"
      style={{
        listStyle: "none",
        margin: "0.55rem 0 0",
        padding: 0,
        display: "grid",
        gap: "0.2rem",
      }}
    >
      {passwordRules(password).map((rule) => (
        <li
          key={rule.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.78rem",
            color: rule.met ? "var(--accent)" : "var(--muted)",
            transition: "color 160ms ease",
          }}
        >
          <span aria-hidden style={{ width: "0.9rem", flexShrink: 0 }}>
            {rule.met ? "✓" : "○"}
          </span>
          <span>{rule.label}</span>
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            {rule.met ? "met" : "not met"}
          </span>
        </li>
      ))}
    </ul>
  );
}
