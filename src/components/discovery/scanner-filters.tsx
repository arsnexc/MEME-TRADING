"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { SCANNER_TIMEFRAMES, type ScannerTimeframe } from "@/lib/constants";
import type { NetworkFilter } from "@/lib/market-view";
import { cn } from "@/lib/utils";

/**
 * Screener controls: chain and window on the left, text filter and the
 * advanced drawer on the right. Every control is 28px tall so the row reads as
 * one continuous strip rather than a pile of widgets.
 */
export function ScannerFilters({
  query,
  onQueryChange,
  timeframe,
  onTimeframeChange,
  network,
  onNetworkChange,
  minLiquidity,
  onMinLiquidityChange,
  showFilters,
  onToggleFilters,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  timeframe: ScannerTimeframe;
  onTimeframeChange: (value: ScannerTimeframe) => void;
  network: NetworkFilter;
  onNetworkChange: (value: NetworkFilter) => void;
  minLiquidity: number;
  onMinLiquidityChange: (value: number) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}) {
  return (
    <div className="border-b border-border bg-bg">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Segmented
          label="Network filter"
          value={network}
          onChange={(value) => onNetworkChange(value as NetworkFilter)}
          className="shrink-0 rounded-[4px]"
          options={[
            { value: "all", label: "All" },
            { value: "solana", label: "Solana" },
            { value: "eth", label: "Ethereum" },
            { value: "base", label: "Base" },
          ]}
        />

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

        <Segmented
          label="Timeframe"
          value={timeframe}
          onChange={(value) => onTimeframeChange(value as ScannerTimeframe)}
          className="shrink-0 rounded-[4px]"
          options={SCANNER_TIMEFRAMES.map((item) => ({ value: item.value, label: item.label }))}
        />

        <div className="relative ml-auto w-full min-w-[180px] sm:w-[248px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search token, symbol or address…"
            aria-label="Filter loaded tokens"
            className="h-7 rounded-[4px] border-border bg-panel pl-7 pr-2 text-[11px] placeholder:text-faint hover:border-border-strong focus:border-border-strong"
          />
        </div>

        <Tooltip content="Minimum-liquidity filter. Unknown values are never replaced with estimates.">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-expanded={showFilters}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] border px-2.5 text-[11px] font-medium transition-colors",
              showFilters
                ? "border-info/50 bg-info/10 text-fg"
                : "border-border bg-panel text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <SlidersHorizontal className="h-3 w-3" /> Filters
          </button>
        </Tooltip>
      </div>

      {showFilters ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#1c1c1c] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Min liquidity</span>
          <Segmented
            size="xs"
            label="Minimum liquidity"
            value={String(minLiquidity)}
            onChange={(value) => onMinLiquidityChange(Number(value))}
            options={[
              { value: "0", label: "Any" },
              { value: "10000", label: "$10K" },
              { value: "50000", label: "$50K" },
              { value: "250000", label: "$250K" },
            ]}
          />
          <span className="text-[10px] text-faint">Applied to the loaded provider page only.</span>
        </div>
      ) : null}
    </div>
  );
}
