import type * as React from "react";
import { cn } from "@/lib/utils";

export function Metric({
  label,
  value,
  sub,
  tone,
  className,
  align = "left",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "buy" | "sell" | "muted" | "default" | "warn";
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right", className)}>
      <p className="truncate text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p
        className={cn(
          "num mt-0.5 truncate text-xs font-medium text-fg",
          tone === "buy" && "text-buy",
          tone === "sell" && "text-sell",
          tone === "muted" && "text-muted",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-2xs text-faint">{sub}</p> : null}
    </div>
  );
}
