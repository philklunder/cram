import { SettingsView } from "@/components/pages/SettingsView";
import { createClient } from "@/lib/supabase/server";

// Reads the session so it can show the account email. The (app) layout already gates auth.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <SettingsView email={user?.email ?? null} />;
}
