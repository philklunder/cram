import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { greetingName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Reads the session so the hero can greet the user by name. The (app) layout already gates auth.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <DashboardHome name={greetingName(user?.user_metadata, user?.email)} />;
}
