import {
  NETWORKS,
  QUOTE_REFERENCE,
  SUPPORTED_NETWORK_IDS,
  type ChartTimeframe,
  type NetworkId,
  type QuoteCurrency,
  type ScannerTimeframe,
} from "@/lib/constants";
import { dsSearch, dsTokenPairs, pickDsPair, type DsPair } from "./dexscreener";
import { gtOhlcv, gtPools, gtPool, gtTrades, gtTokenPriceUsd } from "./geckoterminal";
import { dedupeTokens, normalizeDsPair, normalizeGtPool } from "./normalize";
import { errorMessage } from "./upstream";
import {
  type MarketToken,
  type MarketsResponse,
  type OhlcvResponse,
  type QuotePrices,
  type SearchResponse,
  type TradesResponse,
  type TokenDetailResponse,
  UpstreamError,
} from "./types";

function isSupportedNetwork(value: string): value is NetworkId {
  return (SUPPORTED_NETWORK_IDS as string[]).includes(value);
}

export function parseNetworks(value: string | null | undefined): NetworkId[] {
  if (!value) return SUPPORTED_NETWORK_IDS;
  const requested = value
    .split(",")
    .map((v) => v.trim())
    .filter(isSupportedNetwork);
  return requested.length > 0 ? [...new Set(requested)] : SUPPORTED_NETWORK_IDS;
}

export async function fetchQuotePrices(): Promise<{ prices: QuotePrices; warnings: string[] }> {
  const [sol, eth] = await Promise.all([
    gtTokenPriceUsd(QUOTE_REFERENCE.SOL.network, QUOTE_REFERENCE.SOL.address),
    gtTokenPriceUsd(QUOTE_REFERENCE.ETH.network, QUOTE_REFERENCE.ETH.address),
  ]);
  const now = Date.now();
  const warnings: string[] = [];
  if (sol == null) warnings.push("SOL/USD reference price unavailable — SOL-denominated figures may be blank.");
  if (eth == null) warnings.push("ETH/USD reference price unavailable — ETH-denominated figures may be blank.");
  return {
    prices: {
      SOL: sol ? { usd: sol, at: now } : null,
      ETH: eth ? { usd: eth, at: now } : null,
      fetchedAt: now,
    },
    warnings,
  };
}

export function quotePriceUsd(prices: QuotePrices, quote: QuoteCurrency): number | null {
  return prices[quote]?.usd ?? null;
}

function sortTokens(tokens: MarketToken[], tab: string): MarketToken[] {
  if (tab === "top") {
    return [...tokens].sort(
      (a, b) =>
        (b.volumeUsd.h24 ?? 0) - (a.volumeUsd.h24 ?? 0) || (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0),
    );
  }
  if (tab === "radar") {
    return [...tokens].sort((a, b) => (b.poolCreatedAt ?? 0) - (a.poolCreatedAt ?? 0));
  }
  return tokens;
}

/**
 * Discovery list: GeckoTerminal trending/new pools per network, enriched with a
 * single batched DEX Screener lookup per network for logos, socials and
 * circulating market caps.
 */
export async function fetchMarkets(params: {
  tab?: string;
  networks?: NetworkId[];
  page?: number;
}): Promise<MarketsResponse> {
  const tab = params.tab ?? "trending";
  const networks = params.networks?.length ? params.networks : [...SUPPORTED_NETWORK_IDS];
  const page = params.page ?? 1;
  const kind = tab === "radar" ? "new" : "trending";

  if (tab === "streamers") {
    const quote = await fetchQuotePrices();
    return {
      tokens: [],
      tab,
      fetchedAt: Date.now(),
      quotePrices: quote.prices,
      stale: false,
      warnings: ["No verified streamer data source is connected in this build."],
    };
  }

  const warnings: string[] = [];
  let stale = false;

  const results = await Promise.allSettled(networks.map((network) => gtPools(network, kind, page)));
  const pools: { network: NetworkId; pool: NonNullable<Awaited<ReturnType<typeof gtPools>>["value"]>[number] }[] = [];

  results.forEach((result, index) => {
    const network = networks[index];
    if (result.status === "fulfilled") {
      if (result.value.stale) stale = true;
      for (const pool of result.value.value) {
        if (pool?.attributes?.address) pools.push({ network, pool });
      }
    } else {
      warnings.push(`${NETWORKS[network].label} market data unavailable: ${errorMessage(result.reason)}`);
    }
  });

  if (pools.length === 0) {
    const firstFailure = results.find((r) => r.status === "rejected");
    if (firstFailure && firstFailure.status === "rejected") throw firstFailure.reason;
    return {
      tokens: [],
      tab,
      fetchedAt: Date.now(),
      quotePrices: { SOL: null, ETH: null, fetchedAt: Date.now() },
      stale: false,
      warnings,
    };
  }

  const dsByNetwork = new Map<NetworkId, DsPair[]>();
  await Promise.all(
    [...new Set(pools.map((p) => p.network))].map(async (network) => {
      const addresses = pools
        .filter((p) => p.network === network)
        .map((p) => p.pool.relationships?.base_token?.data?.id?.split("_").slice(1).join("_") ?? "")
        .filter(Boolean);
      try {
        const result = await dsTokenPairs(network, addresses);
        if (result.stale) stale = true;
        dsByNetwork.set(network, result.pairs);
      } catch (error) {
        warnings.push(`${NETWORKS[network].label} logos/socials unavailable: ${errorMessage(error)}`);
        dsByNetwork.set(network, []);
      }
    }),
  );

  const normalized: MarketToken[] = [];
  for (const { network, pool } of pools) {
    const dsPairs = dsByNetwork.get(network) ?? [];
    const tokenId = pool.relationships?.base_token?.data?.id?.split("_").slice(1).join("_") ?? null;
    const dsPair = pickDsPair(dsPairs, pool.attributes.address, tokenId);
    const token = normalizeGtPool(pool, network, dsPair);
    if (token) normalized.push(token);
  }

  const quote = await fetchQuotePrices().catch(() => ({
    prices: { SOL: null, ETH: null, fetchedAt: Date.now() },
    warnings: ["Quote reference prices unavailable."],
  }));
  warnings.push(...quote.warnings);

  const tokens = sortTokens(dedupeTokens(normalized), tab).slice(0, 90);

  return {
    tokens,
    tab,
    fetchedAt: Date.now(),
    quotePrices: quote.prices,
    stale,
    warnings: [...new Set(warnings)],
  };
}

