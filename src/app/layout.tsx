import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PickemWeekly — College Football Pick'em",
  description:
    "Run a weekly college football pick'em league with your friends: conference, all-FBS or top-25 slates, weekly winners and a fantasy-style playoff bracket.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
