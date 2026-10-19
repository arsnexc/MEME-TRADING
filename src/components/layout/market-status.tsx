"use client";

import { Radio } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/lib/formatting";
import { useMarketStore } from "@/stores/market";
import { cn } from "@/lib/utils";

export function MarketStatus() {
  const quotePrices = useMarketStore((state) => state.quotePrices);
  const lastListUpdate = useMarketStore((state) => state.lastListUpdate);
  const now = useNow(10_000);
  const last = quotePrices.fetchedAt || lastListUpdate || 0;
  const age = last ? now - last : Infinity;
  const state = !last ? "idle" : age < 120_000 ? "live" : age < 600_000 ? "delayed" : "stale";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:text-fg"
          aria-label="Market data status"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "live" && "bg-buy live-dot",
              state === "delayed" && "bg-warn",
              (state === "stale" || state === "idle") && "bg-faint",
            )}
          />
          <span className="hidden sm:inline">
            {state === "live" ? "Live" : state === "delayed" ? "Delayed" : state === "stale" ? "Stale" : "Connecting"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Radio className="h-3.5 w-3.5 text-accent" />
          <p className="text-xs font-medium">Market data</p>
        </div>
        <dl className="mt-2 space-y-1.5 text-2xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Discovery</dt>
            <dd className="num text-fg">GeckoTerminal trending pools</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Search & metadata</dt>
            <dd className="text-fg">DEX Screener v1</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Last response</dt>
            <dd className="num text-fg">{last ? formatRelativeTime(last, now) : "Waiting"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">SOL / USD</dt>
            <dd className="num text-fg">{quotePrices.SOL ? `$${quotePrices.SOL.usd.toFixed(2)}` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">ETH / USD</dt>
            <dd className="num text-fg">{quotePrices.ETH ? `$${quotePrices.ETH.usd.toFixed(2)}` : "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 border-t border-border pt-2 text-2xs leading-relaxed text-faint">
          Public, keyless APIs. Cached and de-duplicated per client. Polling intervals respect the providers&apos;
          published limits (30/min GeckoTerminal, 300/min DEX Screener).
        </p>
      </PopoverContent>
    </Popover>
  );
}
