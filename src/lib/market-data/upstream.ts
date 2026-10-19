import { UpstreamError } from "./types";

const requestLog = new Map<string, number[]>();

const PROVIDER_LIMITS: Record<string, { max: number; windowMs: number }> = {
  geckoterminal: { max: 24, windowMs: 60_000 },
  dexscreener: { max: 220, windowMs: 60_000 },
};

/**
 * Conservative client-side limiter. The public GeckoTerminal API documents
 * 30 requests/minute; we cap at 24/min to leave headroom for shared egress IPs.
 * Cached responses do not consume tokens.
 */
function acquire(provider: string): void {
  const limit = PROVIDER_LIMITS[provider];
  if (!limit) return;
  const now = Date.now();
  const hits = (requestLog.get(provider) ?? []).filter((t) => now - t < limit.windowMs);
  if (hits.length >= limit.max) {
    throw new UpstreamError("rate_limited", `Local rate limit reached for ${provider}. Try again shortly.`, {
      provider,
      status: 429,
    });
  }
  hits.push(now);
  requestLog.set(provider, hits);
}

interface CacheEntry {
  value: unknown;
  fetchedAt: number;
  inflight?: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();

export interface CachedResult<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

interface CachedOptions {
  /** Hard cap on entries kept in the in-memory cache. */
  maxEntries?: number;
}

function prune(maxEntries: number) {
  if (cache.size <= maxEntries) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (const [key] of oldest.slice(0, cache.size - maxEntries)) {
    cache.delete(key);
  }
}

export function clearMarketCache() {
  cache.clear();
  requestLog.clear();
}

/**
 * Request a JSON document with timeout + provider rate limiting.
 */
export async function getJson<T>(
  url: string,
  opts: { provider: "geckoterminal" | "dexscreener"; timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  acquire(opts.provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Keep this a CORS-simple request: the browser transport calls the public
        // APIs directly when the server proxy is unavailable.
        Accept: "application/json",
        ...(opts.headers ?? {}),
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      throw new UpstreamError("rate_limited", "The market-data provider rate limit was reached.", {
        provider: opts.provider,
        status: 429,
      });
    }
    if (!response.ok) {
      throw new UpstreamError("http", `${opts.provider} responded with HTTP ${response.status}.`, {
        provider: opts.provider,
        status: response.status === 404 ? 404 : 502,
      });
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new UpstreamError("malformed", `${opts.provider} returned a malformed JSON payload.`, {
        provider: opts.provider,
      });
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new UpstreamError("timeout", `${opts.provider} request timed out.`, { provider: opts.provider, status: 504 });
    }
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new UpstreamError("network", `${opts.provider} is unreachable (${message}).`, {
      provider: opts.provider,
      status: 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Stale-while-revalidate cache with request de-duplication.
 *
 * - Fresh hits are returned immediately without touching the network.
 * - Concurrent misses share a single in-flight promise.
 * - If a refresh fails and stale data exists, the stale value is returned with
 *   `stale: true` so the UI can label it instead of blanking out.
 */
export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: CachedOptions = {},
): Promise<CachedResult<T>> {
  const maxEntries = options.maxEntries ?? 200;
  const now = Date.now();
  const existing = cache.get(key);

  if (existing && now - existing.fetchedAt < ttlMs) {
    return { value: existing.value as T, fetchedAt: existing.fetchedAt, stale: false };
  }

  try {
    let promise = existing?.inflight as Promise<T> | undefined;
    if (!promise) {
      promise = loader();
      const entry: CacheEntry = {
        value: existing?.value,
        fetchedAt: existing?.fetchedAt ?? 0,
        inflight: promise,
      };
      cache.set(key, entry);
      promise
        .then((value) => {
          cache.set(key, { value, fetchedAt: Date.now() });
          prune(maxEntries);
        })
        .catch(() => {
          if (existing) {
            cache.set(key, { value: existing.value, fetchedAt: existing.fetchedAt });
          } else {
            cache.delete(key);
          }
        });
    }
    const value = await promise;
    return { value, fetchedAt: Date.now(), stale: false };
  } catch (error) {
    if (existing && existing.value !== undefined) {
      return { value: existing.value as T, fetchedAt: existing.fetchedAt, stale: true };
    }
    throw error;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof UpstreamError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
