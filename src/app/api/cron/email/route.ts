import { NextResponse } from "next/server";
import { syncSecretMatches } from "@/lib/sync";
import { runEmailSequence } from "@/lib/email/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The weekly sequence, on a schedule.
 *
 * Separate from /api/cron rather than folded into it, because the two want
 * different things from a failure. A scores run that dies halfway is retried a
 * few minutes later at no cost; this one has already put messages in front of
 * people, and the shorter and more single-purpose it is, the less there is to
 * go wrong between deciding to send and writing down that it sent.
 *
 * Hourly is enough. Every message here is due within a window measured in
 * hours, not minutes, and a run that finds nothing costs one query.
 *
 * Sends nothing unless EMAIL_LIVE is true. `?dry=1` forces a dry run whatever
 * the environment says, which is how the plan gets read before it is believed;
 * `?only=someone@example.com` restricts a live run to one address.
 */
export async function GET(request: Request) {
  if (!syncSecretMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const only = url.searchParams.get("only") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "500");

  try {
    const summary = await runEmailSequence({
      live: dry ? false : undefined,
      onlyTo: only,
      limit: Number.isFinite(limit) ? limit : 500,
    });
    return NextResponse.json(summary);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
