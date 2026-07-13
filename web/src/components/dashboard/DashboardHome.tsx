"use client";

import { ErrorBox, Skeleton } from "@/components/ui";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { loadDashboard } from "@/lib/api/client";
import { useAsync } from "@/lib/useAsync";

// Authenticated dashboard home: fetches everything in parallel, then hands the rows to the pure
// DashboardView. Loading shows a layout-matched skeleton (not a spinner), errors surface inline.
export function DashboardHome({ name }: { name?: string | null }) {
  const { loading, error, data } = useAsync(() => loadDashboard(), []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return <DashboardView data={data} name={name} />;
}

// Matches the single-column four-region layout: hero → figures strip → subject grid → weekly chart.
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}
