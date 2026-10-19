import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDsPair, normalizeGtPool, dedupeTokens, hasEnoughMarketData } from "@/lib/market-data/normalize";
import { pickDsPair } from "@/lib/market-data/dexscreener";
import type { GtPool } from "@/lib/market-data/geckoterminal";
import type { DsPair } from "@/lib/market-data/dexscreener";
import { clearMarketCache } from "@/lib/market-data/upstream";
import { fetchMarkets, fetchOhlcv, fetchTrades, parseNetworks } from "@/lib/market-data/service";
import { filterAndSortTokens, paginate, sortValue } from "@/lib/market-view";
import { UNKNOWN_SECURITY_NOTE } from "@/lib/market-data/types";

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
    price_change_percentage: { m5: "1.5", h1: "2", h24: "-10" },
    transactions: { h24: { buys: 10, sells: 5, buyers: 8, sellers: 4 } },
    volume_usd: { m5: "100", h24: "50000" },
    reserve_in_usd: "25000",
    locked_liquidity_percentage: "85",
  },
  relationships: {
    base_token: { data: { id: "solana_token123" } },
    quote_token: { data: { id: "solana_So111" } },
    dex: { data: { id: "pumpswap" } },
  },
};

const pair: DsPair = {
  chainId: "solana",
  dexId: "pumpswap",
  url: "https://dexscreener.com/solana/pool123",
  pairAddress: "pool123",
  baseToken: { address: "token123", name: "Test Token", symbol: "TEST" },
  quoteToken: { address: "So111", name: "Wrapped SOL", symbol: "SOL" },
  priceUsd: "0.02",
  volume: { m5: 120, h1: 900, h24: 60_000 },
  priceChange: { m5: 2, h24: 12 },
  liquidity: { usd: 30_000 },
  fdv: 1_000_000,
  marketCap: 600_000,
  pairCreatedAt: 1_700_000_000_000,
  info: {
    imageUrl: "https://example.com/logo.png",
    websites: [{ url: "https://example.com" }],
    socials: [{ type: "twitter", url: "https://x.com/example" }],
  },
};

describe("normalization", () => {
  it("merges GeckoTerminal metrics with DEX Screener metadata", () => {
    const token = normalizeGtPool(pool, "solana", pair, { now: 1_700_000_000_000 });
    expect(token).not.toBeNull();
    if (!token) return;
    expect(token.tokenAddress).toBe("token123");
    expect(token.priceUsd).toBe(0.02);
    expect(token.marketCapUsd).toBe(600_000);
    expect(token.marketCapIsFdv).toBe(false);
    expect(token.liquidityUsd).toBe(30_000);
    expect(token.volumeUsd.h24).toBe(50_000);
    expect(token.volumeUsd.m15).toBeNull();
    expect(token.changePct.h24).toBe(-10);
    expect(token.imageUrl).toBe("https://example.com/logo.png");
    expect(token.security.lpLockedPct).toBe(85);
    expect(token.security.mintAuthority).toBe("unknown");
    expect(token.security.note).toBe(UNKNOWN_SECURITY_NOTE);
    expect(token.source).toBe("geckoterminal+dexscreener");
    expect(token.dexId).toBe("pumpswap");
  });

  it("falls back to GeckoTerminal-only data without a DEX pair", () => {
    const token = normalizeGtPool(pool, "solana", null, { now: 1_700_000_000_000 });
    expect(token?.priceUsd).toBe(0.01);
    expect(token?.marketCapUsd).toBe(500_000);
    expect(token?.source).toBe("geckoterminal");
    expect(token?.imageUrl).toBeNull();
  });

  it("marks FDV-backed market caps explicitly", () => {
    const token = normalizeDsPair({ ...pair, marketCap: null }, "solana");
    expect(token?.marketCapUsd).toBe(1_000_000);
    expect(token?.marketCapIsFdv).toBe(true);
    expect(token?.source).toBe("dexscreener");
    expect(token?.security.lpLockedPct).toBeNull();
  });

  it("rejects pool payloads without a usable base token", () => {
    expect(normalizeGtPool({ ...pool, relationships: undefined }, "solana", null)).toBeNull();
    expect(normalizeDsPair({ ...pair, baseToken: { address: "", name: "x", symbol: "x" } }, "solana")).toBeNull();
  });

  it("picks the pair matching the pool, otherwise the deepest token pair", () => {
    const alt = { ...pair, pairAddress: "other", liquidity: { usd: 500_000 } };
    expect(pickDsPair([alt, pair], "pool123", "token123")?.pairAddress).toBe("pool123");
    expect(pickDsPair([pair, alt], null, "token123")?.pairAddress).toBe("other");
    expect(pickDsPair([], "pool123", "token123")).toBeNull();
  });

  it("dedupes by token and prefers the deeper pool", () => {
    const a = normalizeGtPool(pool, "solana", null, { now: 1 });
    const b = normalizeGtPool(pool, "solana", pair, { now: 1 });
    if (!a || !b) throw new Error("fixtures failed");
    const deduped = dedupeTokens([{ ...a, liquidityUsd: 1_000 }, b]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].liquidityUsd).toBe(30_000);
    expect(hasEnoughMarketData(deduped[0])).toBe(true);
    expect(hasEnoughMarketData({ ...deduped[0], liquidityUsd: 0 })).toBe(false);
  });
});

