import { Skeleton } from "@cipher-atlas/ui/components/skeleton";

export function ListSkeleton({ rows = 3, rowHeight = "h-20" }: { rows?: number; rowHeight?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`w-full rounded-xl ${rowHeight}`} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = "h-56" }: { height?: string }) {
  return <Skeleton className={`w-full rounded-xl ${height}`} role="status" aria-label="Loading chart" />;
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Loading stats">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
