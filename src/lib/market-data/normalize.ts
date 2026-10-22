import { NETWORKS, type NetworkId, type ScannerTimeframe } from "@/lib/constants";
import type { DsPair } from "./dexscreener";
import type { GtPool } from "./geckoterminal";
import {
  EMPTY_TIMEFRAMES,
  UNKNOWN_SECURITY_NOTE,
  type MarketToken,
  type SecurityInfo,
  type SocialLink,
  type TxCountsMap,
  type TimeframeValues,
} from "./types";

const SCANNER_KEYS: ScannerTimeframe[] = ["m5", "m15", "m30", "h1", "h6", "h24"];

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timeMap(source: Record<string, string | null | undefined> | null | undefined, transform?: (n: number) => number): TimeframeValues {
  const out: TimeframeValues = { ...EMPTY_TIMEFRAMES };
  if (!source) return out;
  for (const key of SCANNER_KEYS) {
    const raw = num(source[key]);
    out[key] = raw == null ? null : transform ? transform(raw) : raw;
  }
  return out;
}

function dsTimeMap(source: Record<string, number | undefined> | null | undefined): TimeframeValues {
  const out: TimeframeValues = { ...EMPTY_TIMEFRAMES };
  if (!source) return out;
  for (const key of SCANNER_KEYS) {
    const raw = num(source[key]);
    // DEX Screener exposes m5, h1, h6 and h24 only. Leave the rest null (unknown).
    out[key] = raw;
  }
  return out;
}

function parseTxns(
  source: Record<string, { buys: number; sells: number; buyers?: number; sellers?: number }> | null | undefined,
): TxCountsMap {
  const out: TxCountsMap = {};
  if (!source) return out;
  for (const key of SCANNER_KEYS) {
    const entry = source[key];
    if (!entry || typeof entry.buys !== "number" || typeof entry.sells !== "number") continue;
    out[key] = {
      buys: entry.buys,
      sells: entry.sells,
      buyers: typeof entry.buyers === "number" ? entry.buyers : null,
      sellers: typeof entry.sellers === "number" ? entry.sellers : null,
    };
  }
  return out;
}

function dsTxns(pair: DsPair): TxCountsMap {
  const out: TxCountsMap = {};
  if (!pair.txns) return out;
  for (const key of SCANNER_KEYS) {
    const entry = pair.txns[key];
    if (!entry) continue;
    out[key] = { buys: entry.buys, sells: entry.sells };
  }
  return out;
}

