"use client";

import Link from "next/link";
import { ArrowUpRight, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Spinner } from "@/components/ui/spinner";
import { TokenAvatar } from "@/components/token/token-avatar";
import { SavedCallouts } from "@/components/discovery/saved-callouts";
import { useTokenPrices, trackedKey } from "@/hooks/use-token-prices";
import { useNow } from "@/hooks/use-now";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { NETWORKS, type NetworkId } from "@/lib/constants";
import { formatPercent, formatRelativeTime, pnlClass } from "@/lib/formatting";
import { terminalHrefFor } from "@/lib/terminal-href";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { useWatchlistStore } from "@/stores/watchlist";
import { toast } from "@/stores/toast";

const LIVE_LIMIT = 12;

export function TrackersView() {
  const hydrated = useHydrated();
  const now = useNow(15_000);
  const entries = useWatchlistStore((state) => state.entries);
  const remove = useWatchlistStore((state) => state.remove);
  const snapshots = useMarketStore((state) => state.snapshots);
  const { formatPrice, formatMoney } = useDisplayCurrency();

  const monitored = entries.slice(0, LIVE_LIMIT);
  const tracked = useTokenPrices(monitored, 45_000);

  const counts = entries.reduce<Record<NetworkId, number>>(
    (acc, entry) => {
      acc[entry.network] += 1;
      return acc;
    },
    { solana: 0, eth: 0, base: 0 },
  );

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-2xs text-faint">
        <Spinner /> Restoring saved trackers…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-fg">
            <Star className="h-4 w-4 text-warn" /> Trackers
          </h1>
          <p className="mt-0.5 text-2xs text-muted">
            Tokens you starred are saved in this browser only. Prices refresh for the first {LIVE_LIMIT} entries;
            the rest update whenever discovery or a terminal is open.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(["solana", "eth", "base"] as const).map((network) =>
            counts[network] > 0 ? (
              <Badge key={network} tone="neutral">
                {NETWORKS[network].shortLabel} {counts[network]}
              </Badge>
            ) : null,
          )}
          <Badge tone="ghost">{entries.length}/100 saved</Badge>
        </div>
      </div>

      {tracked.error && entries.length > 0 ? (
        <div className="border-b border-warn/20 bg-warn/[0.04] px-3 py-1 text-2xs text-warn">
          Live tracker prices could not be refreshed: {tracked.error}. Showing the last provider snapshot where
          available.
        </div>
      ) : null}

      <section aria-labelledby="watchlist-heading">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1">
          <h2 id="watchlist-heading" className="text-2xs font-semibold uppercase tracking-wide text-muted">
            Watchlist
          </h2>
          {tracked.lastUpdated ? (
            <span className="text-2xs text-faint">prices {formatRelativeTime(tracked.lastUpdated, now)}</span>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No tracked tokens yet"
            description="Star a token in discovery (or from its terminal) to keep it here. Trackers are a local bookmark list — nothing is published or shared."
            action={
              <Link href="/" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
                Browse discovery <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <table className="w-full min-w-[760px] border-separate border-spacing-0" aria-label="Tracked tokens">
              <thead className="bg-panel">
                <tr className="text-2xs uppercase tracking-wide text-faint">
                  {["Token", "Network", "Price", "24h", "Market cap", "Liquidity", "Added", "Actions"].map((heading) => (
                    <th
                      key={heading}
                      className={cn(
                        "border-b border-border px-2 py-1.5 font-medium",
                        heading === "Token" ? "pl-3 text-left" : heading === "Network" || heading === "Actions" ? "text-left" : "text-right",
                      )}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const snapshot = snapshots[`${entry.network}:${entry.address}`];
                  const live = index < LIVE_LIMIT ? tracked.prices[trackedKey(entry)] : undefined;
                  const priceUsd = live?.priceUsd ?? snapshot?.priceUsd ?? null;
                  const change = snapshot?.changePct.h24 ?? null;
                  return (
                    <tr key={entry.id} className="hover:bg-panel-2/60">
                      <td className="border-b border-border/60 py-1 pl-3 pr-2">
                        <Link href={terminalHrefFor(entry)} className="group flex min-w-0 items-center gap-1.5">
                          <TokenAvatar src={entry.imageUrl} symbol={entry.symbol} size={20} />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-fg group-hover:text-white">
                              {entry.symbol}
                            </span>
                            <span className="block truncate text-2xs text-faint">{entry.name}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="border-b border-border/60 px-2 py-1">
                        <NetworkBadge network={entry.network} />
                      </td>
                      <td className="num border-b border-border/60 px-2 py-1 text-right text-xs text-fg">
                        {formatPrice(priceUsd)}
                        {live?.error ? <span className="ml-1 text-2xs text-warn" title={live.error}>stale</span> : null}
                      </td>
                      <td className={cn("num border-b border-border/60 px-2 py-1 text-right text-xs", pnlClass(change))}>
                        {change == null ? "—" : formatPercent(change, { sign: true })}
                      </td>
                      <td className="num border-b border-border/60 px-2 py-1 text-right text-xs text-muted">
                        {snapshot?.marketCapUsd != null
                          ? `${snapshot.marketCapIsFdv ? "FDV" : ""} ${formatMoney(snapshot.marketCapUsd, { compact: true })}`
                          : "—"}
                      </td>
                      <td className="num border-b border-border/60 px-2 py-1 text-right text-xs text-muted">
                        {formatMoney(snapshot?.liquidityUsd, { compact: true })}
                      </td>
                      <td className="border-b border-border/60 px-2 py-1 text-2xs text-faint">
                        {formatRelativeTime(entry.addedAt, now)}
                      </td>
                      <td className="border-b border-border/60 py-1 pl-2 pr-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={terminalHrefFor(entry)}
                            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                            aria-label={`Open ${entry.symbol} terminal`}
                          >
                            <ArrowUpRight className="h-2.5 w-2.5" /> Open
                          </Link>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${entry.symbol} from trackers`}
                            onClick={() => {
                              remove(entry.network, entry.address);
                              toast({ title: `${entry.symbol} removed from trackers`, variant: "info" });
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="tracker-callouts-heading" className="mt-2">
        <div className="flex items-center gap-2 border-y border-border px-3 py-1">
          <h2 id="tracker-callouts-heading" className="text-2xs font-semibold uppercase tracking-wide text-muted">
            Saved callouts
          </h2>
          <span className="text-2xs text-faint">local notes only · never posted</span>
        </div>
        <SavedCallouts />
      </section>
    </div>
  );
}
