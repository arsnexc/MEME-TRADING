"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "sm",
  tone = "neutral",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "xs" | "sm" | "md";
  tone?: "neutral" | "trade";
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-sm border border-border bg-panel p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[2px] font-medium transition-colors",
              size === "xs" ? "h-5 px-1.5 text-2xs" : size === "md" ? "h-8 px-3 text-xs" : "h-6 px-2 text-2xs",
              active
                ? tone === "trade"
                  ? "bg-panel-3 text-fg"
                  : "bg-panel-3 text-fg"
                : "text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
