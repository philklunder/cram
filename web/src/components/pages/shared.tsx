"use client";

import type { ReactNode } from "react";

import { ErrorBox, Skeleton } from "@/components/ui";
import { loadLibrary, type LibraryData } from "@/lib/api/client";
import { useAsync } from "@/lib/useAsync";

// Consistent page heading across the routed sidebar destinations.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-prose text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </header>
  );
}

// Loads the shared library data (subjects/cards/quizzes/questions) once and hands it to the page's
// presentational view. Loading shows a skeleton, errors surface inline — the pages themselves stay
// pure (and previewable with mock data).
export function LibraryLoader({ children }: { children: (data: LibraryData) => ReactNode }) {
  const { loading, error, data } = useAsync(() => loadLibrary(), []);
  if (loading) return <LibrarySkeleton />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  return <>{children(data)}</>;
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
