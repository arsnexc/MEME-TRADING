"use client";

import { useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { SCANNER_TIMEFRAMES, type ScannerTimeframe } from "@/lib/constants";
import type { NetworkFilter } from "@/lib/market-view";
import { cn } from "@/lib/utils";

/** Windows the pool APIs actually publish, plus the 7d slot they do not. */
const TIMEFRAME_OPTIONS: { value: ScannerTimeframe | "d7"; label: string; disabled?: boolean; title?: string }[] = [
  ...SCANNER_TIMEFRAMES.map((item) => ({ value: item.value as ScannerTimeframe | "d7", label: item.label })),
  {
    value: "d7",
    label: "7d",
    disabled: true,
    title: "GeckoTerminal and DEX Screener publish 5m–24h change windows. A 7-day window would mean one OHLCV request per token on every refresh, so it is not offered.",
  },
];

const NETWORK_OPTIONS: { value: NetworkFilter | "bsc"; label: string; disabled?: boolean; title?: string }[] = [
  { value: "all", label: "All" },
  { value: "solana", label: "Solana" },
  { value: "eth", label: "Ethereum" },
  { value: "base", label: "Base" },
  {
    value: "bsc",
    label: "BNB",
    disabled: true,
    title: "BNB Chain pools are not wired into this build: paper accounts only exist for SOL and ETH, so a Buy button on a BNB pool would be a dead end.",
  },
];

/**
 * Category filters. The pool APIs publish no sector tags, so only the
 * unfiltered option is live — the rest are listed, disabled and explained
 * rather than guessed from ticker names.
 */
const CATEGORY_OPTIONS = [
  { value: "all", label: "All memes" },
  { value: "dogs", label: "Dogs", disabled: true },
  { value: "cats", label: "Cats", disabled: true },
  { value: "ai", label: "AI", disabled: true },
  { value: "political", label: "Political", disabled: true },
];

/**
 * Screener controls: chain and window on the left, category, text filter and
 * the advanced drawer on the right. Every control is 28px tall so the row
 * reads as one continuous strip rather than a pile of widgets.
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
  const [categoryOpen, setCategoryOpen] = useState(false);

  return (
    <div className="border-b border-border bg-bg">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Segmented
          label="Network filter"
          value={network}
          onChange={(value) => onNetworkChange(value as NetworkFilter)}
          className="shrink-0 rounded-[4px]"
          options={NETWORK_OPTIONS.map((option) => ({
            ...option,
            disabled: option.disabled,
            title: option.title,
          }))}
        />

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

        <Segmented
          label="Timeframe"
          value={timeframe}
          onChange={(value) => onTimeframeChange(value as ScannerTimeframe)}
          className="shrink-0 rounded-[4px]"
          options={TIMEFRAME_OPTIONS.map((option) => ({
            ...option,
            disabled: option.disabled,
            title: option.title,
          }))}
        />

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Category filter"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] border border-border bg-panel px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              All memes
              <ChevronDown className="h-3 w-3 text-faint" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Category</p>
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === "all"}
                disabled={option.disabled}
                onClick={() => setCategoryOpen(false)}
                className={cn(
                  "flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[11px] transition-colors",
                  option.disabled ? "cursor-not-allowed text-faint/60" : "text-fg hover:bg-panel-2",
                )}
              >
                <Check
                  className={cn("h-3 w-3 shrink-0", option.value === "all" ? "text-fg" : "text-transparent")}
                  aria-hidden="true"
                />
                {option.label}
              </button>
            ))}
            <p className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[10px] leading-relaxed text-faint">
              Sector tags are not published by GeckoTerminal or DEX Screener, so they are listed but not applied. Rows
              are never guessed from ticker names.
            </p>
          </PopoverContent>
        </Popover>

        <div className="relative ml-auto w-full min-w-[180px] sm:w-[236px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search token, symbol or address…"
            aria-label="Filter loaded tokens"
            className="h-7 rounded-[4px] border-border bg-panel pl-7 pr-2 text-[11px] placeholder:text-faint hover:border-border-strong focus:border-border-strong"
          />
        </div>

        <Tooltip content="Minimum-liquidity and pool-age filters. Unknown values are never replaced with estimates.">
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
