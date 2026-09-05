import { ImageResponse } from "next/og";
import { loadInvitePreview } from "./invite";

export const alt = "You've been invited to a PickemWeekly league";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card an invite link unfurls into.
 *
 * It names the league, because an invite pasted into a group chat competes
 * with everything else in that chat, and "Join My League!" over the actual
 * league name is the difference between a tap and a scroll past.
 */
export default async function InviteImage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await loadInvitePreview(code);
  const leagueName = invite?.name ?? null;
  const detail = invite?.detail ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#101215",
          padding: "68px 76px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              color: "#5fbf85",
              letterSpacing: "-0.01em",
            }}
          >
            PickemWeekly
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              color: "#eceef1",
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
              marginTop: 22,
            }}
          >
            Join My League!
          </div>

          {leagueName ? (
            <div
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 700,
                color: "#5fbf85",
                letterSpacing: "-0.02em",
                marginTop: 20,
                maxWidth: 1000,
              }}
            >
              {leagueName}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              fontSize: 29,
              color: "#9aa0a8",
              marginTop: leagueName ? 12 : 22,
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            {detail ?? "Weekly college football pick'em with your friends."}
          </div>
        </div>

        {/* The same bar the app draws every game with. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 78,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                width: "58%",
                background: "#bb0000",
                color: "#ffffff",
                fontSize: 27,
                fontWeight: 750,
                padding: "0 24px",
              }}
            >
              Ohio State
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                width: "42%",
                background: "#0021a5",
                color: "#ffffff",
                fontSize: 27,
                fontWeight: 750,
                padding: "0 24px",
              }}
            >
              Florida
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 25,
              color: "#9aa0a8",
              fontWeight: 700,
            }}
          >
            Pick every week. Settle it in a bracket.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
