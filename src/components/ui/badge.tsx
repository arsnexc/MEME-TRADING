import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-2xs font-medium leading-none",
  {
    variants: {
      tone: {
        neutral: "border-border bg-panel-2 text-muted",
        green: "border-buy/25 bg-buy/10 text-buy",
        red: "border-sell/25 bg-sell/10 text-sell",
        accent: "border-accent/30 bg-accent/10 text-[#9aa6ff]",
        warn: "border-warn/30 bg-warn/10 text-warn",
        purple: "border-[#9945FF]/30 bg-[#9945FF]/10 text-[#c49cff]",
        blue: "border-[#627EEA]/30 bg-[#627EEA]/10 text-[#a6b7ff]",
        ghost: "border-transparent bg-transparent text-faint",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
