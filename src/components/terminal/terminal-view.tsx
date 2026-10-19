"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RetryCountdown } from "@/components/ui/retry-countdown";
import { TokenHeader } from "./token-header";
import { ChartPanel } from "./chart-panel";
import { BottomPanel } from "./bottom-panel";
import { ExecutionPanel } from "./execution-panel";
import type { PositionPrice } from "./positions-table";
import { fetchOhlcvClient, fetchTokenClient, fetchTradesClient } from "@/lib/market-data/client";
import type { MarketToken, QuotePrices, TokenDetailResponse } from "@/lib/market-data/types";
import type { ChartTimeframe, DisplayCurrency, NetworkId } from "@/lib/constants";
import type { Position, TokenRef } from "@/lib/trading/types";
import { formatRelativeTime } from "@/lib/formatting";
import { useNow } from "@/hooks/use-now";
import { usePollingQuery } from "@/hooks/use-polling-query";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { usePaperStore } from "@/stores/paper-trading";
import { usePreferencesStore } from "@/stores/preferences";
import { toast } from "@/stores/toast";

const EMPTY_PRICES: QuotePrices = { SOL: null, ETH: null, fetchedAt: 0 };

export function TerminalView({
  network,
  pool,
  tokenAddress,
}: {
  network: NetworkId;
  pool: string;
  tokenAddress?: string;
}) {
  const now = useNow(10_000);
  const hydrated = useHydrated();
  const currency = usePreferencesStore((state) => state.displayCurrency) as DisplayCurrency;
  const snapshots = useMarketStore((state) => state.snapshots);
  const storeQuotePrices = useMarketStore((state) => state.quotePrices);
  const upsertTokens = useMarketStore((state) => state.upsertTokens);
  const setQuotePrices = useMarketStore((state) => state.setQuotePrices);

  const positions = usePaperStore((state) => state.positions);
  const orders = usePaperStore((state) => state.orders);
  const trades = usePaperStore((state) => state.trades);
  const feeRateBps = usePaperStore((state) => state.feeRateBps);
  const processTicks = usePaperStore((state) => state.processTicks);

  const [timeframe, setTimeframe] = useState<ChartTimeframe>("5m");

  const marketFetcher = useCallback(
    (signal: AbortSignal) => fetchTokenClient({ network, pool, token: tokenAddress, signal }),
    [network, pool, tokenAddress],
  );
  const marketQuery = usePollingQuery<TokenDetailResponse>(`token:${network}:${pool}:${tokenAddress}`, marketFetcher, {
    // Pool detail is the most expensive GeckoTerminal call on this page; the
    // chart already provides sub-minute price updates.
    intervalMs: 30_000,
  });

  const chartFetcher = useCallback(
    (signal: AbortSignal) => fetchOhlcvClient({ network, pool, timeframe, signal }),
    [network, pool, timeframe],
  );
  const chartQuery = usePollingQuery(`ohlcv:${network}:${pool}:${timeframe}`, chartFetcher, {
    intervalMs: 20_000,
  });

  const tradesFetcher = useCallback(
    (signal: AbortSignal) => fetchTradesClient({ network, pool, limit: 120, signal }),
    [network, pool],
  );
  const tradesQuery = usePollingQuery(`trades:${network}:${pool}`, tradesFetcher, {
    intervalMs: 30_000,
  });

  const detail = marketQuery.data;
  const market: MarketToken | null = detail?.market ?? snapshots[`${network}:${tokenAddress ?? ""}`] ?? null;
  const activeAddress = market?.tokenAddress ?? tokenAddress ?? "";
  const quotePrices = detail?.quotePrices ?? storeQuotePrices ?? EMPTY_PRICES;

  useEffect(() => {
    if (!detail) return;
    upsertTokens([detail.market]);
    setQuotePrices(detail.quotePrices);
    const quoteUsd = detail.quotePrices[detail.market.quote]?.usd;
    if (detail.market.priceUsd && quoteUsd && detail.fetchedAt) {
      processTicks([
        {
          network: detail.market.network,
          address: detail.market.tokenAddress,
          pool: detail.market.pool,
          priceUsd: detail.market.priceUsd,
          quoteUsd,
          at: detail.fetchedAt,
        },
      ]);
    }
  }, [detail, processTicks, setQuotePrices, upsertTokens]);

  const paperTrades = useMemo(
    () => trades.filter((trade) => trade.token.network === network && trade.token.address === activeAddress),
    [trades, network, activeAddress],
  );

  const token: TokenRef | null = useMemo(() => {
    if (!market) return null;
    return {
      network,
      pool,
      address: activeAddress,
      symbol: market.symbol,
      name: market.name,
      imageUrl: market.imageUrl,
    };
  }, [activeAddress, market, network, pool]);

  const priceFor = useCallback(
    (position: Position): PositionPrice => {
      const isCurrent =
        position.token.network === network &&
        position.token.address.toLowerCase() === activeAddress.toLowerCase();
      const quoteUsd = quotePrices[position.quote]?.usd ?? null;

      if (isCurrent && detail?.market.priceUsd && quoteUsd && marketQuery.lastUpdated) {
        const fresh = now - marketQuery.lastUpdated < 60_000;
        if (fresh) {
          return {
            priceUsd: detail.market.priceUsd,
            quoteUsd,
            source: "live",
            at: marketQuery.lastUpdated,
          };
        }
      }

      const snap = snapshots[`${position.token.network}:${position.token.address}`];
      const snapQuoteUsd = quotePrices[position.quote]?.usd ?? null;
      if (snap?.priceUsd && snapQuoteUsd && now - snap.updatedAt < 300_000) {
        return { priceUsd: snap.priceUsd, quoteUsd: snapQuoteUsd, source: "snapshot", at: snap.updatedAt };
      }

      return { priceUsd: null, quoteUsd, source: "last-seen", at: position.lastPriceAt };
    },
    [activeAddress, detail, marketQuery.lastUpdated, network, now, quotePrices, snapshots],
  );

  const handleSell = useCallback(
    async (position: Position, fraction: number) => {
      const price = priceFor(position);
      if (price.source === "last-seen" || !price.priceUsd || !price.quoteUsd) {
        toast({
          title: "Sell blocked — stale price",
          description: "Open this token's terminal and wait for a fresh provider price before selling.",
          variant: "error",
        });
        return;
      }
      const result = usePaperStore.getState().sell({
        positionId: position.id,
        fraction,
        priceUsd: price.priceUsd,
        quoteUsd: price.quoteUsd,
      });
      if (!result.ok) {
        toast({ title: "Simulated sell rejected", description: result.error.message, variant: "error" });
        return;
      }
      toast({
        title: `Sold ${fraction === 1 ? "100" : fraction * 100}% · ${position.token.symbol}`,
        description: `Net proceeds ${result.value.trade.total.toFixed(5)} ${position.quote} · realized ${(result.value.trade.realizedPnl ?? 0).toFixed(5)} ${position.quote}`,
        variant: "success",
      });
    },
    [priceFor],
  );

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const result = usePaperStore.getState().cancelLimit(orderId);
    if (!result.ok) {
      toast({ title: "Could not cancel order", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Paper limit order cancelled", variant: "info" });
  }, []);

  const refreshAll = useCallback(() => {
    marketQuery.refresh();
    chartQuery.refresh();
    tradesQuery.refresh();
  }, [marketQuery, chartQuery, tradesQuery]);

  const warnings = detail?.warnings ?? [];
  const lastUpdated = marketQuery.lastUpdated;
  const stale =
    Boolean(detail?.stale) ||
    Boolean(marketQuery.error && market) ||
    (lastUpdated != null && now - lastUpdated > 60_000);

  if (!market) {
    if (marketQuery.loading) {
      return (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <Skeleton className="h-8 w-8" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-2.5 w-72" />
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-[minmax(0,1fr)_336px]">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={WifiOff}
          title="Token terminal unavailable"
          description={
            <>
              {marketQuery.error ?? "The selected pool could not be resolved."}
              <br />
              Network: {network} · Pool: {pool}
              <br />
              No placeholder prices or chart data are shown.
            </>
          }
          action={
            <div className="flex items-center gap-1.5">
              <Button variant="primary" size="sm" onClick={() => marketQuery.refresh()}>
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
              <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <ArrowLeft className="h-3 w-3" /> Back
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const tokenRef: TokenRef =
    token ?? {
      network,
      pool,
      address: activeAddress,
      symbol: market.symbol,
      name: market.name,
      imageUrl: market.imageUrl,
    };
  const marketTrades = tradesQuery.data?.trades ?? [];
  const chartCandles = chartQuery.data?.candles ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <TokenHeader
        market={market}
        dexName={detail?.dexName ?? null}
        quotePrices={quotePrices}
        lastUpdated={lastUpdated}
        stale={stale}
        loading={marketQuery.loading}
        transport={marketQuery.transport}
        refreshing={marketQuery.fetching}
        onRefresh={refreshAll}
        warningCount={warnings.length}
      />

      {warnings.length > 0 || (marketQuery.error && market) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/20 bg-warn/[0.04] px-3 py-1 text-2xs text-warn">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {marketQuery.error ? (
            <span>
              Live refresh failed: {marketQuery.error} Showing the last successful snapshot —{" "}
              <span className="text-muted">
                {lastUpdated ? formatRelativeTime(lastUpdated, now) : "unknown age"}
              </span>
              .{" "}
              <RetryCountdown at={marketQuery.nextRetryAt} />
            </span>
          ) : null}
          {warnings.map((warning) => (
            <span key={warning} className="text-muted">
              {warning}
            </span>
          ))}
          <Button size="xs" variant="outline" onClick={refreshAll} className="ml-auto">
            <RefreshCw className="h-2.5 w-2.5" /> Refresh
          </Button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <ChartPanel
            symbol={market.symbol}
            network={network}
            pool={pool}
            candles={chartCandles}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            loading={chartQuery.loading}
            fetching={chartQuery.fetching}
            error={chartQuery.error}
            onRetry={() => chartQuery.refresh()}
            quotePrices={quotePrices}
            currency={currency}
            paperTrades={paperTrades}
            lastUpdated={chartQuery.lastUpdated}
            stale={Boolean(chartQuery.error && chartCandles.length > 0)}
            livePrice={market?.priceUsd ?? null}
            livePriceAt={marketQuery.lastUpdated}
          />
        </div>

        <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:sticky xl:top-11 xl:max-h-[calc(100dvh-44px)] xl:overflow-y-auto xl:border-l xl:border-border panel-scroll">
          <ExecutionPanel
            token={tokenRef}
            market={market}
            quotePrices={quotePrices}
            priceLastUpdated={lastUpdated}
            paperPositions={positions}
            hasTradeWindow={Boolean(tradesQuery.lastUpdated && !tradesQuery.error)}
            trades={marketTrades}
            onRefreshPrice={() => marketQuery.refresh()}
          />
        </div>

        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
          <BottomPanel
            token={tokenRef}
            network={network}
            trades={marketTrades}
            tradesLoading={tradesQuery.loading}
            tradesError={tradesQuery.error}
            onRetryTrades={() => tradesQuery.refresh()}
            tradesWindow={tradesQuery.data?.window ?? null}
            positions={positions}
            priceFor={priceFor}
            feeRateBps={feeRateBps}
            hydrated={hydrated}
            orders={orders}
            onSell={handleSell}
            onCancelOrder={handleCancelOrder}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-panel/40 px-3 py-1 text-2xs text-faint">
        <Badge tone="warn">SIMULATION</Badge>
        <span>
          {market.symbol} on {market.network} · {market.quote} paper account · all fills are local and reversible
          only by resetting the account.
        </span>
        <Link href="/" className="ml-auto text-muted hover:text-fg">
          ← Back to discovery
        </Link>
      </div>
    </div>
  );
}
