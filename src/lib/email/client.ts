import { EMAIL_FROM, RESEND_API_KEY } from "@/lib/env";

/**
 * The one call that actually hands a message to Resend.
 *
 * Plain fetch rather than the SDK: this is a single POST with a JSON body, and
 * a dependency that wraps one endpoint is a version to keep current and a
 * supply chain to trust for no reading benefit.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type Outgoing = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The page a reader lands on from the footer link. */
  unsubscribeUrl: string;
  /** The endpoint a mail client POSTs to for one-click. Not a page. */
  oneClickUrl: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(message: Outgoing): Promise<SendResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        // Gmail and Yahoo both expect bulk mail to carry these, and they are
        // the difference between an unsubscribe and somebody reaching for the
        // spam button instead — which costs the sending domain far more than
        // the one reader. The POST variant lets the client unsubscribe without
        // opening anything.
        headers: {
          "List-Unsubscribe": `<${message.oneClickUrl}>, <${message.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const body = (await res.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!res.ok) {
      return { ok: false, error: body?.message ?? `Resend returned ${res.status}` };
    }
    if (!body?.id) {
      return { ok: false, error: "Resend accepted the message but returned no id" };
    }
    return { ok: true, id: body.id };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "network error" };
  }
}
