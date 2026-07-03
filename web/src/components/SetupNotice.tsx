import { BrandMark } from "@/components/ui";

// Shown when the Supabase env vars are not configured, so the app degrades to a helpful
// message instead of crashing on a missing client.
export function SetupNotice() {
  return (
    <div className="mx-auto mt-24 max-w-lg px-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-card dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <h2 className="text-base font-semibold">Configuration needed</h2>
        </div>
        <p className="mt-3">
          The web app is not yet connected to Supabase. Copy{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20">.env.example</code> to{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20">.env.local</code> and set:
        </p>
        <ul className="mt-2 space-y-1">
          <li>
            <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20">NEXT_PUBLIC_SUPABASE_URL</code>
          </li>
          <li>
            <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
        </ul>
        <p className="mt-3">
          Then restart the dev server. See{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20">web/README.md</code>.
        </p>
      </div>
    </div>
  );
}
