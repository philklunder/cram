"use client";

import { ErrorBox, Skeleton } from "@/components/ui";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { loadDashboard } from "@/lib/api/client";
import { useAsync } from "@/lib/useAsync";

// Authenticated dashboard home: fetches everything in parallel, then hands the rows to the pure
// DashboardView. Loading shows a layout-matched skeleton (not a spinner), errors surface inline.
export function DashboardHome() {
  const { loading, error, data } = useAsync(() => loadDashboard(), []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return <DashboardView data={data} />;
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
