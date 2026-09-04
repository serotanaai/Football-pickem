import { ImageResponse } from "next/og";

export const alt = "PickemWeekly — college football pick'em with your friends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link preview, which is most of what a tweet actually shows.
 *
 * It carries the tug-of-war bar the app is built around, so the card shows the
 * product rather than describing it. Satori renders this, so it is flexbox
 * only — no grid, and every box with more than one child sets display: flex.
 */
export default async function OpengraphImage() {
  const split = 63;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#101215",
        padding: "72px 76px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 30,
            fontWeight: 700,
            color: "#5fbf85",
            letterSpacing: "-0.01em",
          }}
        >
          🏈 PickemWeekly
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            color: "#eceef1",
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            marginTop: 26,
            maxWidth: 900,
          }}
        >
          College football pick&apos;em, run properly.
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 31,
            color: "#9aa0a8",
            marginTop: 24,
            maxWidth: 860,
            lineHeight: 1.35,
          }}
        >
          Pick every week, watch the league split in real time, then settle it
          in a bracket.
        </div>
      </div>

      {/* the tug-of-war bar, the same shape the app draws every game with */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 92,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: `${split}%`,
              background: "#bb0000",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 750,
              padding: "0 26px",
            }}
          >
            Ohio State
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              width: `${100 - split}%`,
              background: "#0021a5",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 750,
              padding: "0 26px",
            }}
          >
            Florida
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 14,
            fontSize: 26,
            color: "#9aa0a8",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>{split}% of the league</div>
          <div style={{ display: "flex" }}>{100 - split}%</div>
        </div>
      </div>
    </div>,
    size,
  );
}
