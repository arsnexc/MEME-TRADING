"use client";

import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/constants";
import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { cn } from "@/lib/utils";

export function QuoteSelector() {
  const { currency, setCurrency } = useDisplayCurrency();
  return (
    <Tooltip
      content={
        <span>
          Display conversion only. Paper accounts stay separated: <b>50 SOL</b> and <b>50 ETH</b>. Volumes and market
          caps are converted at the live SOL/ETH reference price.
        </span>
      }
    >
      <div
        role="group"
        aria-label="Display currency"
        className="flex items-center rounded-sm border border-border bg-panel p-0.5"
      >
        {DISPLAY_CURRENCIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={currency === option}
            onClick={() => setCurrency(option as DisplayCurrency)}
            className={cn(
              "h-5 rounded-[2px] px-1.5 text-2xs font-medium transition-colors",
              currency === option ? "bg-panel-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </Tooltip>
  );
}
