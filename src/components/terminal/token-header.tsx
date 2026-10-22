"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronLeft, ExternalLink, Info, RefreshCw, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { SecurityBadges } from "@/components/token/security-badges";
import { SocialLinks } from "@/components/token/social-links";
import { TokenAvatar } from "@/components/token/token-avatar";
import { ChangeValue } from "@/components/discovery/token-row";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { formatAge, formatRelativeTime } from "@/lib/formatting";
import { NETWORKS } from "@/lib/constants";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import { cn, truncateMiddle } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useWatchlistStore } from "@/stores/watchlist";
import { toast } from "@/stores/toast";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11px]">
      <span className="text-faint">{label}</span>
      <span className={cn("num", tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-muted")}>{value}</span>
    </span>
  );
}

/**
 * Instrument strip above the chart: the compact symbol/price/metrics row from
 * the reference terminal. Contract, socials and security notes stay one click
 * away in the info popover rather than being dropped.
 */
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
  const { formatMoney, currency } = useDisplayCurrency();

  const freshness = useMemo(() => {
    if (lastUpdated == null) return "waiting" as const;
    const age = Date.now() - lastUpdated;
    if (stale || age > 60_000) return "stale" as const;
    if (age > 25_000) return "delayed" as const;
    return "live" as const;
  }, [lastUpdated, stale]);

  if (!market) {
    return (
      <div className="flex h-11 items-center gap-2 border-b border-border px-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-48" />
        {loading ? <Spinner className="ml-auto text-muted" /> : null}
      </div>
    );
  }

  const txns = market.txns.h24;

  return (
    <div className="border-b border-border bg-[#111111]">
      <div className="flex h-11 items-center gap-2 overflow-x-auto px-1.5 panel-scroll">
        <Button variant="ghost" size="icon-sm" aria-label="Back to discovery" onClick={() => history.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <TokenAvatar src={market.imageUrl} symbol={market.symbol} size={22} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h1 className="truncate text-[13px] font-semibold leading-none text-fg">{market.symbol}</h1>
          <span className="hidden truncate text-[11px] text-faint sm:inline">{market.name}</span>
          <NetworkBadge network={market.network} />
          <Badge tone="neutral" className="hidden md:inline-flex">
            {dexName ?? market.dexId ?? "dex"}
          </Badge>
          <Badge tone="warn" className="hidden sm:inline-flex">
            PAPER
          </Badge>
        </div>

        <div className="ml-3 hidden items-center gap-3 border-l border-border pl-3 xl:flex">
          <Stat label="MCap" value={formatMoney(market.marketCapUsd, { compact: true })} />
          <Stat label="Liq" value={formatMoney(market.liquidityUsd, { compact: true })} />
          <Stat label="Vol 24h" value={formatMoney(market.volumeUsd.h24, { compact: true })} />
          <Stat
            label="Txns"
            value={txns ? `${txns.buys.toLocaleString()}/${txns.sells.toLocaleString()}` : "—"}
          />
        </div>

        <div className="ml-auto flex items-center gap-2 pl-2">
          <div className="text-right">
            <div className="num text-[13px] font-semibold leading-none text-fg">
              <PriceTag priceUsd={market.priceUsd} currency={currency} />
            </div>
          </div>
          <ChangeValue value={market.changePct.h24} />
          <span
            className={cn(
              "hidden items-center gap-1 whitespace-nowrap text-[10px] sm:inline-flex",
              freshness === "live" ? "text-buy" : freshness === "delayed" ? "text-warn" : "text-faint",
            )}
          >
            <span
              className={cn(
                "h-1 w-1 rounded-full",
                freshness === "live" && "bg-buy",
                freshness === "delayed" && "bg-warn",
                (freshness === "stale" || freshness === "waiting") && "bg-faint",
              )}
            />
            {lastUpdated ? formatRelativeTime(lastUpdated) : "waiting"}
          </span>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Token details"
                className="rounded-[2px] p-1 text-faint transition-colors hover:bg-panel-2 hover:text-fg"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <div className="flex items-center gap-1.5">
                <span className="num text-2xs text-muted">{truncateMiddle(market.tokenAddress, 8, 8)}</span>
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
                <Link href="/" className="ml-auto text-2xs text-faint hover:text-fg">
                  Scanner
                </Link>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-faint">
                <SocialLinks socials={market.socials} websites={market.websites} />
                <span>· pool {formatAge(market.poolCreatedAt)}</span>
                {market.marketCapIsFdv ? <span>· market cap is FDV (supply unknown)</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
                <SecurityBadges security={market.security} />
                {warningCount > 0 ? <Badge tone="warn">{warningCount} provider warning{warningCount === 1 ? "" : "s"}</Badge> : null}
                {transport === "direct" ? <Badge tone="warn">direct</Badge> : null}
                <span className="ml-auto text-2xs text-faint">
                  {market.quote} account · {currency}
                </span>
              </div>
              {market.changePct.h24 != null ? (
                <p className="mt-2 text-2xs text-faint">
                  24h change <span className="num text-muted">{market.changePct.h24.toFixed(2)}%</span> · reference prices SOL{" "}
                  {quotePrices.SOL ? `$${quotePrices.SOL.usd.toFixed(2)}` : "—"} / ETH{" "}
                  {quotePrices.ETH ? `$${quotePrices.ETH.usd.toFixed(2)}` : "—"}
                </p>
              ) : null}
            </PopoverContent>
          </Popover>

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
              toast({ title: added ? "Added to Watchlist" : "Removed from Watchlist", variant: "info" });
            }}
            className={cn("rounded-[2px] p-1", watched ? "text-warn" : "text-faint hover:text-fg")}
            aria-label={watched ? "Remove token from Watchlist" : "Add token to Watchlist"}
          >
            <Star className={cn("h-3.5 w-3.5", watched && "fill-warn")} />
          </button>
          <Button size="icon-sm" variant="ghost" onClick={onRefresh} aria-label="Refresh token data" disabled={refreshing}>
            {refreshing ? <Spinner /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PriceTag({ priceUsd, currency }: { priceUsd: number | null; currency: string }) {
  if (priceUsd == null) return <>—</>;
  if (currency === "USD") {
    const abs = Math.abs(priceUsd);
    if (abs >= 1) return <>${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</>;
    return <>${priceUsd.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "")}</>;
  }
  return <>${priceUsd.toPrecision(5)}</>;
}
