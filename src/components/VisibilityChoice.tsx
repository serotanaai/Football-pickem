"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "public",
    title: "Public",
    blurb: "Listed on the Join page. Anyone can find your league and join it without an invite.",
  },
  {
    value: "private",
    title: "Private",
    blurb: "Invite only. Your league stays off the Join page and only your code lets people in.",
  },
] as const;

/**
 * Public or private, asked the same way in both places it gets decided — when
 * a league is created and whenever the commissioner changes their mind.
 *
 * The form field stays `is_public` so the actions on both ends read one name,
 * and a radio pair always posts a value, so the choice is never inferred from
 * a missing key the way an unchecked box is.
 */
export function VisibilityChoice({ defaultPublic }: { defaultPublic: boolean }) {
  const [value, setValue] = useState(defaultPublic ? "public" : "private");

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend
        style={{
          padding: 0,
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: "0.5rem",
        }}
      >
        Who can join?
      </legend>

      <div
        style={{
          display: "grid",
          gap: "0.6rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              style={{
                display: "flex",
                gap: "0.7rem",
                alignItems: "flex-start",
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-soft)" : "transparent",
                borderRadius: 10,
                padding: "0.75rem 0.9rem",
                cursor: "pointer",
                margin: 0,
                color: "var(--text)",
                fontWeight: 400,
              }}
            >
              <input
                type="radio"
                name="is_public"
                value={option.value}
                checked={selected}
                onChange={() => setValue(option.value)}
                style={{ width: "auto", marginTop: 3 }}
              />
              <span>
                <strong style={{ display: "block", fontSize: "0.92rem" }}>{option.title}</strong>
                <span className="muted" style={{ fontSize: "0.84rem" }}>{option.blurb}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
