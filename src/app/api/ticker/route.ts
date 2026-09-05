import { NextResponse } from "next/server";
import { loadTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

/**
 * What the ticker polls while games are on.
 *
 * Public, because the landing page it feeds is. It publishes nothing that the
 * games table does not already expose to anon — scores, ranks and a clock —
 * and the cron behind it runs every few minutes, so a short shared cache costs
 * nothing in freshness and takes the load off Postgres when a lot of people
 * have the page open at once.
 */
export async function GET() {
  const state = await loadTicker();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
  });
}
