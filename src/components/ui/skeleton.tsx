import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[2px] bg-panel-3/80", className)} aria-hidden="true" />;
}

const COL_WIDTHS = ["w-12", "w-14", "w-10", "w-16", "w-14", "w-16", "w-14", "w-10", "w-12"];

/**
 * Screener-shaped placeholder: same column rhythm as the real table so the
 * page does not jump when rows arrive.
 */
export function TableSkeleton({ rows = 9, cols = 9 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-label="Loading market data" role="status">
      <div className="flex h-8 items-center gap-4 border-b border-border bg-[#0f0f0f] px-3">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="ml-auto h-2 w-10" />
        <Skeleton className="h-2 w-12" />
        <Skeleton className="h-2 w-10" />
        <Skeleton className="h-2 w-14" />
        <Skeleton className="h-2 w-14" />
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex h-10 items-center gap-4 border-b border-[#1f1f1f] px-3">
          <Skeleton className="h-6 w-6 shrink-0 rounded-[3px]" />
          <div className="w-28 shrink-0 space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2 w-14" />
          </div>
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className={cn("h-2.5", COL_WIDTHS[col % COL_WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}
