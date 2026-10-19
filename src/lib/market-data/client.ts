import {
  fetchMarkets,
  fetchOhlcv,
  fetchQuotePrices,
  fetchSearch,
  fetchTokenDetail,
  fetchTokenQuotes,
  fetchTrades,
  type QuoteRefInput,
  type TokenQuery,
} from "./service";
import { UpstreamError } from "./types";
import type {
  MarketsResponse,
  OhlcvResponse,
  QuotesResponse,
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
  retryAfterMs: number | null;
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "ProxyError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
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

/** A 429 is transient: it should not pin the whole app to the direct transport. */
function isRateLimited(error: unknown): boolean {
  if (error instanceof ProxyError) return error.status === 429;
  if (error instanceof UpstreamError) return error.status === 429;
  return false;
}

function retryAfterOf(error: unknown): number | null {
  if (error instanceof ProxyError || error instanceof UpstreamError) return error.retryAfterMs;
  return null;
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
      let retryAfterMs: number | null = null;
      try {
        const body = (await response.json()) as {
          error?: { message?: string; retryAfterMs?: number | null };
        };
        if (body?.error?.message) message = body.error.message;
        if (typeof body?.error?.retryAfterMs === "number") retryAfterMs = body.error.retryAfterMs;
      } catch {
        // Ignore non-JSON error bodies.
      }
      if (retryAfterMs == null) {
        const header = Number(response.headers.get("retry-after"));
        if (Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;
      }
      throw new ProxyError(message, response.status, retryAfterMs);
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
  let proxyFailure: unknown = null;
  if (now >= preferDirectUntil) {
    try {
      const data = await proxyJson<T>(path, signal);
      return { data, transport: "proxy", receivedAt: Date.now() };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!shouldFallback(error)) throw error;
      proxyFailure = error;
      // Back off the proxy for infrastructure failures, but keep retrying it on
      // rate limits so one hot minute does not pin the session to the provider.
      if (!isRateLimited(error)) preferDirectUntil = Date.now() + 20_000;
    }
  }
  try {
    const data = await direct();
    return { data, transport: "direct", receivedAt: Date.now() };
  } catch (error) {
    // Surface the most actionable failure. An upstream 429 carries the real
    // Retry-After, which the server-side limiter can only estimate.
    if (error instanceof UpstreamError) {
      if (error.retryAfterMs == null && retryAfterOf(proxyFailure) != null) throw proxyFailure;
      throw error;
    }
    if (proxyFailure instanceof ProxyError) throw proxyFailure;
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

/**
 * Batched price refresh. One request per (up to) 30 pools on a network instead of
 * one request per token — this is what keeps portfolio/tracker polling inside
 * the GeckoTerminal budget.
 */
export function fetchQuotesClient(params: {
  refs: QuoteRefInput[];
  signal?: AbortSignal;
}): Promise<Fetched<QuotesResponse>> {
  const search = new URLSearchParams({
    pools: params.refs.map((ref) => `${ref.network}:${ref.pool}`).join(","),
  });
  return withFallback(
    `/api/quotes?${search.toString()}`,
    () => fetchTokenQuotes(params.refs),
    params.signal,
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
