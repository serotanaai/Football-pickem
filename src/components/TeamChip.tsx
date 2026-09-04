type Team = {
  school: string;
  display_name: string;
  abbreviation: string | null;
  logo: string | null;
};

export function TeamChip({
  team,
  rank,
  size = 22,
}: {
  team: Team | null;
  rank?: number | null;
  size?: number;
}) {
  if (!team) return <span className="muted">TBD</span>;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
      {team.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logo}
          alt=""
          width={size}
          height={size}
          style={{ flexShrink: 0, objectFit: "contain" }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: size,
            height: size,
            borderRadius: 4,
            background: "var(--border)",
            flexShrink: 0,
          }}
        />
      )}
      {rank ? (
        <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
          #{rank}
        </span>
      ) : null}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 560,
        }}
      >
        {team.school}
      </span>
    </span>
  );
}