describe("market view", () => {
  const tokens = [
    normalizeGtPool(pool, "solana", pair)!,
    normalizeGtPool(
      { ...pool, id: "eth_pool", attributes: { ...pool.attributes, address: "pool-eth", name: "AAA / ETH" }, relationships: { base_token: { data: { id: "eth_aaa" } } } },
      "eth",
      null,
    )!,
  ];

  it("sorts with unknown values last in both directions", () => {
    const sorted = filterAndSortTokens(tokens, {
      timeframe: "h24",
      sortKey: "liquidity",
      sortDirection: "desc",
    });
    expect(sorted[0].tokenAddress).toBe("token123");
    expect(sorted[1].liquidityUsd).toBe(25_000);
    const asc = filterAndSortTokens([{ ...tokens[0], liquidityUsd: null }, tokens[1]], {
      timeframe: "h24",
      sortKey: "liquidity",
      sortDirection: "asc",
    });
    expect(asc[0].tokenAddress).toBe("aaa");
    expect(sortValue(tokens[0], "volume", "h24")).toBe(50_000);
  });

  it("filters by query, network and liquidity", () => {
    expect(filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "volume", sortDirection: "desc", query: "test" })).toHaveLength(1);
    expect(filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "volume", sortDirection: "desc", network: "eth" })).toHaveLength(1);
    expect(
      filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "volume", sortDirection: "desc", minLiquidity: 26_000 }),
    ).toHaveLength(1);
  });

  it("clamps pagination", () => {
    expect(paginate([1, 2, 3, 4, 5], 1, 2)).toMatchObject({ page: 1, pages: 3, start: 0, end: 2 });
    expect(paginate([1, 2, 3, 4, 5], 99, 2).page).toBe(3);
    expect(paginate([], 1, 25)).toMatchObject({ pages: 1, start: 0, end: 0 });
  });
});

