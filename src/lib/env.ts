function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

export const RESEND_API_KEY = () => required("RESEND_API_KEY", process.env.RESEND_API_KEY);

/** The sender the weekly sequence goes out as. */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "PickemWeekly <picks@pickemweekly.com>";

/**
 * Whether a run is allowed to actually hand messages to the provider.
 *
 * Off unless something explicitly turns it on, because the failure modes here
 * are not symmetrical: a run that sends nothing costs a week of reminders,
 * and a run that sends the wrong thing cannot be taken back out of anybody's
 * inbox. A dry run does every other part of the job — works out who is due,
 * builds each message — and stops at the door.
 */
export const EMAIL_LIVE = process.env.EMAIL_LIVE === "true";

export const DEFAULT_SEASON = Number(
  process.env.NEXT_PUBLIC_DEFAULT_SEASON ?? new Date().getFullYear(),
);

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
