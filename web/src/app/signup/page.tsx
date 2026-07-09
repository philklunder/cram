import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Same gate as /login — this route just opens the shared auth card on the "create account" tab.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <LoginForm initialMode="signup" />;
}
