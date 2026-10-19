"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetched, Transport } from "@/lib/market-data/client";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot-cache";

/** Upper bound for provider-driven backoff so a tab always recovers eventually. */
const MAX_RETRY_DELAY_MS = 180_000;

function retryAfterOf(error: unknown): number | null {
  if (typeof error !== "object" || error == null || !("retryAfterMs" in error)) return null;
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export interface PollingQueryState<T> {
  data: T | null;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  errorStatus: number | null;
  lastUpdated: number | null;
  transport: Transport | null;
  stale: boolean;
  /** Epoch ms of the next scheduled attempt after a failure (null when healthy). */
  nextRetryAt: number | null;
  /** Consecutive failures; drives the rate-limit backoff. */
  retryAttempt: number;
}

export interface PollingQueryOptions {
  intervalMs?: number;
  enabled?: boolean;
  /**
   * Keep the last successful payload in `sessionStorage` so a revisit during a
   * rate-limit window can paint it (labelled as a snapshot) instead of an error.
   * Off by default: only list pages opt in.
   */
  persist?: boolean;
}

/**
 * Polling query with:
 * - abort-on-key-change and unmount cleanup,
 * - no overlapping requests (timeout chained, not setInterval),
 * - pause while the tab is hidden,
 * - keeps last-good data on failure and exposes the error.
 */
export function usePollingQuery<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<Fetched<T>>,
  options: PollingQueryOptions = {},
) {
  const { intervalMs = 20_000, enabled = true, persist = false } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState<PollingQueryState<T>>({
    data: null,
    loading: enabled,
    fetching: false,
    error: null,
    errorStatus: null,
    lastUpdated: null,
    transport: null,
    stale: false,
    nextRetryAt: null,
    retryAttempt: 0,
  });

  const mounted = useRef(true);
  const running = useRef(false);
  const triggerRef = useRef<((manual?: boolean) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKey = useRef(key);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    currentKey.current = key;
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false, fetching: false, error: null, data: null }));
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    let hasDataForKey = false;

    setState({
      data: null,
      loading: true,
      fetching: true,
      error: null,
      errorStatus: null,
      lastUpdated: null,
      transport: null,
      stale: false,
      nextRetryAt: null,
      retryAttempt: 0,
    });

    // Paint a saved snapshot instantly. It is marked stale, and a successful
    // response replaces it on the first cycle.
    if (persist) {
      const snapshot = readSnapshot<T>(key);
      if (snapshot) {
        hasDataForKey = true;
        setState((prev) => ({
          ...prev,
          data: snapshot.data,
          loading: false,
          lastUpdated: snapshot.at,
          stale: true,
        }));
      }
    }

    let failures = 0;
    let delayForNext = intervalMs;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void cycle("poll"), delay);
    };

    const cycle = async (mode: "initial" | "poll" | "manual") => {
      if (cancelled) return;
      if (mode === "poll" && typeof document !== "undefined" && document.hidden) {
        schedule(intervalMs);
        return;
      }
      if (running.current) {
        schedule(intervalMs);
        return;
      }
      running.current = true;
      controller?.abort();
      controller = new AbortController();
      if (mounted.current) {
        setState((prev) => ({ ...prev, fetching: true, loading: mode === "initial" && !hasDataForKey }));
      }
      try {
        const result = await fetcherRef.current(controller.signal);
        if (cancelled) return;
        hasDataForKey = true;
        failures = 0;
        delayForNext = intervalMs;
        if (persist) writeSnapshot(key, result.data, result.receivedAt);
        setState({
          data: result.data,
          loading: false,
          fetching: false,
          error: null,
          errorStatus: null,
          lastUpdated: result.receivedAt,
          transport: result.transport,
          stale: false,
          nextRetryAt: null,
          retryAttempt: 0,
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        const status =
          typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
            ? (error as { status: number }).status
            : null;
        const message = error instanceof Error ? error.message : "Market data request failed.";
        failures += 1;
        // Honour the provider's Retry-After when present, otherwise back off
        // exponentially for rate limits and stay at the polling interval for
        // ordinary failures.
        const suggested = retryAfterOf(error);
        const backoff =
          suggested ?? (status === 429 ? intervalMs * 2 ** Math.min(failures, 4) : intervalMs);
        delayForNext = Math.min(Math.max(backoff, intervalMs), MAX_RETRY_DELAY_MS);
        const nextRetryAt = Date.now() + delayForNext;
        setState((prev) => ({
          ...prev,
          loading: false,
          fetching: false,
          error: message,
          errorStatus: status,
          stale: hasDataForKey,
          nextRetryAt,
          retryAttempt: failures,
        }));
      } finally {
        running.current = false;
        if (!cancelled) schedule(delayForNext);
      }
    };

    triggerRef.current = (manual?: boolean) => {
      if (manual) {
        if (timerRef.current) clearTimeout(timerRef.current);
        void cycle("manual");
      } else {
        void cycle("initial");
      }
    };

    void cycle("initial");

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (!document.hidden) {
        // Refresh immediately when the user returns to the tab.
        if (timerRef.current) clearTimeout(timerRef.current);
        void cycle("manual");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      controller?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      triggerRef.current = null;
    };
  }, [key, enabled, intervalMs, persist]);

  const refresh = useCallback(() => {
    triggerRef.current?.(true);
  }, []);

  return { ...state, refresh };
}
