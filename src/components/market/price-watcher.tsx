"use client";

import { useEffect, useMemo, useRef } from "react";
import { fetchQuotesClient } from "@/lib/market-data/client";
import type { PriceTick } from "@/lib/trading/types";
import { selectWatchedTokens, useMarketStore } from "@/stores/market";
import { usePaperStore } from "@/stores/paper-trading";
import { useHydrated } from "@/stores/hydration";
import { toast } from "@/stores/toast";

const POLL_INTERVAL_MS = 25_000;

/**
 * Background price watcher.
 *
 * Polls tokens that have work pending: resting limit orders and positions with a
 * take-profit or stop-loss level (max 8 tokens). Prices are fetched through the
 * batched quotes endpoint — one upstream request per network for every watched
 * token — and fed to the paper engine, so triggers only fire on fresh provider
 * data and never on stale snapshots or synthetic candles.
 */
export function PriceWatcher() {
  const hydrated = useHydrated();
  const orders = usePaperStore((state) => state.orders);
  const positions = usePaperStore((state) => state.positions);
  const tokens = useMemo(() => selectWatchedTokens({ orders, positions }), [orders, positions]);
  const key = tokens.map((t) => `${t.network}:${t.pool}`).join("|");
  const processTicks = usePaperStore((state) => state.processTicks);
  const updateSnapshots = useMarketStore((state) => state.upsertTokens);
  const setQuotePrices = useMarketStore((state) => state.setQuotePrices);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  useEffect(() => {
    if (!hydrated || tokensRef.current.length === 0) return;
    if (typeof document === "undefined") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let controller: AbortController | null = null;

    const run = async () => {
      if (cancelled || running) return schedule();
      if (document.hidden) return schedule();
      running = true;
      const list = tokensRef.current;
      controller = new AbortController();
      try {
        const result = await fetchQuotesClient({
          refs: list.map((token) => ({ network: token.network, pool: token.pool })),
          signal: controller.signal,
        });
        if (cancelled) return;

        const { tokens: quotes, quotePrices } = result.data;
        setQuotePrices(quotePrices);
        if (quotes.length > 0) updateSnapshots(quotes);

        const byPool = new Map(quotes.map((quote) => [`${quote.network}:${quote.pool}`, quote]));
        const ticks: PriceTick[] = [];
        for (const watch of list) {
          const quote = byPool.get(`${watch.network}:${watch.pool}`);
          if (!quote?.priceUsd) continue;
          const quoteUsd = quotePrices[quote.quote]?.usd;
          if (!quoteUsd) continue;
          ticks.push({
            network: quote.network,
            address: quote.tokenAddress,
            pool: quote.pool,
            priceUsd: quote.priceUsd,
            quoteUsd,
            at: result.receivedAt,
          });
        }

        const outcome = processTicks(ticks);
        for (const trade of outcome.fills) {
          const automatic =
            trade.trigger === "take-profit" ? "Take profit" : trade.trigger === "stop-loss" ? "Stop loss" : null;
          toast({
            title: automatic
              ? `${automatic} triggered · ${trade.token.symbol}`
              : `Limit ${trade.side} filled · ${trade.token.symbol}`,
            description: `Sold ${trade.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${trade.token.symbol} at ${trade.priceQuote.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${trade.quote}${trade.realizedPnl == null ? "" : ` · realized ${trade.realizedPnl.toFixed(5)} ${trade.quote}`}`,
            variant: automatic === "Stop loss" ? "error" : "success",
          });
        }
        for (const failure of outcome.failures) {
          toast({
            title: `Limit order failed · ${failure.token.symbol}`,
            description: failure.failureReason ?? "The order could not be executed.",
            variant: "error",
          });
        }
      } catch {
        // Provider failures are surfaced by the terminal and portfolio; the
        // watcher simply retries next cycle.
      } finally {
        running = false;
        schedule();
      }
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void run();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    const initial = setTimeout(() => void run(), 4_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisibility);
      controller?.abort();
    };
  }, [hydrated, key, processTicks, setQuotePrices, updateSnapshots]);

  return null;
}
