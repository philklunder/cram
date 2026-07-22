import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// OAuth (and email-link) callback. The browser client uses the PKCE flow, so Google sends the
// user back here with a `?code=` that must be exchanged for a session server-side — that
// exchange is what sets the auth cookie via @supabase/ssr. Without this route the user would
// land on /dashboard with an unconsumed code and no session.
//
// `next` is where to send the user once signed in (defaults to /dashboard). It is constrained
// to a same-origin path so the callback can't be turned into an open redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  // Only allow internal paths ("/foo"), never "//evil.com" or "https://evil.com".
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or the exchange failed — bounce back to login with a hint.
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
