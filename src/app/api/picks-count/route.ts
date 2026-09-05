import { NextResponse } from "next/server";
import { loadPickCount } from "@/lib/ticker";

export const dynamic = "force-dynamic";

/**
 * The picks total, for the counter on the landing page to keep current while
 * somebody is reading.
 *
 * Public, like the page it feeds. It publishes one integer and the definer
 * function behind it reads nothing else, so no individual pick is exposed by
 * counting them.
 */
export async function GET() {
  const count = await loadPickCount();
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
  );
}
