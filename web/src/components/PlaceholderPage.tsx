import type { LucideIcon } from "lucide-react";

// A routed placeholder for sidebar destinations that don't have their real surface yet, so nav
// links are never dead. Each states plainly what the page will hold. Replaced with the real
// surface as each is built out (see the "Route out sidebar destinations" phase).
export function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto flex min-h-[52vh] max-w-xl flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/12 dark:text-brand-300 dark:ring-brand-400/20">
        <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
        Coming soon
      </span>
    </section>
  );
}
