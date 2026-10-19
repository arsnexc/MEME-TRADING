"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { SCANNER_TIMEFRAMES, type NetworkId, type ScannerTimeframe } from "@/lib/constants";
import type { NetworkFilter } from "@/lib/market-view";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-1.5">
      <Segmented
        label="Network filter"
        value={network}
        onChange={(value) => onNetworkChange(value as NetworkFilter)}
        options={[
          { value: "all", label: "All" },
          { value: "solana" as NetworkId, label: "Solana" },
          { value: "eth" as NetworkId, label: "Ethereum" },
          { value: "base" as NetworkId, label: "Base" },
        ]}
      />
      <Segmented
        label="Timeframe"
        value={timeframe}
        onChange={(value) => onTimeframeChange(value as ScannerTimeframe)}
        options={SCANNER_TIMEFRAMES.map((item) => ({ value: item.value, label: item.label }))}
      />
      <div className="relative min-w-[150px] flex-1 sm:max-w-[220px]">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter loaded rows…"
          aria-label="Filter loaded tokens"
          className="h-7 bg-panel pl-7 text-2xs"
        />
      </div>
      <Tooltip content="Additional filters. Unknown values are never replaced with estimates.">
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          className={cn(
            "flex h-7 items-center gap-1 rounded-sm border px-2 text-2xs transition-colors",
            showFilters ? "border-accent/40 bg-accent/10 text-fg" : "border-border bg-panel text-muted hover:text-fg",
          )}
        >
          <SlidersHorizontal className="h-3 w-3" /> Filters
        </button>
      </Tooltip>
      {showFilters ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-1.5">
          <span className="text-2xs text-faint">Min liquidity</span>
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
          <span className="ml-1 text-2xs text-faint">
            Applied to loaded rows only · sorting covers the current provider page
          </span>
        </div>
      ) : null}
    </div>
  );
}
