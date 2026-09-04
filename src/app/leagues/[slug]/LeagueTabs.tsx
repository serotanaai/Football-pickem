"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LeagueTabs({ slug, isCommissioner }: { slug: string; isCommissioner: boolean }) {
  const pathname = usePathname();
  const base = `/leagues/${slug}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/picks`, label: "Make picks" },
    { href: `${base}/results`, label: "Results" },
    { href: `${base}/playoffs`, label: "Playoffs" },
    { href: `${base}/settings`, label: isCommissioner ? "Manage" : "League info" },
  ];

  return (
    <nav
      style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "1px solid var(--border)",
        marginBottom: "1.5rem",
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "0.55rem 0.8rem",
              fontSize: "0.88rem",
              fontWeight: active ? 650 : 500,
              textDecoration: "none",
              whiteSpace: "nowrap",
              color: active ? "var(--accent)" : "var(--muted)",
              borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
