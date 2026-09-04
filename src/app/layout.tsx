import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const TITLE = "PickemWeekly — College Football Pick'em";
const DESCRIPTION =
  "Run a weekly college football pick'em league with your friends: conference, all-FBS or top-25 slates, weekly winners and a fantasy-style playoff bracket.";

export const metadata: Metadata = {
  // A shared link is most of how a league grows, so the card it unfurls into
  // matters as much as the page. metadataBase is what resolves the generated
  // opengraph-image to the absolute URL Twitter and iMessage require.
  metadataBase: new URL(siteUrl()),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "PickemWeekly",
  openGraph: {
    type: "website",
    siteName: "PickemWeekly",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
