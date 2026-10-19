import { UpstreamError } from "./types";

interface ProviderLimit {
  max: number;
  windowMs: number;
}

/**
 * Conservative client-side budgets. The public GeckoTerminal API documents
 * 30 requests/minute; we cap at 24/min to leave headroom for shared egress IPs.
 * Cached responses do not consume tokens.
 *
 * These are per server instance, so they are a safety valve rather than a
 * guarantee: upstream 429s are handled separately with a cooldown that every
 * subsequent request in the instance respects.
 */
const PROVIDER_LIMITS: Record<string, ProviderLimit> = {
  geckoterminal: { max: 24, windowMs: 60_000 },
  dexscreener: { max: 200, windowMs: 60_000 },
};

/** How long a request may wait for a free slot before we give up and return a typed 429. */
const MAX_QUEUE_WAIT_MS = 2_500;

/** First cooldown after an upstream 429; doubles on repeated strikes. */
const BASE_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 120_000;
const DEFAULT_RETRY_AFTER_MS = 20_000;

interface Bucket {
  hits: number[];
  cooldownUntil: number;
  strikes: number;
  lastStrikeAt: number;
}

const buckets = new Map<string, Bucket>();

function bucketFor(provider: string): Bucket {
  let bucket = buckets.get(provider);
  if (!bucket) {
    bucket = { hits: [], cooldownUntil: 0, strikes: 0, lastStrikeAt: 0 };
    buckets.set(provider, bucket);
  }
  return bucket;
}

function pruneHits(bucket: Bucket, limit: ProviderLimit, now: number) {
  if (bucket.hits.length === 0) return;
  bucket.hits = bucket.hits.filter((t) => now - t < limit.windowMs);
}

export interface RateLimitSnapshot {
  provider: string;
  limit: number;
  used: number;
  remaining: number;
  /** Milliseconds until the oldest slot in the window ages out. */
  resetInMs: number;
  /** Milliseconds until an active upstream cooldown expires (0 when healthy). */
  cooldownMs: number;
}

export function rateLimitSnapshot(provider: string): RateLimitSnapshot {
  const limit = PROVIDER_LIMITS[provider];
  if (!limit) {
    return { provider, limit: 0, used: 0, remaining: 0, resetInMs: 0, cooldownMs: 0 };
  }
  const bucket = bucketFor(provider);
  const now = Date.now();
  pruneHits(bucket, limit, now);
  const oldest = bucket.hits[0];
  return {
    provider,
    limit: limit.max,
    used: bucket.hits.length,
    remaining: Math.max(limit.max - bucket.hits.length, 0),
    resetInMs: oldest == null ? 0 : Math.max(limit.windowMs - (now - oldest), 0),
    cooldownMs: Math.max(bucket.cooldownUntil - now, 0),
  };
}

/** Record an upstream rate limit so every later request fails fast instead of hammering. */
export function noteRateLimit(provider: string, retryAfterMs?: number) {
  const bucket = bucketFor(provider);
  const now = Date.now();
  // Concurrent failures for the same burst should not compound the backoff.
  if (now - bucket.lastStrikeAt > 1_000) {
    bucket.strikes = Math.min(bucket.strikes + 1, 6);
    bucket.lastStrikeAt = now;
  }
  const backoff = Math.min(BASE_COOLDOWN_MS * 2 ** Math.max(bucket.strikes - 1, 0), MAX_COOLDOWN_MS);
  const wait = Math.max(retryAfterMs ?? 0, backoff);
  bucket.cooldownUntil = Math.max(bucket.cooldownUntil, now + wait);
}

function noteSuccess(provider: string) {
  const bucket = bucketFor(provider);
  if (Date.now() >= bucket.cooldownUntil) bucket.strikes = 0;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve one request slot.
 *
 * When the local window is full we wait briefly for the oldest slot to age out
 * instead of failing immediately — a burst of three network calls should not
 * turn into a user-visible error. If the wait would exceed the budget we throw a
 * typed 429 carrying `retryAfterMs`, which the client uses to back off.
 */
async function acquire(provider: string): Promise<void> {
  const limit = PROVIDER_LIMITS[provider];
  if (!limit) return;
  const bucket = bucketFor(provider);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now();

    if (bucket.cooldownUntil > now) {
      const retryAfterMs = bucket.cooldownUntil - now;
      throw new UpstreamError(
        "rate_limited",
        `${provider} asked us to slow down. Retrying in ${Math.ceil(retryAfterMs / 1000)}s.`,
        { provider, status: 429, retryAfterMs },
      );
    }

    pruneHits(bucket, limit, now);
    if (bucket.hits.length < limit.max) {
      bucket.hits.push(now);
      return;
    }

    const wait = limit.windowMs - (now - (bucket.hits[0] ?? now)) + 50;
    if (wait > MAX_QUEUE_WAIT_MS) {
      throw new UpstreamError(
        "rate_limited",
        `Local rate limit reached for ${provider}. Retrying in ${Math.ceil(wait / 1000)}s.`,
        { provider, status: 429, retryAfterMs: wait },
      );
    }
    await sleep(wait);
  }

  throw new UpstreamError("rate_limited", `Local rate limit reached for ${provider}. Try again shortly.`, {
    provider,
    status: 429,
    retryAfterMs: MAX_QUEUE_WAIT_MS,
  });
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
  buckets.clear();
}

/** Test/diagnostic helper: drop limiter state without touching cached payloads. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Request a JSON document with timeout + provider rate limiting.
 */
export async function getJson<T>(
  url: string,
  opts: { provider: "geckoterminal" | "dexscreener"; timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  await acquire(opts.provider);
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
      const retryAfter = readRetryAfter(response);
      noteRateLimit(opts.provider, retryAfter ?? undefined);
      const wait = retryAfter ?? DEFAULT_RETRY_AFTER_MS;
      throw new UpstreamError(
        "rate_limited",
        `The market-data provider rate limit was reached. Retrying in ${Math.ceil(wait / 1000)}s.`,
        { provider: opts.provider, status: 429, retryAfterMs: wait },
      );
    }
    if (!response.ok) {
      throw new UpstreamError("http", `${opts.provider} responded with HTTP ${response.status}.`, {
        provider: opts.provider,
        status: response.status === 404 ? 404 : 502,
      });
    }

    const text = await response.text();
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      throw new UpstreamError("malformed", `${opts.provider} returned a malformed JSON payload.`, {
        provider: opts.provider,
      });
    }
    noteSuccess(opts.provider);
    return parsed;
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

/** `Retry-After` is either delta-seconds or an HTTP date. */
function readRetryAfter(response: Response): number | null {
  const headers = (response as { headers?: { get?: (name: string) => string | null } }).headers;
  const raw = headers?.get?.("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    if (delta > 0) return Math.min(delta, MAX_COOLDOWN_MS);
  }
  return null;
}

/**
 * Stale-while-revalidate cache with request de-duplication.
 *
 * - Fresh hits are returned immediately without touching the network.
 * - Concurrent misses share a single in-flight promise.
 * - If a refresh fails and stale data exists, the stale value is returned with
 *   `stale: true` so the UI can label it instead of blanking out. Freshness is
 *   never claimed for a value that came from cache.
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

  const startRefresh = (): Promise<T> => {
    let promise = existing?.inflight as Promise<T> | undefined;
    if (promise) return promise;
    promise = loader();
    cache.set(key, { value: existing?.value, fetchedAt: existing?.fetchedAt ?? 0, inflight: promise });
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
    return promise;
  };

  try {
    const value = await startRefresh();
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
