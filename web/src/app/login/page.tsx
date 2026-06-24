import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Reading cookies (via the server client) makes this route dynamic — never prerendered, so no
// env is required at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/subjects");

  return <LoginForm />;
}
