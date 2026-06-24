// Public runtime configuration. All NEXT_PUBLIC_* so they are inlined for the browser.
// No secrets here: the Supabase anon key is public by design; the service-role key never
// belongs in a client bundle.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Backend base URL; trailing slash stripped so `${BACKEND_URL}/v1/...` is always clean.
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_CRAM_BACKEND_URL ?? "https://cram.up.railway.app"
).replace(/\/+$/, "");

// True only when Supabase auth can actually be used. Pages check this to render a friendly
// setup notice instead of crashing when .env.local has not been filled in yet.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
