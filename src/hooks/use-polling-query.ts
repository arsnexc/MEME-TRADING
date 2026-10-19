"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetched, Transport } from "@/lib/market-data/client";

export interface PollingQueryState<T> {
  data: T | null;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  errorStatus: number | null;
  lastUpdated: number | null;
  transport: Transport | null;
  stale: boolean;
}

export interface PollingQueryOptions {
  intervalMs?: number;
  enabled?: boolean;
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
  const { intervalMs = 20_000, enabled = true } = options;
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
    });

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
        setState({
          data: result.data,
          loading: false,
          fetching: false,
          error: null,
          errorStatus: null,
          lastUpdated: result.receivedAt,
          transport: result.transport,
          stale: false,
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        const status =
          typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
            ? (error as { status: number }).status
            : null;
        const message = error instanceof Error ? error.message : "Market data request failed.";
        setState((prev) => ({
          ...prev,
          loading: false,
          fetching: false,
          error: message,
          errorStatus: status,
          stale: hasDataForKey,
        }));
      } finally {
        running.current = false;
        if (!cancelled) schedule(intervalMs);
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
  }, [key, enabled, intervalMs]);

  const refresh = useCallback(() => {
    triggerRef.current?.(true);
  }, []);

  return { ...state, refresh };
}
