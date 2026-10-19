"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Flame, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenAvatar } from "@/components/token/token-avatar";
import { fetchMarketsClient } from "@/lib/market-data/client";
import type { MarketToken, MarketsResponse } from "@/lib/market-data/types";
import type { NetworkId } from "@/lib/constants";
import { usePollingQuery } from "@/hooks/use-polling-query";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { useNow } from "@/hooks/use-now";
import { formatPercent, formatRelativeTime, pnlClass } from "@/lib/formatting";
import { terminalHrefFor } from "@/lib/terminal-href";
import { cn } from "@/lib/utils";

type NetworkFilter = "all" | NetworkId;

const NETWORK_TABS: { value: NetworkFilter; label: string }[] = [
  { value: "all", label: "All chains" },
  { value: "solana", label: "Solana" },
  { value: "eth", label: "Ethereum" },
  { value: "base", label: "Base" },
];

export function PulseView() {
  const [network, setNetwork] = useState<NetworkFilter>("all");
  const now = useNow(15_000);
  const { formatMoney, formatPrice } = useDisplayCurrency();

  const networks = network === "all" ? undefined : [network];
  const fetcher = (signal: AbortSignal) => fetchMarketsClient({ tab: "trending", networks, signal });
  const trending = usePollingQuery<MarketsResponse>(`pulse:trending:${network}`, fetcher, { intervalMs: 30_000 });

  const radarFetcher = (signal: AbortSignal) => fetchMarketsClient({ tab: "radar", networks, signal });
  const radar = usePollingQuery<MarketsResponse>(`pulse:radar:${network}`, radarFetcher, { intervalMs: 40_000 });

  const tokens = useMemo(() => trending.data?.tokens ?? [], [trending.data]);
  const fresh = useMemo(() => radar.data?.tokens ?? [], [radar.data]);

  const stats = useMemo(() => {
    const volume = tokens.reduce((sum, token) => sum + (token.volumeUsd.h24 ?? 0), 0);
    const withChange = tokens.filter((token) => token.changePct.h24 != null);
    const gainers = withChange.filter((token) => (token.changePct.h24 ?? 0) > 0).length;
    const avgChange =
      withChange.length > 0
        ? withChange.reduce((sum, token) => sum + (token.changePct.h24 ?? 0), 0) / withChange.length
        : null;
    return { volume, gainers, total: tokens.length, avgChange };
  }, [tokens]);

  const leaders = useMemo(
    () =>
      [...tokens]
        .filter((token) => (token.volumeUsd.h24 ?? 0) > 0)
        .sort((a, b) => (b.volumeUsd.h24 ?? 0) - (a.volumeUsd.h24 ?? 0))
        .slice(0, 8),
    [tokens],
  );
  const movers = useMemo(
    () =>
      [...tokens]
        .filter((token) => token.changePct.h24 != null && (token.liquidityUsd ?? 0) >= 10_000)
        .sort((a, b) => (b.changePct.h24 ?? 0) - (a.changePct.h24 ?? 0))
        .slice(0, 8),
    [tokens],
  );
  const newest = useMemo(
    () =>
      [...fresh]
        .filter((token) => token.poolCreatedAt != null)
        .sort((a, b) => (b.poolCreatedAt ?? 0) - (a.poolCreatedAt ?? 0))
        .slice(0, 8),
    [fresh],
  );

  const error = trending.error ?? radar.error;
  const loading = trending.loading && tokens.length === 0;
  const lastUpdated = Math.max(trending.lastUpdated ?? 0, radar.lastUpdated ?? 0);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-fg">
            <Activity className="h-4 w-4 text-accent" /> Market pulse
          </h1>
          <p className="mt-0.5 text-2xs text-muted">
            Provider-snapshot view of trending pools, volume leaders and newly-created pools. No predictions, no
            synthetic prices.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-sm border border-border bg-panel p-0.5">
            {NETWORK_TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setNetwork(item.value)}
                aria-pressed={network === item.value}
                className={cn(
                  "h-6 rounded-[2px] px-2 text-2xs font-medium transition-colors",
                  network === item.value ? "bg-panel-3 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => { trending.refresh(); radar.refresh(); }} disabled={trending.fetching}>
            <RefreshCw className={cn("h-3 w-3", trending.fetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-warn/20 bg-warn/[0.04] px-3 py-1 text-2xs text-warn">
          {error} {lastUpdated ? `Last successful update ${formatRelativeTime(lastUpdated, now)}.` : "No cached data."}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
        <StatTile label="Pools in feed" value={loading ? "—" : String(stats.total)} icon={Flame} />
        <StatTile label="24h volume" value={loading ? "—" : formatMoney(stats.volume, { compact: true })} icon={Activity} />
        <StatTile
          label="Pools positive (24h)"
          value={loading ? "—" : `${stats.gainers}/${stats.total}`}
          icon={TrendingUp}
        />
        <StatTile
          label="Average 24h change"
          value={loading || stats.avgChange == null ? "—" : formatPercent(stats.avgChange, { sign: true })}
          icon={TrendingDown}
          tone={stats.avgChange != null && stats.avgChange < 0 ? "sell" : "buy"}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : tokens.length === 0 && fresh.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No market data available"
          description="The public providers returned no pools for this filter. This is an upstream condition, not an empty market — retry or switch chains."
          action={
            <Button size="sm" variant="primary" onClick={() => { trending.refresh(); radar.refresh(); }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 p-2">
          <Section title="Volume leaders" hint="Highest 24h volume in this feed" icon={Flame}>
            {leaders.length > 0 ? (
              leaders.map((token) => <PulseCard key={token.id} token={token} formatPrice={formatPrice} formatMoney={formatMoney} />)
            ) : (
              <p className="px-2 py-3 text-2xs text-faint">No pools with reported 24h volume.</p>
            )}
          </Section>

          <Section title="Top movers" hint="24h change · liquidity ≥ $10k" icon={Sparkles}>
            {movers.length > 0 ? (
              movers.map((token) => <PulseCard key={token.id} token={token} formatPrice={formatPrice} formatMoney={formatMoney} />)
            ) : (
              <p className="px-2 py-3 text-2xs text-faint">No pools pass the liquidity filter right now.</p>
            )}
          </Section>

          <Section title="Fresh pools" hint="Newest provider pools · not a recommendation" icon={Sparkles}>
            {newest.length > 0 ? (
              newest.map((token) => <PulseCard key={token.id} token={token} formatPrice={formatPrice} formatMoney={formatMoney} />)
            ) : (
              <p className="px-2 py-3 text-2xs text-faint">
                {radar.error ? "New-pool feed unavailable." : "No freshly-created pools in the current provider window."}
              </p>
            )}
          </Section>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-1.5 text-2xs text-faint">
        <span>Data: GeckoTerminal pool lists + DEX Screener metadata.</span>
        <span className="hidden sm:inline">Fresh pools can have unreliable liquidity and market-cap values.</span>
        {lastUpdated ? <span className="ml-auto">Updated {formatRelativeTime(lastUpdated, now)}</span> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint: string;
  icon: typeof Flame;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-end justify-between gap-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold text-fg">
          <Icon className="h-3 w-3 text-faint" /> {title}
        </h2>
        <span className="text-2xs text-faint">{hint}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Flame;
  tone?: "buy" | "sell";
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-border bg-panel px-2.5 py-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-panel-2 text-muted">
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-2xs uppercase tracking-wide text-faint">{label}</p>
        <p className={cn("num truncate text-sm font-medium", tone === "buy" && "text-buy", tone === "sell" && "text-sell", !tone && "text-fg")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function PulseCard({
  token,
  formatPrice,
  formatMoney,
}: {
  token: MarketToken;
  formatPrice: (value: number | null | undefined) => string;
  formatMoney: (value: number | null | undefined, opts?: { compact?: boolean }) => string;
}) {
  const change = token.changePct.h24;
  return (
    <Link
      href={terminalHrefFor({
        network: token.network,
        pool: token.pool,
        address: token.tokenAddress,
      })}
      className="group rounded-sm border border-border bg-panel p-2 transition-colors hover:border-border-strong hover:bg-panel-2"
    >
      <div className="flex items-center gap-1.5">
        <TokenAvatar src={token.imageUrl} symbol={token.symbol} size={20} />
        <span className="truncate text-xs font-medium text-fg">{token.symbol}</span>
        <NetworkBadge network={token.network} className="hidden sm:inline-flex" />
        <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-faint group-hover:text-fg" />
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <p className="num text-xs text-fg">{formatPrice(token.priceUsd)}</p>
          <p className="num text-2xs text-faint">24h vol {formatMoney(token.volumeUsd.h24, { compact: true })}</p>
        </div>
        <div className="text-right">
          <p className={cn("num text-xs", pnlClass(change))}>{change == null ? "—" : formatPercent(change, { sign: true })}</p>
          <p className="num text-2xs text-faint">
            {token.marketCapUsd != null
              ? `${token.marketCapIsFdv ? "FDV" : "MC"} ${formatMoney(token.marketCapUsd, { compact: true })}`
              : token.fdvUsd != null
                ? `FDV ${formatMoney(token.fdvUsd, { compact: true })}`
                : "MC —"}
          </p>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1 text-2xs text-faint">
        <Badge tone="ghost">{token.quote}</Badge>
        <span className="truncate">{token.dexId ?? "dex unknown"}</span>
        <span className="ml-auto shrink-0">liq {formatMoney(token.liquidityUsd, { compact: true })}</span>
      </div>
    </Link>
  );
}
