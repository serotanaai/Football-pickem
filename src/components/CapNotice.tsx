import Link from "next/link";
import { MAX_LEAGUES_PER_SEASON } from "@/lib/league";

/**
 * A button that is only a button while there is room for another league.
 *
 * At the cap it becomes a span, because a disabled anchor is still clickable
 * and would send someone to a page that can only refuse them.
 */
export function LeagueActionButton({
  href,
  atCap,
  primary,
  children,
}: {
  href: string;
  atCap: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  const className = `btn${primary ? " btn-primary" : ""}${atCap ? " is-disabled" : ""}`;

  if (atCap) {
    return (
      <span
        className={className}
        aria-disabled="true"
        title={`You are in ${MAX_LEAGUES_PER_SEASON} leagues this season, which is the limit.`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/** Why those buttons are dead, said once, near them. */
export function CapNotice({ count, season }: { count: number; season: number }) {
  return (
    <p className="note" style={{ margin: 0 }}>
      You&apos;re in {count} of {MAX_LEAGUES_PER_SEASON} leagues for the {season} season. Leave one
      from its settings page to make room for another.
    </p>
  );
}
