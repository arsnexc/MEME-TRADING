import { type NetworkId, NETWORKS } from "@/lib/constants";
import { cachedJson, getJson } from "./upstream";
import type { SocialLink } from "./types";

const DS_BASE = "https://api.dexscreener.com";

export interface DsPair {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string | null;
  priceNative?: string | null;
  txns?: Record<string, { buys: number; sells: number } | undefined>;
  volume?: Record<string, number | undefined>;
  priceChange?: Record<string, number | undefined> | null;
  liquidity?: { usd?: number | null; base?: number; quote?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: {
    imageUrl?: string | null;
    websites?: { url: string; label?: string }[];
    socials?: SocialLink[];
  } | null;
  boosts?: { active?: number };
}

interface DsSearchResponse {
  pairs?: DsPair[] | null;
}

export interface TimedPairs {
  pairs: DsPair[];
  fetchedAt: number;
  stale: boolean;
}

/**
 * Batch token lookup (max 30 addresses per request, documented limit).
 * Docs: https://docs.dexscreener.com/api/reference — 300 req/min.
 */
export async function dsTokenPairs(network: NetworkId, addresses: string[]): Promise<TimedPairs> {
  const unique = [...new Set(addresses.filter(Boolean))].slice(0, 30);
  if (unique.length === 0) return { pairs: [], fetchedAt: Date.now(), stale: false };
  const chain = NETWORKS[network].dexscreenerId;
  const key = `ds:tokens:${chain}:${unique.map((a) => a.toLowerCase()).sort().join(",")}`;
  const result = await cachedJson<DsPair[]>(
    key,
    30_000,
    () =>
      getJson<DsPair[]>(`${DS_BASE}/tokens/v1/${chain}/${unique.map(encodeURIComponent).join(",")}`, {
        provider: "dexscreener",
      }),
  );
  return {
    pairs: Array.isArray(result.value) ? result.value : [],
    fetchedAt: result.fetchedAt,
    stale: result.stale,
  };
}

interface DsPairResponse {
  pairs?: DsPair[] | null;
  pair?: DsPair | null;
}

/**
 * Single-pair lookup for the live chart ticker.
 *
 * Deliberately cached for only 1.5 s: it backs a ~3 s poll, so a short TTL
 * de-duplicates accidental double requests without serving a stale price. DEX
 * Screener allows ~300 req/min, so this stays comfortably inside the budget.
 */
export async function dsPair(
  network: NetworkId,
  pairAddress: string,
): Promise<{ pair: DsPair | null; fetchedAt: number; stale: boolean }> {
  const chain = NETWORKS[network].dexscreenerId;
  const key = `ds:pair:${chain}:${pairAddress.toLowerCase()}`;
  const result = await cachedJson<DsPairResponse>(
    key,
    1_500,
    () =>
      getJson<DsPairResponse>(`${DS_BASE}/latest/dex/pairs/${chain}/${encodeURIComponent(pairAddress)}`, {
        provider: "dexscreener",
        timeoutMs: 4_500,
      }),
  );
  const pair = result.value?.pair ?? result.value?.pairs?.[0] ?? null;
  return { pair, fetchedAt: result.fetchedAt, stale: result.stale };
}

export async function dsSearch(query: string): Promise<TimedPairs> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { pairs: [], fetchedAt: Date.now(), stale: false };
  const key = `ds:search:${trimmed.toLowerCase()}`;
  const result = await cachedJson<DsSearchResponse>(
    key,
    12_000,
    () =>
      getJson<DsSearchResponse>(`${DS_BASE}/latest/dex/search?q=${encodeURIComponent(trimmed)}`, {
        provider: "dexscreener",
      }),
  );
  return {
    pairs: Array.isArray(result.value?.pairs) ? result.value.pairs : [],
    fetchedAt: result.fetchedAt,
    stale: result.stale,
  };
}

/**
 * Read a token's USD price from a DEX Screener batch response.
 *
 * `priceUsd` always describes the pair's base token, so we only accept pairs
 * where the requested address is the base. When several pools match we take the
 * deepest one — that is the price the aggregator itself surfaces.
 */
export function priceFromPairs(pairs: DsPair[], tokenAddress: string): number | null {
  const target = tokenAddress.toLowerCase();
  const matching = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === target);
  if (matching.length === 0) return null;
  const deepest = [...matching].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const parsed = Number(deepest?.priceUsd);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Choose the DEX Screener pair with the deepest liquidity (optionally the one matching a pool). */
export function pickDsPair(pairs: DsPair[], pool?: string | null, tokenAddress?: string | null): DsPair | null {
  if (pairs.length === 0) return null;
  const normalizedPool = pool?.toLowerCase();
  const normalizedToken = tokenAddress?.toLowerCase();
  if (normalizedPool) {
    const exact = pairs.find((p) => p.pairAddress.toLowerCase() === normalizedPool);
    if (exact) return exact;
  }
  const candidates = normalizedToken
    ? pairs.filter((p) => p.baseToken?.address?.toLowerCase() === normalizedToken)
    : pairs;
  const poolList = candidates.length > 0 ? candidates : pairs;
  return [...poolList].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
}
