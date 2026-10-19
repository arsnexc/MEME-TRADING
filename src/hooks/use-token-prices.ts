"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTokenClient } from "@/lib/market-data/client";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import type { TokenRef } from "@/lib/trading/types";
import { useMarketStore } from "@/stores/market";

export interface TrackedPrice {
  priceUsd: number | null;
  quoteUsd: number | null;
  at: number | null;
  error: string | null;
}

export interface TrackedPricesState {
  prices: Record<string, TrackedPrice>;
  quotePrices: QuotePrices | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const EMPTY: TrackedPricesState = {
  prices: {},
  quotePrices: null,
  loading: true,
  error: null,
  lastUpdated: null,
};

export function trackedKey(token: Pick<TokenRef, "network" | "address">): string {
  return `${token.network}:${token.address.toLowerCase()}`;
}

/**
 * Polls pool detail for a small set of held/starred tokens so the portfolio and
 * trackers can show provider prices. Requests never overlap and stop while the
 * tab is hidden. Failures keep the previous price and are surfaced explicitly.
 */
export function useTokenPrices(tokens: TokenRef[], intervalMs = 30_000): TrackedPricesState {
  const [state, setState] = useState<TrackedPricesState>(EMPTY);
  const upsertTokens = useMarketStore((store) => store.upsertTokens);
  const setQuotePrices = useMarketStore((store) => store.setQuotePrices);

  const key = useMemo(
    () =>
      tokens
        .map((token) => `${token.network}:${token.pool}:${token.address}`)
        .sort()
        .join("|"),
    [tokens],
  );
  const tokensRef = useRef<TokenRef[]>(tokens);
  tokensRef.current = tokens;

  useEffect(() => {
    const list = tokensRef.current;
    if (!key || list.length === 0) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let hasData = false;
    const controllers = new Set<AbortController>();

    const run = async () => {
      if (cancelled || running) return;
      if (typeof document !== "undefined" && document.hidden) return schedule();
      running = true;
      const controller = new AbortController();
      controllers.add(controller);
      const results = await Promise.allSettled(
        list.map((token) =>
          fetchTokenClient({
            network: token.network,
            pool: token.pool,
            token: token.address,
            signal: controller.signal,
          }),
        ),
      );
      controllers.delete(controller);
      if (cancelled) return;
      running = false;

      let lastUpdated: number | null = null;
      let latestQuote: QuotePrices | null = null;
      let firstError: string | null = null;
      const fresh: Record<string, TrackedPrice> = {};
      const updatedMarkets: MarketToken[] = [];

      results.forEach((result, index) => {
        const token = list[index];
        const id = trackedKey(token);
        if (result.status === "fulfilled") {
          const detail = result.value.data;
          hasData = true;
          fresh[id] = {
            priceUsd: detail.market.priceUsd,
            quoteUsd: detail.quotePrices[detail.market.quote]?.usd ?? null,
            at: result.value.receivedAt,
            error: null,
          };
          updatedMarkets.push(detail.market);
          latestQuote = detail.quotePrices;
          lastUpdated = Math.max(lastUpdated ?? 0, result.value.receivedAt);
        } else {
          const message =
            result.reason instanceof Error ? result.reason.message : "Price refresh failed for this token.";
          fresh[id] = { priceUsd: null, quoteUsd: null, at: null, error: message };
          if (!firstError) firstError = message;
        }
      });

      if (updatedMarkets.length > 0) {
        upsertTokens(updatedMarkets);
        if (latestQuote) setQuotePrices(latestQuote);
      }

      setState((prev) => {
        const prices = { ...prev.prices };
        for (const [id, price] of Object.entries(fresh)) {
          if (price.error) {
            prices[id] = { ...(prices[id] ?? { priceUsd: null, quoteUsd: null, at: null }), error: price.error };
          } else {
            prices[id] = price;
          }
        }
        return {
          prices,
          quotePrices: latestQuote ?? prev.quotePrices,
          loading: false,
          error: firstError ?? (hasData ? null : "No provider prices could be loaded."),
          lastUpdated: lastUpdated ?? prev.lastUpdated,
        };
      });
      schedule();
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), intervalMs);
    };

    void run();

    const onVisibility = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const controller of controllers) controller.abort();
    };
  }, [key, intervalMs, setQuotePrices, upsertTokens]);

  return state;
}