describe("service with mocked providers", () => {
  beforeEach(() => {
    clearMarketCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(handler: (url: string) => { status?: number; body: unknown }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const { status = 200, body } = handler(url);
        return {
          ok: status >= 200 && status < 300,
          status,
          text: async () => JSON.stringify(body),
        } as Response;
      }),
    );
  }

  it("builds a merged market list and quote prices", async () => {
    mockFetch((url) => {
      if (url.includes("/networks/solana/trending_pools")) return { body: { data: [pool] } };
      if (url.includes("/networks/eth/trending_pools")) return { body: { data: [] } };
      if (url.includes("/networks/base/trending_pools")) return { body: { data: [] } };
      if (url.includes("/tokens/v1/solana/")) return { body: [pair] };
      if (url.includes("/token_price/So111")) {
        return { body: { data: { attributes: { token_prices: { So11111111111111111111111111111111111111112: "100" } } } } };
      }
      if (url.includes("/token_price/0xc02")) {
        return { body: { data: { attributes: { token_prices: { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "3000" } } } } };
      }
      throw new Error(`Unexpected upstream call: ${url}`);
    });

    const result = await fetchMarkets({ tab: "trending", networks: ["solana"] });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({ symbol: "TEST", network: "solana", priceUsd: 0.02 });
    expect(result.quotePrices.SOL?.usd).toBe(100);
    expect(result.quotePrices.ETH?.usd).toBe(3000);
    expect(result.warnings).toHaveLength(0);
  });

  it("degrades with warnings when DEX Screener fails", async () => {
    mockFetch((url) => {
      if (url.includes("/networks/solana/trending_pools")) return { body: { data: [pool] } };
      if (url.includes("/networks/solana/new_pools")) return { body: { data: [pool] } };
      if (url.includes("/tokens/v1/")) return { status: 500, body: { error: "boom" } };
      if (url.includes("/token_price/")) return { status: 429, body: { error: "limit" } };
      throw new Error(`Unexpected upstream call: ${url}`);
    });
    const result = await fetchMarkets({ tab: "radar", networks: ["solana"] });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].source).toBe("geckoterminal");
    expect(result.warnings.join(" ")).toMatch(/logos\/socials unavailable/);
    expect(result.quotePrices.SOL).toBeNull();
  });

  it("parses OHLCV rows, sorts them and drops duplicates", async () => {
    mockFetch(() => ({
      body: {
        data: {
          attributes: {
            ohlcv_list: [
              [1700000300, 2, 3, 1.5, 2.5, 50],
              [1700000000, 1, 2, 0.5, 1.5, 20],
              [1700000000, 9, 9, 9, 9, 9],
            ],
          },
        },
      },
    }));
    const result = await fetchOhlcv({ network: "solana", pool: "pool123", timeframe: "5m" });
    expect(result.candles).toHaveLength(2);
    expect(result.candles[0]).toMatchObject({ time: 1700000000, open: 1, volume: 20 });
    expect(result.source).toBe("geckoterminal");
    expect(result.warnings).toHaveLength(0);
  });

  it("normalizes trade sides and caps the requested window", async () => {
    mockFetch(() => ({
      body: {
        data: [
          {
            id: "t1",
            attributes: {
              block_timestamp: "2025-01-02T00:00:00Z",
              tx_hash: "hash1",
              tx_from_address: "wallet1",
              kind: "buy",
              from_token_amount: 1,
              to_token_amount: 100,
              price_from_in_usd: 100,
              price_to_in_usd: 1,
              volume_in_usd: 100,
            },
          },
          {
            id: "t2",
            attributes: {
              block_timestamp: "2025-01-01T00:00:00Z",
              tx_hash: "hash2",
              tx_from_address: "wallet2",
              kind: "sell",
              from_token_amount: 50,
              to_token_amount: 0.5,
              price_from_in_usd: 1,
              price_to_in_usd: 100,
              volume_in_usd: 50,
            },
          },
        ],
      },
    }));
    const result = await fetchTrades({ network: "solana", pool: "pool123", limit: 10 });
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ id: "t1", side: "buy", priceUsd: 1, baseAmount: 100, valueUsd: 100 });
    expect(result.trades[1]).toMatchObject({ id: "t2", side: "sell", priceUsd: 1, baseAmount: 50, valueUsd: 50 });
    expect(result.window).toMatchObject({ count: 2, complete: false });
    expect(result.window.from).toBeLessThan(result.window.to ?? 0);
  });

  it("maps a provider 429 to a typed rate-limit error", async () => {
    mockFetch(() => ({ status: 429, body: { error: "rate limited" } }));
    await expect(fetchOhlcv({ network: "solana", pool: "pool123", timeframe: "5m" })).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });

  it("validates network filters", () => {
    expect(parseNetworks("solana,eth,bogus")).toEqual(["solana", "eth"]);
    expect(parseNetworks(null)).toHaveLength(3);
    expect(parseNetworks("bogus")).toHaveLength(3);
  });
});