export interface TokenQuery {
  network: NetworkId;
  pool: string;
  token?: string | null;
}

export async function fetchTokenDetail(query: TokenQuery): Promise<TokenDetailResponse> {
  const warnings: string[] = [];
  let stale = false;
  let market: MarketToken | null = null;
  let dexName: string | null = null;

  try {
    const poolResult = await gtPool(query.network, query.pool);
    if (poolResult.stale) stale = true;
    const gt = poolResult.value;
    const tokenFromPool =
      gt.data?.relationships?.base_token?.data?.id?.split("_").slice(1).join("_") ?? query.token ?? null;

    let dsPair: DsPair | null = null;
    if (tokenFromPool) {
      try {
        const ds = await dsTokenPairs(query.network, [tokenFromPool]);
        if (ds.stale) stale = true;
        dsPair = pickDsPair(ds.pairs, query.pool, tokenFromPool);
      } catch (error) {
        warnings.push(`Logo and social data unavailable: ${errorMessage(error)}`);
      }
    }

    const includedDex = gt.included?.find((item) => item.type === "dex");
    dexName = includedDex?.attributes?.name ?? gt.data?.relationships?.dex?.data?.id ?? null;
    market = normalizeGtPool(gt.data, query.network, dsPair);
  } catch (error) {
    warnings.push(`GeckoTerminal pool detail unavailable: ${errorMessage(error)}`);
  }

  if (!market) {
    const fallbackAddress = query.token ?? null;
    if (!fallbackAddress) {
      throw new UpstreamError("http", "Token detail is unavailable for this pool.", { status: 404 });
    }
    try {
      const ds = await dsTokenPairs(query.network, [fallbackAddress]);
      const pair = pickDsPair(ds.pairs, query.pool, fallbackAddress);
      if (!pair) throw new UpstreamError("http", "No market data found for this token.", { status: 404 });
      market = normalizeDsPair(pair, query.network);
      dexName = pair.dexId;
      warnings.push("Pool metrics fall back to DEX Screener; the chart may be unavailable for this pool.");
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError("http", `Token detail unavailable: ${errorMessage(error)}`, { status: 502 });
    }
  }

  if (!market) {
    throw new UpstreamError("http", "Token detail is unavailable for this pool.", { status: 404 });
  }

  const quote = await fetchQuotePrices().catch(() => ({
    prices: { SOL: null, ETH: null, fetchedAt: Date.now() },
    warnings: ["Quote reference prices unavailable."],
  }));
  warnings.push(...quote.warnings);

  return {
    market,
    dexName,
    quotePrices: quote.prices,
    fetchedAt: Date.now(),
    stale,
    warnings: [...new Set(warnings)],
  };
}

export async function fetchOhlcv(params: {
  network: NetworkId;
  pool: string;
  timeframe: ChartTimeframe;
}): Promise<OhlcvResponse> {
  const result = await gtOhlcv(params.network, params.pool, params.timeframe);
  return {
    candles: result.value,
    timeframe: params.timeframe,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    source: "geckoterminal",
    warnings: result.value.length === 0 ? ["No candles are available for this pool and timeframe."] : [],
  };
}

export async function fetchTrades(params: {
  network: NetworkId;
  pool: string;
  limit?: number;
}): Promise<TradesResponse> {
  const result = await gtTrades(params.network, params.pool);
  const limit = Math.min(Math.max(params.limit ?? 100, 10), 300);
  const trades = result.value.slice(0, limit);
  const times = trades.map((t) => t.at).filter((t) => Number.isFinite(t));
  return {
    trades,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    warnings: trades.length === 0 ? ["No recent trades were returned for this pool."] : [],
    window: {
      count: trades.length,
      from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null,
      complete: false,
    },
  };
}

export async function fetchSearch(query: string): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { tokens: [], fetchedAt: Date.now(), query: trimmed };
  const result = await dsSearch(trimmed);
  const tokens: MarketToken[] = [];
  for (const pair of result.pairs) {
    const network = SUPPORTED_NETWORK_IDS.find((id) => NETWORKS[id].dexscreenerId === pair.chainId);
    if (!network) continue;
    const token = normalizeDsPair(pair, network);
    if (token) tokens.push(token);
  }
  const deduped = dedupeTokens(tokens)
    .filter((t) => t.priceUsd != null)
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 30);
  return { tokens: deduped, fetchedAt: result.fetchedAt, query: trimmed };
}

export function availabilityForTimeframe(token: MarketToken, timeframe: ScannerTimeframe): boolean {
  return token.volumeUsd[timeframe] != null;
}
