import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Landing page for a password-recovery email. The link goes through /auth/callback, which
// exchanges its code for a (recovery) session and forwards here — so a signed-in user is the
// normal case. Without a session the link was already used or has expired.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ResetPasswordForm email={user?.email ?? null} hasSession={Boolean(user)} />;
}
