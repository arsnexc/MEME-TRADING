"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchQuotesClient } from "@/lib/market-data/client";
import type { QuoteRefInput } from "@/lib/market-data/service";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import type { NetworkId } from "@/lib/constants";
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

/** GeckoTerminal's multi-pool endpoint accepts at most 30 addresses. */
const POOLS_PER_REQUEST = 30;

export function trackedKey(token: Pick<TokenRef, "network" | "address">): string {
  return `${token.network}:${token.address.toLowerCase()}`;
}

/**
 * Split refs into per-network batches of 30 so a large portfolio costs one
 * upstream request per 30 positions instead of one per position.
 */
function chunkRefs(tokens: TokenRef[]): { refs: QuoteRefInput[]; tokens: TokenRef[] }[] {
  const byNetwork = new Map<NetworkId, TokenRef[]>();
  for (const token of tokens) {
    const list = byNetwork.get(token.network) ?? [];
    if (!list.some((entry) => entry.pool === token.pool)) list.push(token);
    byNetwork.set(token.network, list);
  }
  const chunks: { refs: QuoteRefInput[]; tokens: TokenRef[] }[] = [];
  for (const [network, list] of byNetwork) {
    for (let i = 0; i < list.length; i += POOLS_PER_REQUEST) {
      const slice = list.slice(i, i + POOLS_PER_REQUEST);
      chunks.push({ refs: slice.map((token) => ({ network, pool: token.pool })), tokens: slice });
    }
  }
  return chunks;
}

/**
 * Polls prices for a set of held/starred tokens using the batched quotes
 * endpoint. Requests never overlap and stop while the tab is hidden. Failures
 * keep the previous price and are surfaced explicitly.
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
    let failures = 0;
    let delayForNext = intervalMs;
    const controllers = new Set<AbortController>();

    const run = async () => {
      if (cancelled || running) return;
      if (typeof document !== "undefined" && document.hidden) return schedule();
      running = true;
      const controller = new AbortController();
      controllers.add(controller);
      const chunks = chunkRefs(list);
      const results = await Promise.allSettled(
        chunks.map((chunk) => fetchQuotesClient({ refs: chunk.refs, signal: controller.signal })),
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
        const chunk = chunks[index];
        if (result.status === "fulfilled") {
          hasData = true;
          const { tokens: quotes, quotePrices } = result.value.data;
          latestQuote = quotePrices;
          lastUpdated = Math.max(lastUpdated ?? 0, result.value.receivedAt);
          const byToken = new Map(
            quotes.map((token) => [trackedKey({ network: token.network, address: token.tokenAddress }), token]),
          );
          for (const token of chunk.tokens) {
            const id = trackedKey(token);
            const quote = byToken.get(id);
            if (!quote) {
              fresh[id] = {
                priceUsd: null,
                quoteUsd: null,
                at: null,
                error: "The provider returned no price for this pool.",
              };
              if (!firstError) firstError = fresh[id].error;
              continue;
            }
            fresh[id] = {
              priceUsd: quote.priceUsd,
              quoteUsd: quotePrices[quote.quote]?.usd ?? null,
              at: result.value.receivedAt,
              error: null,
            };
            updatedMarkets.push(quote);
          }
        } else {
          const message =
            result.reason instanceof Error ? result.reason.message : "Price refresh failed for this token.";
          for (const token of chunk.tokens) {
            fresh[trackedKey(token)] = { priceUsd: null, quoteUsd: null, at: null, error: message };
          }
          if (!firstError) firstError = message;
        }
      });

      if (updatedMarkets.length > 0) {
        upsertTokens(updatedMarkets);
        if (latestQuote) setQuotePrices(latestQuote);
      }

      failures = updatedMarkets.length > 0 ? 0 : failures + 1;
      const retryAfter = results.find((result) => result.status === "rejected");
      const suggested =
        retryAfter && retryAfter.status === "rejected" && typeof retryAfter.reason === "object" && retryAfter.reason
          ? (retryAfter.reason as { retryAfterMs?: unknown }).retryAfterMs
          : null;
      const backoff =
        typeof suggested === "number" && Number.isFinite(suggested) && suggested > 0
          ? suggested
          : firstError
            ? intervalMs * 2 ** Math.min(failures, 3)
            : intervalMs;
      delayForNext = Math.min(Math.max(backoff, intervalMs), 180_000);

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
      timer = setTimeout(() => void run(), delayForNext);
    };

    void run();

    const onVisibility = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        delayForNext = intervalMs;
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
