import { type NetworkId, type ChartTimeframe, NETWORKS } from "@/lib/constants";
import { cachedJson, getJson, errorMessage } from "./upstream";
import type { Candle, MarketTrade } from "./types";

const GT_BASE = "https://api.geckoterminal.com/api/v2";

export interface GtPoolAttributes {
  base_token_price_usd: string | null;
  base_token_price_native_currency?: string | null;
  quote_token_price_usd?: string | null;
  address: string;
  name: string;
  pool_created_at: string | null;
  fdv_usd: string | null;
  market_cap_usd: string | null;
  price_change_percentage: Record<string, string | null> | null;
  transactions: Record<string, { buys: number; sells: number; buyers?: number; sellers?: number }> | null;
  volume_usd: Record<string, string | null> | null;
  reserve_in_usd: string | null;
  locked_liquidity_percentage?: string | null;
}

export interface GtPool {
  id: string;
  type: "pool";
  attributes: GtPoolAttributes;
  relationships?: {
    base_token?: { data?: { id: string } };
    quote_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
}

export interface GtPoolResponse {
  data: GtPool;
  included?: {
    id: string;
    type: string;
    attributes: {
      address?: string;
      name?: string;
      symbol?: string;
      image_url?: string | null;
    };
  }[];
}

export interface GtPoolListResponse {
  data: GtPool[];
}

interface GtOhlcvResponse {
  data: {
    attributes: {
      ohlcv_list: number[][];
    };
  };
}

interface GtTradeAttributes {
  block_timestamp: string;
  tx_hash: string;
  tx_from_address: string;
  kind: "buy" | "sell";
  from_token_address: string;
  to_token_address: string;
  from_token_amount: string;
  to_token_amount: string;
  price_from_in_usd: string;
  price_to_in_usd: string;
  volume_in_usd: string;
}

interface GtTradesResponse {
  data: { id: string; attributes: GtTradeAttributes }[];
}

interface GtPriceResponse {
  data: {
    attributes: {
      token_prices: Record<string, string>;
    };
  };
}

export interface Timed<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export async function gtPools(
  network: NetworkId,
  kind: "trending" | "new",
  page = 1,
): Promise<Timed<GtPool[]>> {
  const gecko = NETWORKS[network].geckoId;
  const path = kind === "trending" ? "trending_pools" : "new_pools";
  const key = `gt:${kind}:${network}:${page}`;
  const result = await cachedJson<GtPoolListResponse>(
    key,
    kind === "trending" ? 25_000 : 20_000,
    () => getJson<GtPoolListResponse>(`${GT_BASE}/networks/${gecko}/${path}?page=${page}`, { provider: "geckoterminal" }),
  );
  return {
    value: Array.isArray(result.value?.data) ? result.value.data : [],
    fetchedAt: result.fetchedAt,
    stale: result.stale,
  };
}

export async function gtPool(network: NetworkId, poolAddress: string): Promise<Timed<GtPoolResponse>> {
  const gecko = NETWORKS[network].geckoId;
  const result = await cachedJson<GtPoolResponse>(
    `gt:pool:${network}:${poolAddress.toLowerCase()}`,
    10_000,
    () =>
      getJson<GtPoolResponse>(
        `${GT_BASE}/networks/${gecko}/pools/${encodeURIComponent(poolAddress)}?include=base_token,quote_token,dex`,
        { provider: "geckoterminal" },
      ),
  );
  return { value: result.value, fetchedAt: result.fetchedAt, stale: result.stale };
}

const OHLCV_MAP: Record<ChartTimeframe, { path: "minute" | "hour" | "day"; aggregate: number }> = {
  "1m": { path: "minute", aggregate: 1 },
  "5m": { path: "minute", aggregate: 5 },
  "15m": { path: "minute", aggregate: 15 },
  "1h": { path: "hour", aggregate: 1 },
  "4h": { path: "hour", aggregate: 4 },
  "1d": { path: "day", aggregate: 1 },
};

export async function gtOhlcv(
  network: NetworkId,
  poolAddress: string,
  timeframe: ChartTimeframe,
): Promise<Timed<Candle[]>> {
  const gecko = NETWORKS[network].geckoId;
  const { path, aggregate } = OHLCV_MAP[timeframe];
  const limit = timeframe === "1m" ? 240 : 300;
  const url = `${GT_BASE}/networks/${gecko}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${path}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`;
  const result = await cachedJson<GtOhlcvResponse>(
    `gt:ohlcv:${network}:${poolAddress.toLowerCase()}:${timeframe}`,
    15_000,
    () => getJson<GtOhlcvResponse>(url, { provider: "geckoterminal" }),
  );

  const raw = result.value?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(raw)) {
    throw new Error("GeckoTerminal returned an unexpected OHLCV payload.");
  }

  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [time, open, high, low, close, volume] = row;
    if (![time, open, high, low, close, volume].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    const t = Math.floor(time);
    if (seen.has(t)) continue;
    seen.add(t);
    candles.push({ time: t, open, high, low, close, volume });
  }
  candles.sort((a, b) => a.time - b.time);

  return { value: candles, fetchedAt: result.fetchedAt, stale: result.stale };
}

export async function gtTrades(network: NetworkId, poolAddress: string): Promise<Timed<MarketTrade[]>> {
  const gecko = NETWORKS[network].geckoId;
  const url = `${GT_BASE}/networks/${gecko}/pools/${encodeURIComponent(poolAddress)}/trades?trade_volume_in_usd_greater_than=0`;
  const result = await cachedJson<GtTradesResponse>(
    `gt:trades:${network}:${poolAddress.toLowerCase()}`,
    15_000,
    () => getJson<GtTradesResponse>(url, { provider: "geckoterminal" }),
  );

  const raw = Array.isArray(result.value?.data) ? result.value.data : [];
  const trades: MarketTrade[] = [];
  for (const entry of raw) {
    const a = entry?.attributes;
    if (!a) continue;
    const isBuy = a.kind === "buy";
    const priceUsd = Number(isBuy ? a.price_to_in_usd : a.price_from_in_usd);
    const baseAmount = Number(isBuy ? a.to_token_amount : a.from_token_amount);
    const valueUsd = Number(a.volume_in_usd);
    const at = Date.parse(a.block_timestamp);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
    if (!Number.isFinite(at)) continue;
    trades.push({
      id: entry.id,
      side: isBuy ? "buy" : "sell",
      priceUsd,
      baseAmount: Number.isFinite(baseAmount) ? baseAmount : 0,
      valueUsd: Number.isFinite(valueUsd) ? valueUsd : 0,
      wallet: a.tx_from_address ?? "",
      txHash: a.tx_hash ?? "",
      at,
    });
  }
  trades.sort((a, b) => b.at - a.at);
  return { value: trades, fetchedAt: result.fetchedAt, stale: result.stale };
}

export async function gtTokenPriceUsd(network: NetworkId, address: string): Promise<number | null> {
  const gecko = NETWORKS[network].geckoId;
  try {
    const result = await cachedJson<GtPriceResponse>(
      `gt:price:${network}:${address.toLowerCase()}`,
      45_000,
      () =>
        getJson<GtPriceResponse>(
          `${GT_BASE}/simple/networks/${gecko}/token_price/${encodeURIComponent(address)}`,
          { provider: "geckoterminal" },
        ),
    );
    const price = result.value?.data?.attributes?.token_prices?.[address];
    const parsed = Number(price);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch (error) {
    console.warn(`[market-data] quote price failed for ${network}:${address} — ${errorMessage(error)}`);
    return null;
  }
}
