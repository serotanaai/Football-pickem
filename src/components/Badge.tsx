export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "muted" | "danger";
}) {
  const palette = {
    default: { bg: "var(--surface)", fg: "var(--text)", border: "var(--border)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent)", border: "var(--accent)" },
    muted: { bg: "transparent", fg: "var(--muted)", border: "var(--border)" },
    danger: { bg: "transparent", fg: "var(--danger)", border: "var(--danger)" },
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.72rem",
        fontWeight: 650,
        letterSpacing: "0.02em",
        padding: "0.15rem 0.45rem",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
