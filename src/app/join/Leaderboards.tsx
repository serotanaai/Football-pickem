import Link from "next/link";
import { Reveal } from "@/components/Reveal";

type Row = { label: string; sub?: string | null; value: string; href?: string };

/**
 * One board. Deliberately plain: a rank, a name, a number.
 *
 * Every board can legitimately be empty — nobody has been scored yet, or no
 * league has opted into being listed — so the empty state says which of those
 * it is rather than showing a blank card.
 */
export function LeaderboardCard({
  title,
  caption,
  rows,
  empty,
  delay = 0,
}: {
  title: string;
  caption?: string;
  rows: Row[];
  empty: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="surface" style={{ padding: "1.1rem 1.15rem", height: "100%" }}>
        <h2 style={{ fontSize: "0.95rem", margin: 0 }}>{title}</h2>
        {caption ? (
          <p className="muted" style={{ margin: "0.15rem 0 0.85rem", fontSize: "0.78rem" }}>
            {caption}
          </p>
        ) : (
          <div style={{ height: "0.85rem" }} />
        )}

        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {empty}
          </p>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
            {rows.map((row, index) => (
              <li
                key={`${row.label}-${index}`}
                style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}
              >
                <span
                  className="muted"
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    width: "1.1rem",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {index + 1}
                </span>

                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontWeight: index === 0 ? 750 : 600,
                      fontSize: "0.88rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.href ? (
                      <Link href={row.href} style={{ textDecoration: "none" }}>
                        {row.label}
                      </Link>
                    ) : (
                      row.label
                    )}
                  </span>
                  {row.sub ? (
                    <span className="muted" style={{ fontSize: "0.74rem" }}>
                      {row.sub}
                    </span>
                  ) : null}
                </span>

                <strong
                  style={{
                    fontSize: "0.9rem",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                    color: index === 0 ? "var(--accent)" : "inherit",
                  }}
                >
                  {row.value}
                </strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Reveal>
  );
}
