"use client";

import { useEffect, useRef, useState } from "react";
import { fetchPoolPriceClient } from "@/lib/market-data/client";

export interface LivePriceState {
  priceUsd: number | null;
  /** Epoch ms of the latest successful tick. */
  at: number | null;
  error: string | null;
}

const EMPTY: LivePriceState = { priceUsd: null, at: null, error: null };

/** Never poll faster than this, even if a caller asks for it. */
const MIN_INTERVAL_MS = 2_000;
const MAX_BACKOFF_MS = 45_000;

function retryAfterOf(error: unknown): number | null {
  if (typeof error !== "object" || error == null || !("retryAfterMs" in error)) return null;
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Fast single-pool price for the chart.
 *
 * Polls one cheap DEX Screener pair endpoint every few seconds so the forming
 * candle and pending exits react between the slower full-market polls. Pauses
 * while the tab is hidden, never overlaps requests and backs off on errors.
 * A failure keeps the last tick and is surfaced instead of blanking the chart.
 */
export function useLivePrice(options: {
  network: "solana" | "eth" | "base";
  pool: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
}): LivePriceState {
  const { network, pool, enabled = true, intervalMs = 3_000 } = options;
  const [state, setState] = useState<LivePriceState>(EMPTY);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  useEffect(() => {
    if (!enabled || !pool) {
      setState(EMPTY);
      return;
    }

    const delay = Math.max(MIN_INTERVAL_MS, intervalMs);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let running = false;
    let failures = 0;
    let nextDelay = delay;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled || running) return;
      if (typeof document !== "undefined" && document.hidden) return schedule(delay);
      const target = poolRef.current;
      if (!target) return;
      running = true;
      controller = new AbortController();
      try {
        const result = await fetchPoolPriceClient({ network, pool: target, signal: controller.signal });
        if (cancelled) return;
        failures = 0;
        nextDelay = delay;
        setState({ priceUsd: result.data.priceUsd, at: result.receivedAt, error: null });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        failures += 1;
        const message = error instanceof Error ? error.message : "Live price unavailable.";
        const suggested = retryAfterOf(error);
        nextDelay = Math.min(
          Math.max(suggested ?? delay * 2 ** Math.min(failures, 4), delay),
          MAX_BACKOFF_MS,
        );
        // Keep the previous price: a stale tick is better than a frozen chart
        // pretending to be live.
        setState((prev) => ({ ...prev, error: message }));
      } finally {
        running = false;
        if (!cancelled) schedule(nextDelay);
      }
    };

    const onVisibility = () => {
      if (typeof document === "undefined" || document.hidden) return;
      failures = 0;
      nextDelay = delay;
      if (timer) clearTimeout(timer);
      void tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controller?.abort();
    };
  }, [enabled, intervalMs, network, pool]);

  return state;
}
