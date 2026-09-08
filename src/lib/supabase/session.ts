import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

// Metadata routes are fetched by link crawlers, which carry no session. Sending
// Twitter's crawler to /login means a shared link unfurls into nothing.
const PUBLIC_FILES = [
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

// The endpoints the landing page calls while nobody is signed in, plus the two
// unsubscribe entry points.
//
// These were being redirected to /login, which for a fetch means the JSON parse
// fails and the caller's catch swallows it: the picks counter had never once
// refreshed from the server, and the live scores never polled, because the only
// people who see that page are logged out. An unsubscribe link is worse still —
// it is opened from an inbox by somebody who may never sign in again, and
// asking them for a password in order to stop sending them email is how a spam
// complaint gets filed instead.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth",
  "/join",
  "/reset-password",
  "/unsubscribe",
  "/api/unsubscribe",
  "/api/picks-count",
  "/api/ticker",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_FILES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
