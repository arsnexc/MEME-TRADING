"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-buy/50 bg-buy/30" : "border-border bg-panel-3",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "block h-2.5 w-2.5 rounded-full transition-transform",
          checked ? "translate-x-3.5 bg-buy" : "translate-x-0.5 bg-muted",
        )}
      />
    </button>
  );
}