function timestamp(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function tokenAddressFromRelationshipId(id: string | undefined, network: NetworkId): string | null {
  if (!id) return null;
  const prefix = `${network}_`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function poolNameParts(name: string | undefined): { name: string; symbol: string } {
  if (!name) return { name: "Unknown token", symbol: "???" };
  const base = name.split("/")[0]?.trim() ?? name;
  const symbol = base.split(" ")[0]?.trim() || base;
  return { name: base || name, symbol };
}

function securityFromGt(pool: GtPool): SecurityInfo {
  const locked = num(pool.attributes.locked_liquidity_percentage);
  return {
    lpLockedPct: locked,
    topHolderPct: null,
    mintAuthority: "unknown",
    freezeAuthority: "unknown",
    devHoldingsPct: null,
    dataSource: locked == null ? null : "GeckoTerminal (locked liquidity)",
    note: UNKNOWN_SECURITY_NOTE,
  };
}

function socialsFromDs(pair: DsPair | null): SocialLink[] {
  if (!pair?.info?.socials) return [];
  return pair.info.socials
    .filter((s): s is SocialLink => typeof s?.url === "string" && s.url.startsWith("http"))
    .map((s) => ({ type: typeof s.type === "string" ? s.type : "link", url: s.url }))
    .slice(0, 5);
}

function websitesFromDs(pair: DsPair | null): string[] {
  if (!pair?.info?.websites) return [];
  return pair.info.websites
    .map((w) => w?.url)
    .filter((url): url is string => typeof url === "string" && url.startsWith("http"))
    .slice(0, 3);
}

export interface NormalizeContext {
  now?: number;
}

/**
 * Merge a GeckoTerminal pool (metrics, OHLCV-capable pool address) with an
 * optional DEX Screener pair (logos, socials, circulating market cap).
 */
export function normalizeGtPool(
  pool: GtPool,
  network: NetworkId,
  dsPair: DsPair | null,
  context: NormalizeContext = {},
): MarketToken | null {
  const now = context.now ?? Date.now();
  const baseTokenId = pool.relationships?.base_token?.data?.id;
  const address = tokenAddressFromRelationshipId(baseTokenId, network);
  if (!address || !pool.attributes?.address) return null;

  const parts = poolNameParts(pool.attributes.name);
  const name = dsPair?.baseToken?.name?.trim() || parts.name;
  const symbol = dsPair?.baseToken?.symbol?.trim() || parts.symbol;

  const gtPrice = num(pool.attributes.base_token_price_usd);
  const dsPrice = num(dsPair?.priceUsd);
  const priceUsd = dsPrice ?? gtPrice;

  const gtVolume = timeMap(pool.attributes.volume_usd);
  const dsVolume = dsTimeMap(dsPair?.volume);
  const volumeUsd: TimeframeValues = { ...gtVolume };
  for (const key of SCANNER_KEYS) {
    if (volumeUsd[key] == null && dsVolume[key] != null) volumeUsd[key] = dsVolume[key];
  }

  const gtChange = timeMap(pool.attributes.price_change_percentage);
  const dsChange = dsTimeMap(dsPair?.priceChange);
  const changePct: TimeframeValues = { ...gtChange };
  for (const key of SCANNER_KEYS) {
    if (changePct[key] == null && dsChange[key] != null) changePct[key] = dsChange[key];
  }

  const gtTxns = parseTxns(pool.attributes.transactions);
  const dsTx = dsPair ? dsTxns(dsPair) : {};
  const txns: TxCountsMap = { ...gtTxns };
  for (const key of SCANNER_KEYS) {
    if (!txns[key] && dsTx[key]) txns[key] = dsTx[key];
  }

  const dsMarketCap = num(dsPair?.marketCap);
  const dsFdv = num(dsPair?.fdv);
  const gtMarketCap = num(pool.attributes.market_cap_usd);
  const gtFdv = num(pool.attributes.fdv_usd);
  const circulating = dsMarketCap ?? gtMarketCap;
  const fdv = dsFdv ?? gtFdv;
  const marketCapUsd = circulating ?? fdv ?? null;

  const liquidityUsd = num(dsPair?.liquidity?.usd) ?? num(pool.attributes.reserve_in_usd);
  const dexId = pool.relationships?.dex?.data?.id ?? dsPair?.dexId ?? null;

  return {
    id: `${network}:${pool.attributes.address}`,
    network,
    quote: NETWORKS[network].quote,
    pool: pool.attributes.address,
    tokenAddress: address,
    name,
    symbol,
    priceUsd: priceUsd && priceUsd > 0 ? priceUsd : null,
    marketCapUsd,
    fdvUsd: fdv,
    marketCapIsFdv: circulating == null && fdv != null,
    liquidityUsd,
    volumeUsd,
    changePct,
    txns,
    poolCreatedAt: timestamp(pool.attributes.pool_created_at),
    imageUrl: dsPair?.info?.imageUrl ?? null,
    websites: websitesFromDs(dsPair),
    socials: socialsFromDs(dsPair),
    dexId,
    dexscreenerUrl: dsPair?.url ?? (pool.attributes.address
      ? `https://dexscreener.com/${NETWORKS[network].dexscreenerId}/${pool.attributes.address}`
      : null),
    security: securityFromGt(pool),
    source: dsPair ? "geckoterminal+dexscreener" : "geckoterminal",
    updatedAt: now,
  };
}

/** Build a row from a DEX Screener pair when no GeckoTerminal pool is available (e.g. search). */
export function normalizeDsPair(pair: DsPair, network: NetworkId, context: NormalizeContext = {}): MarketToken | null {
  const now = context.now ?? Date.now();
  const address = pair.baseToken?.address;
  if (!address || !pair.pairAddress) return null;
  const priceUsd = num(pair.priceUsd);
  const marketCap = num(pair.marketCap);
  const fdv = num(pair.fdv);
  return {
    id: `${network}:${pair.pairAddress}`,
    network,
    quote: NETWORKS[network].quote,
    pool: pair.pairAddress,
    tokenAddress: address,
    name: pair.baseToken.name?.trim() || pair.baseToken.symbol || "Unknown token",
    symbol: pair.baseToken.symbol?.trim() || "???",
    priceUsd: priceUsd && priceUsd > 0 ? priceUsd : null,
    marketCapUsd: marketCap ?? fdv ?? null,
    fdvUsd: fdv,
    marketCapIsFdv: marketCap == null && fdv != null,
    liquidityUsd: num(pair.liquidity?.usd),
    volumeUsd: dsTimeMap(pair.volume),
    changePct: dsTimeMap(pair.priceChange),
    txns: dsTxns(pair),
    poolCreatedAt: num(pair.pairCreatedAt),
    imageUrl: pair.info?.imageUrl ?? null,
    websites: websitesFromDs(pair),
    socials: socialsFromDs(pair),
    dexId: pair.dexId ?? null,
    dexscreenerUrl: pair.url ?? null,
    security: {
      lpLockedPct: null,
      topHolderPct: null,
      mintAuthority: "unknown",
      freezeAuthority: "unknown",
      devHoldingsPct: null,
      dataSource: null,
      note: UNKNOWN_SECURITY_NOTE,
    },
    source: "dexscreener",
    updatedAt: now,
  };
}

export function dedupeTokens(tokens: MarketToken[]): MarketToken[] {
  const byToken = new Map<string, MarketToken>();
  for (const token of tokens) {
    const key = `${token.network}:${token.tokenAddress.toLowerCase()}`;
    const existing = byToken.get(key);
    if (!existing) {
      byToken.set(key, token);
      continue;
    }
    const existingScore = (existing.liquidityUsd ?? 0) + (existing.volumeUsd.h24 ?? 0);
    const candidateScore = (token.liquidityUsd ?? 0) + (token.volumeUsd.h24 ?? 0);
    if (candidateScore > existingScore) byToken.set(key, token);
  }
  return [...byToken.values()];
}

export function hasEnoughMarketData(token: MarketToken): boolean {
  return token.priceUsd != null && token.liquidityUsd != null && token.liquidityUsd > 0;
}
