"use client";

// DEV-ONLY visual preview of the app shell (sidebar + top bar) around placeholder content, so the
// chrome can be screenshotted/iterated without a Supabase login. Gated to non-production like the
// sibling /preview harness. Delete with the rest of the preview harness before shipping.
import { notFound } from "next/navigation";
import { Home } from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function ShellPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell email="philipp@cram.study" activeHref="/dashboard">
      <PlaceholderPage
        icon={Home}
        title="Dashboard"
        description="Your study desk — today's review, streak, weak topics, and every subject at a glance. Being built now."
      />
    </AppShell>
  );
}
