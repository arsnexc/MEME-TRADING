"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { NETWORKS, SCANNER_TIMEFRAMES, scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
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

const LIQUIDITY_STEPS = [
  { value: "0", label: "Any" },
  { value: "10000", label: "$10K" },
  { value: "50000", label: "$50K" },
  { value: "250000", label: "$250K" },
  { value: "1000000", label: "$1M" },
];

const VOLUME_STEPS = [
  { value: "0", label: "Any" },
  { value: "25000", label: "$25K" },
  { value: "100000", label: "$100K" },
  { value: "1000000", label: "$1M" },
];

const CHIP =
  "inline-flex h-5 items-center gap-1 rounded-[3px] border border-border bg-panel-2 pl-1.5 pr-1 text-[10px] text-muted";

function FilterChip({
  label,
  onClear,
  clearLabel,
}: {
  label: string;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <span className={CHIP}>
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] text-faint transition-colors hover:bg-panel-3 hover:text-fg"
      >
        <X className="h-2.5 w-2.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * Screener controls: chain and window on the left, category, text filter and
 * the advanced drawer on the right. Every control is 28px tall so the row
 * reads as one continuous strip rather than a pile of widgets.
 *
 * Active filters appear as removable chips underneath, which keeps the current
 * query legible without re-opening the drawer.
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
  minVolume,
  onMinVolumeChange,
  watchedOnly,
  onWatchedOnlyChange,
  watchedCount,
  showFilters,
  onToggleFilters,
  onReset,
  trailing,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  timeframe: ScannerTimeframe;
  onTimeframeChange: (value: ScannerTimeframe) => void;
  network: NetworkFilter;
  onNetworkChange: (value: NetworkFilter) => void;
  minLiquidity: number;
  onMinLiquidityChange: (value: number) => void;
  minVolume: number;
  onMinVolumeChange: (value: number) => void;
  watchedOnly: boolean;
  onWatchedOnlyChange: (value: boolean) => void;
  watchedCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  onReset: () => void;
  /** Optional trailing control rendered at the end of the strip (the display menu). */
  trailing?: React.ReactNode;
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const windowLabel = scannerTimeframeLabel(timeframe);

  // "/" focuses search from anywhere on the page, the way a desktop screener does.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const drawerActive = minLiquidity > 0 || minVolume > 0 || watchedOnly;
  const chips: { key: string; label: string; clear: () => void; clearLabel: string }[] = [];
  if (network !== "all") {
    chips.push({
      key: "network",
      label: `Network: ${NETWORKS[network].label}`,
      clear: () => onNetworkChange("all"),
      clearLabel: "Clear network filter",
    });
  }
  if (query.trim()) {
    chips.push({
      key: "query",
      label: `Search: “${query.trim()}”`,
      clear: () => onQueryChange(""),
      clearLabel: "Clear text filter",
    });
  }
  if (minLiquidity > 0) {
    chips.push({
      key: "liquidity",
      label: `Liquidity ≥ $${minLiquidity >= 1_000_000 ? `${minLiquidity / 1_000_000}M` : `${minLiquidity / 1000}K`}`,
      clear: () => onMinLiquidityChange(0),
      clearLabel: "Clear minimum liquidity",
    });
  }
  if (minVolume > 0) {
    chips.push({
      key: "volume",
      label: `${windowLabel} volume ≥ $${minVolume >= 1_000_000 ? `${minVolume / 1_000_000}M` : `${minVolume / 1000}K`}`,
      clear: () => onMinVolumeChange(0),
      clearLabel: "Clear minimum volume",
    });
  }
  if (watchedOnly) {
    chips.push({
      key: "watched",
      label: "Tracked only",
      clear: () => onWatchedOnlyChange(false),
      clearLabel: "Clear tracked-only filter",
    });
  }

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
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onQueryChange("");
            }}
            placeholder="Search token, symbol or address…"
            aria-label="Filter loaded tokens"
            className="h-7 rounded-[4px] border-border bg-panel pl-7 pr-7 text-[11px] placeholder:text-faint hover:border-border-strong focus:border-border-strong"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-[2px] text-faint transition-colors hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[2px] border border-border px-1 text-[9px] leading-4 text-faint">
              /
            </kbd>
          )}
        </div>

        <Tooltip content="Minimum liquidity, minimum volume, tracked-only and the active filter reset.">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-expanded={showFilters}
            className={cn(
              "relative flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] border px-2.5 text-[11px] font-medium transition-colors",
              showFilters || drawerActive
                ? "border-info/50 bg-info/10 text-fg"
                : "border-border bg-panel text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <SlidersHorizontal className="h-3 w-3" /> Filters
            {drawerActive ? (
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-info" />
            ) : null}
          </button>
        </Tooltip>

        {trailing}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#1c1c1c] px-3 py-1.5" aria-label="Active filters">
          <span className="text-[10px] uppercase tracking-[0.08em] text-faint">Active</span>
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onClear={chip.clear} clearLabel={chip.clearLabel} />
          ))}
          <button
            type="button"
            onClick={onReset}
            className="ml-0.5 text-[10px] text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
          >
            Reset all
          </button>
          <span className="num ml-auto text-[10px] text-faint">
            {watchedCount} tracked
          </span>
        </div>
      ) : null}

      {showFilters ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#1c1c1c] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Min liquidity</span>
          <Segmented
            size="xs"
            label="Minimum liquidity"
            value={String(minLiquidity)}
            onChange={(value) => onMinLiquidityChange(Number(value))}
            options={LIQUIDITY_STEPS}
          />

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Min {windowLabel} volume</span>
          <Segmented
            size="xs"
            label={`Minimum ${windowLabel} volume`}
            value={String(minVolume)}
            onChange={(value) => onMinVolumeChange(Number(value))}
            options={VOLUME_STEPS}
          />

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

          <Tooltip content="Show only the tokens saved in Trackers. The watchlist lives in this browser.">
            <button
              type="button"
              aria-pressed={watchedOnly}
              onClick={() => onWatchedOnlyChange(!watchedOnly)}
              className={cn(
                "flex h-5 items-center gap-1.5 rounded-[2px] border px-1.5 text-2xs font-medium transition-colors",
                watchedOnly
                  ? "border-border-strong bg-panel-3 text-fg"
                  : "border-border bg-transparent text-muted hover:text-fg",
              )}
            >
              <Star className={cn("h-2.5 w-2.5", watchedOnly && "fill-fg")} aria-hidden="true" />
              Tracked only
              <span className="num text-faint">{watchedCount}</span>
            </button>
          </Tooltip>

          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-[10px] text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
