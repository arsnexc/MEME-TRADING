import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedJson, clearMarketCache, getJson, rateLimitSnapshot, resetRateLimits } from "@/lib/market-data/upstream";
import { fetchMarkets, fetchQuotePrices, fetchTokenQuotes } from "@/lib/market-data/service";
import type { GtPool } from "@/lib/market-data/geckoterminal";
import { UpstreamError } from "@/lib/market-data/types";
import type { DsPair } from "@/lib/market-data/dexscreener";

const WSOL = "So11111111111111111111111111111111111111112";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const TOKEN = "token123";

const pool: GtPool = {
  id: "solana_pool123",
  type: "pool",
  attributes: {
    base_token_price_usd: "0.01",
    quote_token_price_usd: "100",
    address: "pool123",
    name: "TEST / SOL",
    pool_created_at: "2025-01-01T00:00:00Z",
    fdv_usd: "900000",
    market_cap_usd: "500000",
    price_change_percentage: { h24: "-10" },
    transactions: { h24: { buys: 10, sells: 5 } },
    volume_usd: { h24: "50000" },
    reserve_in_usd: "25000",
    locked_liquidity_percentage: "85",
  },
  relationships: {
    base_token: { data: { id: `solana_${TOKEN}` } },
    quote_token: { data: { id: `solana_${WSOL}` } },
    dex: { data: { id: "pumpswap" } },
  },
};

function dsPair(overrides: Partial<DsPair> & Pick<DsPair, "pairAddress" | "baseToken">): DsPair {
  return {
    chainId: "solana",
    dexId: "pumpswap",
    quoteToken: { address: WSOL, name: "Wrapped SOL", symbol: "SOL" },
    priceUsd: "1",
    liquidity: { usd: 1000 },
    ...overrides,
  };
}

const wsolPair = dsPair({
  pairAddress: "wsol-pool",
  baseToken: { address: WSOL, name: "Wrapped SOL", symbol: "SOL" },
  priceUsd: "150",
  liquidity: { usd: 50_000_000 },
});
const tokenPair = dsPair({
  pairAddress: "pool123",
  baseToken: { address: TOKEN, name: "Test Token", symbol: "TEST" },
  priceUsd: "0.02",
  liquidity: { usd: 30_000 },
});
const wethPair = dsPair({
  chainId: "ethereum",
  pairAddress: "weth-pool",
  baseToken: { address: WETH, name: "Wrapped Ether", symbol: "WETH" },
  priceUsd: "2500",
  liquidity: { usd: 80_000_000 },
});

/** Await a promise that is expected to reject and return the typed error. */
async function rejectionOf(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
  } catch (error) {
    return error as UpstreamError;
  }
  throw new Error("Expected the promise to reject.");
}

function jsonResponse(body: unknown, init: { status?: number; retryAfter?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? (init.retryAfter ?? null) : null) },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("provider rate limiting", () => {
  beforeEach(() => {
    clearMarketCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with a typed 429 and a concrete retry hint when the window is exhausted", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 24; i += 1) {
      await getJson(`https://example.test/gt/${i}`, { provider: "geckoterminal" });
    }
    const snapshot = rateLimitSnapshot("geckoterminal");
    expect(snapshot.used).toBe(24);
    expect(snapshot.remaining).toBe(0);

    await expect(getJson("https://example.test/gt/overflow", { provider: "geckoterminal" })).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      provider: "geckoterminal",
    });

    const error = await rejectionOf(getJson("https://example.test/gt/overflow", { provider: "geckoterminal" }));
    expect(error.retryAfterMs).toBeGreaterThan(0);
    expect(error.retryAfterMs).toBeLessThanOrEqual(60_100);
    // The blocked calls never reach the network.
    expect(fetchMock).toHaveBeenCalledTimes(24);
  });

  it("enters a cooldown after an upstream 429 and fails fast without refetching", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "slow down" }, { status: 429, retryAfter: "30" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await rejectionOf(getJson("https://example.test/gt/a", { provider: "geckoterminal" }));
    expect(first.code).toBe("rate_limited");
    expect(first.retryAfterMs).toBe(30_000);
    expect(rateLimitSnapshot("geckoterminal").cooldownMs).toBeGreaterThan(25_000);

    const second = await rejectionOf(getJson("https://example.test/gt/b", { provider: "geckoterminal" }));
    expect(second.code).toBe("rate_limited");
    expect(second.retryAfterMs).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetRateLimits();
    expect(rateLimitSnapshot("geckoterminal").cooldownMs).toBe(0);
  });

  it("does not count cached responses against the budget", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 10; i += 1) {
      const result = await cachedJson("shared:key", 60_000, () =>
        getJson("https://example.test/gt/shared", { provider: "geckoterminal" }),
      );
      expect(result.stale).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rateLimitSnapshot("geckoterminal").used).toBe(1);
  });
});

describe("stale fallback", () => {
  beforeEach(() => {
    clearMarketCache();
  });

  it("serves the last good value with stale:true when a refresh is rate limited", async () => {
    let limited = false;
    const loader = vi.fn(async () => {
      if (limited) throw new UpstreamError("rate_limited", "slow down", { provider: "geckoterminal", status: 429 });
      return { n: 1 };
    });

    const first = await cachedJson("stale:key", 0, loader);
    expect(first).toMatchObject({ value: { n: 1 }, stale: false });

    limited = true;
    const second = await cachedJson("stale:key", 0, loader);
    expect(second).toMatchObject({ value: { n: 1 }, stale: true });
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });
});

