import {
  fetchMarkets,
  fetchOhlcv,
  fetchQuotePrices,
  fetchSearch,
  fetchTokenDetail,
  fetchTrades,
  type TokenQuery,
} from "./service";
import { UpstreamError } from "./types";
import type {
  MarketsResponse,
  OhlcvResponse,
  SearchResponse,
  TradesResponse,
  TokenDetailResponse,
} from "./types";
import type { ChartTimeframe, NetworkId } from "@/lib/constants";

export type Transport = "proxy" | "direct";

export interface Fetched<T> {
  data: T;
  transport: Transport;
  receivedAt: number;
}

class ProxyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProxyError";
    this.status = status;
  }
}

/**
 * The server proxy protects upstream APIs and lets Vercel cache responses.
 * If the proxy is unreachable (local sandbox without egress, cold-start outage,
 * upstream block) the browser falls back to the same public, keyless providers
 * directly. No credentials are involved and the fallback is labelled in the UI.
 */
let preferDirectUntil = 0;

function shouldFallback(error: unknown): boolean {
  if (error instanceof ProxyError) return [0, 429, 500, 502, 503, 504].includes(error.status);
  return error instanceof TypeError;
}

async function proxyJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      let message = `Proxy request failed (HTTP ${response.status}).`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // Ignore non-JSON error bodies.
      }
      throw new ProxyError(message, response.status);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function withFallback<T>(
  path: string,
  direct: () => Promise<T>,
  signal?: AbortSignal,
): Promise<Fetched<T>> {
  const now = Date.now();
  if (now >= preferDirectUntil) {
    try {
      const data = await proxyJson<T>(path, signal);
      return { data, transport: "proxy", receivedAt: Date.now() };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!shouldFallback(error)) throw error;
      preferDirectUntil = Date.now() + 60_000;
    }
  }
  try {
    const data = await direct();
    return { data, transport: "direct", receivedAt: Date.now() };
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(
      "network",
      "Market data could not be loaded from the proxy or the provider. Check connectivity and retry.",
      { provider: "browser" },
    );
  }
}

export function fetchMarketsClient(params: {
  tab: string;
  networks?: NetworkId[];
  signal?: AbortSignal;
}): Promise<Fetched<MarketsResponse>> {
  const search = new URLSearchParams({ tab: params.tab });
  if (params.networks?.length) search.set("networks", params.networks.join(","));
  return withFallback(
    `/api/markets?${search.toString()}`,
    () => fetchMarkets({ tab: params.tab, networks: params.networks }),
    params.signal,
  );
}

export function fetchTokenClient(query: TokenQuery & { signal?: AbortSignal }): Promise<Fetched<TokenDetailResponse>> {
  const search = new URLSearchParams({ network: query.network, pool: query.pool });
  if (query.token) search.set("token", query.token);
  return withFallback(
    `/api/token?${search.toString()}`,
    () => fetchTokenDetail({ network: query.network, pool: query.pool, token: query.token }),
    query.signal,
  );
}

export function fetchOhlcvClient(params: {
  network: NetworkId;
  pool: string;
  timeframe: ChartTimeframe;
  signal?: AbortSignal;
}): Promise<Fetched<OhlcvResponse>> {
  const search = new URLSearchParams({ network: params.network, pool: params.pool, timeframe: params.timeframe });
  return withFallback(
    `/api/ohlcv?${search.toString()}`,
    () => fetchOhlcv({ network: params.network, pool: params.pool, timeframe: params.timeframe }),
    params.signal,
  );
}

export function fetchTradesClient(params: {
  network: NetworkId;
  pool: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Fetched<TradesResponse>> {
  const search = new URLSearchParams({ network: params.network, pool: params.pool, limit: String(params.limit ?? 100) });
  return withFallback(
    `/api/trades?${search.toString()}`,
    () => fetchTrades({ network: params.network, pool: params.pool, limit: params.limit }),
    params.signal,
  );
}

export function fetchSearchClient(params: {
  query: string;
  signal?: AbortSignal;
}): Promise<Fetched<SearchResponse>> {
  const search = new URLSearchParams({ q: params.query });
  return withFallback(
    `/api/search?${search.toString()}`,
    () => fetchSearch(params.query),
    params.signal,
  );
}

export function fetchQuotePricesClient(
  signal?: AbortSignal,
): Promise<Fetched<Awaited<ReturnType<typeof fetchQuotePrices>>>> {
  return withFallback("/api/quote-prices", () => fetchQuotePrices(), signal);
}

export function resetTransportPreference() {
  preferDirectUntil = 0;
}
