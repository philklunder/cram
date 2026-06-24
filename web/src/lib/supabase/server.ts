import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

// Server Supabase client, bound to the request cookies. Used by Server Components and the
// route layout to validate the session (auth gating). Reading cookies makes those routes
// dynamic, so they are never statically prerendered at build time (no env needed to build).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll from a Server Component is a no-op (cookies are read-only there); the
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
