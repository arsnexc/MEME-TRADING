import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      {Icon ? (
        <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-panel-2 text-muted">
          <Icon className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <p className="text-xs font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-md text-2xs leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
