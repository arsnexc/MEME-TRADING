"use client";

import Link from "next/link";
import { ChevronLeft, ExternalLink, Info, RefreshCw, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Metric } from "@/components/ui/metric";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { SecurityBadges } from "@/components/token/security-badges";
import { SocialLinks } from "@/components/token/social-links";
import { TokenAvatar } from "@/components/token/token-avatar";
import { ChangeValue } from "@/components/discovery/token-row";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { formatAge, formatPercent, formatRelativeTime } from "@/lib/formatting";
import { NETWORKS } from "@/lib/constants";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import { cn, truncateMiddle } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useWatchlistStore } from "@/stores/watchlist";
import { toast } from "@/stores/toast";

export function TokenHeader({
  market,
  dexName,
  quotePrices,
  lastUpdated,
  stale,
  loading,
  transport,
  refreshing,
  onRefresh,
  warningCount,
}: {
  market: MarketToken | null;
  dexName: string | null;
  quotePrices: QuotePrices;
  lastUpdated: number | null;
  stale: boolean;
  loading: boolean;
  transport: "proxy" | "direct" | null;
  refreshing: boolean;
  onRefresh: () => void;
  warningCount: number;
}) {
  const hydrated = useHydrated();
  const watched = useWatchlistStore((state) =>
    market ? state.entries.some((e) => e.network === market.network && e.address === market.tokenAddress) : false,
  );
  const toggle = useWatchlistStore((state) => state.toggle);
  const { formatMoney, formatPrice, currency } = useDisplayCurrency();

  const lastUpdateAge = lastUpdated ? Date.now() - lastUpdated : null;
  const freshness =
    lastUpdateAge == null ? "waiting" : stale || lastUpdateAge > 60_000 ? "stale" : lastUpdateAge > 25_000 ? "delayed" : "live";

  if (!market) {
    return (
      <div className="border-b border-border bg-panel/40 px-3 py-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-64" />
          </div>
          {loading ? <Spinner className="ml-auto text-muted" /> : null}
        </div>
      </div>
    );
  }

  const txns = market.txns.h24;

  return (
    <div className="border-b border-border bg-panel/40">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-2.5 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back to discovery" className="mt-0.5" onClick={() => history.back()}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <TokenAvatar src={market.imageUrl} symbol={market.symbol} size={34} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="truncate text-sm font-semibold leading-tight text-fg">{market.name}</h1>
              <span className="text-xs font-medium text-muted">{market.symbol}</span>
              <NetworkBadge network={market.network} />
              <Badge tone="neutral" className="hidden sm:inline-flex">{dexName ?? market.dexId ?? "dex"}</Badge>
              <Badge tone="warn">PAPER</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-faint">
              <span className="num text-muted">{truncateMiddle(market.tokenAddress, 6, 6)}</span>
              <CopyButton value={market.tokenAddress} label="Copy token contract" />
              <Tooltip content={`${NETWORKS[market.network].explorerName} · open token contract`}>
                <a
                  href={NETWORKS[market.network].tokenUrl(market.tokenAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-faint hover:text-fg"
                  aria-label="Open token on block explorer"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </Tooltip>
              <Link href="/" className="hover:text-fg">
                Scanner
              </Link>
              <SocialLinks socials={market.socials} websites={market.websites} />
              <Tooltip content="Pool age is derived from the pool creation timestamp reported by the provider.">
                <span>· pool {formatAge(market.poolCreatedAt)}</span>
              </Tooltip>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!hydrated) return;
              const added = toggle({
                network: market.network,
                pool: market.pool,
                address: market.tokenAddress,
                symbol: market.symbol,
                name: market.name,
                imageUrl: market.imageUrl,
              });
              toast({ title: added ? "Added to Trackers" : "Removed from Trackers", variant: "info" });
            }}
            className={cn("mt-1 rounded-[2px] p-1", watched ? "text-warn" : "text-faint hover:text-fg")}
            aria-label={watched ? "Remove token from Trackers" : "Add token to Trackers"}
          >
            <Star className={cn("h-3.5 w-3.5", watched && "fill-warn")} />
          </button>
        </div>

        <div className="ml-auto flex items-start gap-3">
          <div className="text-right">
            <div className="num text-lg font-semibold leading-none tracking-tight">{formatPrice(market.priceUsd)}</div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-2xs">
              <ChangeValue value={market.changePct.h24} />
              <span className="text-faint">24h</span>
              {currency !== "USD" && market.priceUsd != null ? (
                <span className="num text-faint">· ${market.priceUsd.toPrecision(5)}</span>
              ) : null}
            </div>
          </div>
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-2xs",
                freshness === "live" && "border-buy/25 bg-buy/10 text-buy",
                freshness === "delayed" && "border-warn/25 bg-warn/10 text-warn",
                (freshness === "stale" || freshness === "waiting") && "border-border bg-panel-2 text-faint",
              )}
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  freshness === "live" && "bg-buy live-dot",
                  freshness === "delayed" && "bg-warn",
                  (freshness === "stale" || freshness === "waiting") && "bg-faint",
                )}
              />
              {freshness === "live"
                ? `live · ${lastUpdated ? formatRelativeTime(lastUpdated) : ""}`
                : freshness === "delayed"
                  ? "delayed"
                  : "stale"}
            </span>
            <div className="flex items-center gap-1">
              {warningCount > 0 ? (
                <Tooltip content={`${warningCount} provider warning${warningCount === 1 ? "" : "s"} — see the banner below.`}>
                  <Badge tone="warn" className="gap-0.5">
                    <Info className="h-2.5 w-2.5" /> {warningCount}
                  </Badge>
                </Tooltip>
              ) : null}
              {transport === "direct" ? <Badge tone="warn">direct</Badge> : null}
              <Button size="icon-sm" variant="ghost" onClick={onRefresh} aria-label="Refresh token data" disabled={refreshing}>
                {refreshing ? <Spinner /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 px-3 py-1.5">
        <Metric
          label="Market cap"
          value={formatMoney(market.marketCapUsd, { compact: true })}
          sub={market.marketCapIsFdv ? "FDV (supply unknown)" : undefined}
        />
        <Metric label="Liquidity" value={formatMoney(market.liquidityUsd, { compact: true })} />
        <Metric label="24h volume" value={formatMoney(market.volumeUsd.h24, { compact: true })} />
        <Metric
          label="24h txns"
          value={txns ? `${txns.buys.toLocaleString()} / ${txns.sells.toLocaleString()}` : "—"}
          sub={txns ? "buy / sell" : "unavailable"}
        />
        <Metric
          label="24h change"
          value={market.changePct.h24 != null ? formatPercent(market.changePct.h24) : "—"}
          tone={market.changePct.h24 == null ? "muted" : market.changePct.h24 >= 0 ? "buy" : "sell"}
        />
        <Metric label="FDV" value={formatMoney(market.fdvUsd, { compact: true })} />
        <div className="flex items-center gap-1 border-l border-border pl-3">
          <SecurityBadges security={market.security} />
        </div>
        <Tooltip
          content={
            <span>
              Reference prices: SOL {quotePrices.SOL ? `$${quotePrices.SOL.usd.toFixed(2)}` : "unavailable"} · ETH{" "}
              {quotePrices.ETH ? `$${quotePrices.ETH.usd.toFixed(2)}` : "unavailable"}. Orders settle in the network&apos;s
              paper account.
            </span>
          }
        >
          <Badge tone="neutral" className="ml-auto hidden lg:inline-flex">
            {market.quote} paper account · prices in {currency}
          </Badge>
        </Tooltip>
      </div>
    </div>
  );
}