describe("reference quote prices", () => {
  beforeEach(() => {
    clearMarketCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives SOL and ETH prices from DEX Screener batches instead of GeckoTerminal", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/networks/solana/trending_pools")) return jsonResponse({ data: [pool] });
        if (url.includes(`/tokens/v1/solana/`) && url.includes(WSOL)) return jsonResponse([wsolPair, tokenPair]);
        if (url.includes(`/tokens/v1/ethereum/`) && url.includes(WETH)) return jsonResponse([wethPair]);
        throw new Error(`Unexpected upstream call: ${url}`);
      }),
    );

    const result = await fetchMarkets({ tab: "trending", networks: ["solana"] });
    expect(result.quotePrices.SOL?.usd).toBe(150);
    expect(result.quotePrices.ETH?.usd).toBe(2500);

    // The whole discovery request costs one GeckoTerminal call (the pool list).
    expect(calls.filter((url) => url.includes("api.geckoterminal.com"))).toHaveLength(1);
    expect(calls.some((url) => url.includes("/token_price/"))).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("falls back to GeckoTerminal only when DEX Screener cannot price a quote token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/tokens/v1/solana/")) return jsonResponse([]);
        if (url.includes("/tokens/v1/ethereum/")) return jsonResponse([]);
        if (url.includes("/token_price/So111")) {
          return jsonResponse({ data: { attributes: { token_prices: { [WSOL]: "123.45" } } } });
        }
        if (url.includes("/token_price/0xc02")) {
          return jsonResponse({ data: { attributes: { token_prices: { [WETH]: "2345.67" } } } });
        }
        throw new Error(`Unexpected upstream call: ${url}`);
      }),
    );

    const result = await fetchQuotePrices();
    expect(result.prices.SOL?.usd).toBe(123.45);
    expect(result.prices.ETH?.usd).toBe(2345.67);
    expect(result.warnings).toHaveLength(0);
  });

  it("refreshes many pools with a single GeckoTerminal multi-pool request per network", async () => {
    const poolFor = (index: number): GtPool => ({
      ...pool,
      id: `solana_pool${index}`,
      attributes: { ...pool.attributes, address: `pool${index}`, name: `TEST${index} / SOL` },
      relationships: {
        base_token: { data: { id: `solana_token${index}` } },
        quote_token: { data: { id: `solana_${WSOL}` } },
        dex: { data: { id: "pumpswap" } },
      },
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/pools/multi/")) return jsonResponse({ data: [poolFor(1), poolFor(2), poolFor(3)] });
        if (url.includes("/tokens/v1/ethereum/")) return jsonResponse([wethPair]);
        if (url.includes("/tokens/v1/solana/")) {
          return jsonResponse([
            wsolPair,
            dsPair({ pairAddress: "pool1", baseToken: { address: "token1", name: "T1", symbol: "T1" }, priceUsd: "0.1" }),
            dsPair({ pairAddress: "pool2", baseToken: { address: "token2", name: "T2", symbol: "T2" }, priceUsd: "0.2" }),
            dsPair({ pairAddress: "pool3", baseToken: { address: "token3", name: "T3", symbol: "T3" }, priceUsd: "0.3" }),
          ]);
        }
        throw new Error(`Unexpected upstream call: ${url}`);
      }),
    );

    const result = await fetchTokenQuotes([
      { network: "solana", pool: "pool1" },
      { network: "solana", pool: "pool2" },
      { network: "solana", pool: "pool3" },
    ]);

    expect(result.tokens.map((token) => token.symbol).sort()).toEqual(["T1", "T2", "T3"]);
    expect(result.quotePrices.SOL?.usd).toBe(150);
    expect(calls.filter((url) => url.includes("/pools/multi/"))).toHaveLength(1);
    // The old per-token detail path must not be used.
    expect(calls.some((url) => /\/pools\/pool\d(\?|$)/.test(url))).toBe(false);
    expect(calls.filter((url) => url.includes("api.geckoterminal.com"))).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("surfaces the provider 429 (with a retry hint) when nothing could be refreshed", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/pools/multi/")) return jsonResponse({ error: "limited" }, { status: 429, retryAfter: "20" });
        throw new Error(`Unexpected upstream call: ${url}`);
      }),
    );

    const error = await rejectionOf(fetchTokenQuotes([{ network: "solana", pool: "pool1" }]));
    expect(error).toMatchObject({ code: "rate_limited", status: 429, provider: "geckoterminal" });
    expect(error.retryAfterMs).toBeGreaterThan(0);
    // A 429 is not retried inside the same cycle.
    expect(calls.filter((url) => url.includes("/pools/multi/"))).toHaveLength(1);
  });

  it("reports unavailable quotes instead of inventing prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const result = await fetchQuotePrices({ SOL: 150 });
    expect(result.prices.SOL?.usd).toBe(150);
    expect(result.prices.ETH).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/ETH\/USD reference price unavailable/);
  });
});
