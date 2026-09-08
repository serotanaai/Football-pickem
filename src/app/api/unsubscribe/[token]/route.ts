import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe, for the mail client rather than the reader.
 *
 * Gmail and Yahoo put an Unsubscribe control in their own chrome for bulk mail
 * that offers List-Unsubscribe-Post, and press it by POSTing here — no page is
 * ever opened and nothing is rendered. Honouring it is what keeps that control
 * from being the spam button instead, so the reply is a bare 200 and the work
 * happens without asking anybody to confirm anything.
 */
export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = await createClient();
  await supabase.rpc("unsubscribe_by_token", { p_token: token });
  // Deliberately 200 either way. The sending client has no use for the
  // difference, and a 404 tells whoever probes it which tokens are real.
  return new NextResponse(null, { status: 200 });
}
