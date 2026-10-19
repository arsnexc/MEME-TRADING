import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[2px] bg-panel-3/80", className)} aria-hidden="true" />;
}

const COL_WIDTHS = ["w-16", "w-10", "w-14", "w-12", "w-20", "w-10", "w-12", "w-16"];

export function TableSkeleton({ rows = 9, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-label="Loading market data" role="status">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex h-10 items-center gap-4 border-b border-border/60 px-3">
          <Skeleton className="h-6 w-6 rounded-sm" />
          <Skeleton className="h-2.5 w-28" />
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className={cn("h-2.5", COL_WIDTHS[col % COL_WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}
