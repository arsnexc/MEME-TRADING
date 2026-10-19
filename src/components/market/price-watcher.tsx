"use client";

import { useEffect, useMemo, useRef } from "react";
import { fetchTokenClient } from "@/lib/market-data/client";
import type { PriceTick } from "@/lib/trading/types";
import { selectOpenOrderTokens, useMarketStore } from "@/stores/market";
import { usePaperStore } from "@/stores/paper-trading";
import { useHydrated } from "@/stores/hydration";
import { toast } from "@/stores/toast";

const POLL_INTERVAL_MS = 25_000;

/**
 * Background limit-order watcher.
 *
 * While limit orders are open, this polls the selected tokens (max 5) through
 * the same market-data pipeline as the terminal and feeds fresh prices to the
 * paper engine. Orders only execute on fresh provider prices — never on stale
 * snapshots or synthetic data.
 */
export function PriceWatcher() {
  const hydrated = useHydrated();
  const orders = usePaperStore((state) => state.orders);
  const tokens = useMemo(() => selectOpenOrderTokens({ orders }), [orders]);
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
    const controllers = new Set<AbortController>();

    const run = async () => {
      if (cancelled || running || document.hidden) return schedule();
      running = true;
      const list = tokensRef.current;
      try {
        for (const token of list) {
          if (cancelled) break;
          const controller = new AbortController();
          controllers.add(controller);
          try {
            const result = await fetchTokenClient({
              network: token.network,
              pool: token.pool,
              token: token.address,
              signal: controller.signal,
            });
            if (cancelled) break;
            const { data } = result;
            setQuotePrices(data.quotePrices);
            updateSnapshots([data.market]);
            const quotePrice = data.quotePrices[data.market.quote]?.usd;
            if (!data.market.priceUsd || !quotePrice) continue;
            const tick: PriceTick = {
              network: data.market.network,
              address: data.market.tokenAddress,
              pool: data.market.pool,
              priceUsd: data.market.priceUsd,
              quoteUsd: quotePrice,
              at: Date.now(),
            };
            const outcome = processTicks([tick]);
            for (const trade of outcome.fills) {
              toast({
                title: `Limit ${trade.side} filled · ${trade.token.symbol}`,
                description: `${trade.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${trade.token.symbol} at ${trade.priceQuote.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${trade.quote}`,
                variant: "success",
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
            // Individual token failures are surfaced by the terminal; the watcher retries next cycle.
          } finally {
            controllers.delete(controller);
          }
        }
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
      for (const controller of controllers) controller.abort();
    };
  }, [hydrated, key, processTicks, setQuotePrices, updateSnapshots]);

  return null;
}
