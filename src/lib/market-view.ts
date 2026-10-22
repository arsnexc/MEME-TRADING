import {
  SCANNER_TIMEFRAMES,
  type NetworkId,
  type ScannerTimeframe,
} from "@/lib/constants";
import {
  type MarketToken,
  type SocialLink,
  type TimeframeValues,
  type TxCounts,
  type TxCountsMap,
} from "@/lib/market-data/types";
import type { SortDirection, SortKey } from "@/stores/preferences";

export type NetworkFilter = "all" | NetworkId;

/**
 * One screener row: a token, not a pool.
 *
 * A memecoin usually has several pools on the same chain. Listing each pool as
 * its own row would show the same coin three times and split its volume, so the
 * screener merges them per token. `poolCount` is what lets the UI say so.
 */
export interface ScreenerRow extends MarketToken {
  /** Pools merged into this row. 1 for a single-pool token. */
  poolCount: number;
  /**
   * 24h volume ÷ market cap, the turnover ratio professional screeners show.
   * Null when either side is unpublished — never zero-filled.
   */
  turnover: number | null;
}

export interface FilterOptions {
  query?: string;
  timeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  minLiquidity?: number;
  minVolume?: number;
  network?: NetworkFilter;
  watched?: Set<string>;
  watchedOnly?: boolean;
}

/** Stable per-token key. EVM addresses are case-insensitive; Solana's are not. */
export function tokenKey(token: Pick<MarketToken, "network" | "tokenAddress">): string {
  const address = token.tokenAddress.startsWith("0x")
    ? token.tokenAddress.toLowerCase()
    : token.tokenAddress;
  return `${token.network}:${address}`;
}

/** Sum only when every contributor published the figure, so totals never understate. */
function sumIfComplete(values: (number | null | undefined)[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

/** Sum of the values that exist, or null when none do. Used for universe totals. */
export function sumKnown(values: (number | null | undefined)[]): number | null {
  let total = 0;
  let seen = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    seen += 1;
  }
  return seen > 0 ? total : null;
}

/** Deepest pool first: it carries the price and the chart the row links to. */
function byPoolDepth(a: MarketToken, b: MarketToken): number {
  return (
    (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1) ||
    (b.volumeUsd.h24 ?? -1) - (a.volumeUsd.h24 ?? -1) ||
    (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1)
  );
}

function mergeSocials(pools: MarketToken[]): SocialLink[] {
  const seen = new Set<string>();
  const merged: SocialLink[] = [];
  for (const pool of pools) {
    for (const social of pool.socials) {
      if (seen.has(social.url)) continue;
      seen.add(social.url);
      merged.push(social);
    }
  }
  return merged;
}

function mergeWebsites(pools: MarketToken[]): string[] {
  return [...new Set(pools.flatMap((pool) => pool.websites))];
}

/**
 * Fold every loaded pool into one row per token.
 *
 * The row keeps the deepest pool's identity, price and change, so the price and
 * the percentage always describe the same market. Volume, liquidity and trade
 * counts are summed across every pool of that token in the loaded page, and are
 * reported as unknown when any contributing pool left the field blank.
 */
export function aggregateByToken(tokens: MarketToken[]): ScreenerRow[] {
  const groups = new Map<string, MarketToken[]>();
  for (const token of tokens) {
    const key = tokenKey(token);
    const list = groups.get(key);
    if (list) list.push(token);
    else groups.set(key, [token]);
  }

  const rows: ScreenerRow[] = [];
  for (const pools of groups.values()) {
    const sorted = [...pools].sort(byPoolDepth);
    const lead = sorted[0];

    const volumeUsd = {} as TimeframeValues;
    const txns: TxCountsMap = {};
    for (const window of SCANNER_TIMEFRAMES) {
      const timeframe = window.value;
      volumeUsd[timeframe] = sumIfComplete(sorted.map((pool) => pool.volumeUsd[timeframe] ?? null));
      const counts = sorted.map((pool) => pool.txns[timeframe]);
      if (counts.some((entry) => entry == null)) continue;
      const complete = counts as TxCounts[];
      txns[timeframe] = {
        buys: sumKnown(complete.map((entry) => entry.buys)) ?? 0,
        sells: sumKnown(complete.map((entry) => entry.sells)) ?? 0,
        buyers: sumIfComplete(complete.map((entry) => entry.buyers ?? null)),
        sellers: sumIfComplete(complete.map((entry) => entry.sellers ?? null)),
      };
    }

    const created = sorted
      .map((pool) => pool.poolCreatedAt)
      .filter((value): value is number => value != null);

    // Market cap is per token, not per pool: take the deepest pool's figure and
    // fall back to the first pool that publishes one (never to a sum, which would
    // multiply the price by the sum of supplies).
    const marketCapSource = sorted.find((pool) => pool.marketCapUsd != null) ?? null;
    const marketCapUsd = lead.marketCapUsd ?? marketCapSource?.marketCapUsd ?? null;
    const marketCapIsFdv = lead.marketCapUsd != null ? lead.marketCapIsFdv : (marketCapSource?.marketCapIsFdv ?? false);

    const volume = volumeUsd.h24;
    const turnover =
      volume != null && marketCapUsd != null && marketCapUsd > 0 ? volume / marketCapUsd : null;

    rows.push({
      ...lead,
      marketCapUsd,
      marketCapIsFdv,
      fdvUsd: lead.fdvUsd ?? sorted.find((pool) => pool.fdvUsd != null)?.fdvUsd ?? null,
      liquidityUsd: sumIfComplete(sorted.map((pool) => pool.liquidityUsd ?? null)) ?? lead.liquidityUsd,
      volumeUsd,
      txns,
      // Age is the token's age: its oldest known pool, not the newest duplicate.
      poolCreatedAt: created.length > 0 ? Math.min(...created) : null,
      imageUrl: lead.imageUrl ?? sorted.find((pool) => pool.imageUrl)?.imageUrl ?? null,
      websites: mergeWebsites(sorted),
      socials: mergeSocials(sorted),
      poolCount: sorted.length,
      turnover,
    });
  }

  // A stable, deterministic order for callers that do not sort immediately.
  return rows.sort((a, b) => byPoolDepth(a, b));
}

/**
 * Rank by market cap inside the loaded universe.
 *
 * Rank is intentionally independent of the active sort and filters: filtering
 * to Solana keeps #7 as #7 instead of renumbering the visible rows. Tokens
 * without a market cap rank after everything that has one.
 */
export function rankByMarketCap(tokens: MarketToken[]): Map<string, number> {
  const ranked = [...tokens].sort(
    (a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1) || (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1),
  );
  const ranks = new Map<string, number>();
  ranked.forEach((token, index) => ranks.set(token.id, index + 1));
  return ranks;
}

/** Largest N tokens by market cap — the screener's "Top 100" universe. */
export function topByMarketCap<T extends MarketToken>(tokens: T[], limit: number): T[] {
  return [...tokens]
    .sort(
      (a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1) || (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Unique wallets that traded in the window, as reported per side.
 *
 * A wallet that both bought and sold is counted on both sides, so this is a
 * trade-participant count, not a holder count — the pool APIs publish no
 * holder data and none is invented here.
 */
export function traderCount(token: MarketToken, timeframe: ScannerTimeframe): number | null {
  const txns = token.txns[timeframe];
  if (!txns) return null;
  const buyers = txns.buyers ?? null;
  const sellers = txns.sellers ?? null;
  if (buyers == null && sellers == null) return null;
  const total = (buyers ?? 0) + (sellers ?? 0);
  return total > 0 ? total : null;
}

export function sortValue(token: MarketToken, key: SortKey, timeframe: ScannerTimeframe): number | null {
  switch (key) {
    case "marketCap":
      return token.marketCapUsd;
    case "liquidity":
      return token.liquidityUsd;
    case "volume":
      return token.volumeUsd[timeframe];
    case "change":
      return token.changePct[timeframe];
    case "price":
      return token.priceUsd;
    case "age":
      return token.poolCreatedAt;
    case "txns": {
      const txns = aggregateTransactions(token, timeframe);
      return txns ? txns.buys + txns.sells : null;
    }
    case "traders":
      return traderCount(token, timeframe);
    default:
      return null;
  }
}

export function filterAndSortTokens(tokens: MarketToken[], options: FilterOptions): MarketToken[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const minLiquidity = options.minLiquidity ?? 0;
  const minVolume = options.minVolume ?? 0;
  const filtered = tokens.filter((token) => {
    if (options.network && options.network !== "all" && token.network !== options.network) return false;
    if (minLiquidity > 0 && (token.liquidityUsd ?? 0) < minLiquidity) return false;
    if (minVolume > 0 && (token.volumeUsd[options.timeframe] ?? 0) < minVolume) return false;
    if (options.watchedOnly && !options.watched?.has(tokenKey(token))) return false;
    if (!query) return true;
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.tokenAddress.toLowerCase().includes(query) ||
      token.pool.toLowerCase().includes(query)
    );
  });

  const direction = options.sortDirection === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    const aValue = sortValue(a, options.sortKey, options.timeframe);
    const bValue = sortValue(b, options.sortKey, options.timeframe);
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return (aValue - bValue) * direction;
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pages: number; start: number; end: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(items.length, start + pageSize);
  return { items: items.slice(start, end), page: safePage, pages, start, end };
}

export function aggregateTransactions(token: MarketToken, timeframe: ScannerTimeframe): { buys: number; sells: number } | null {
  const txns = token.txns[timeframe];
  if (!txns || (txns.buys === 0 && txns.sells === 0)) return null;
  return { buys: txns.buys, sells: txns.sells };
}

/** Median of the published values; null when nothing is published. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export interface ScreenerStats {
  count: number;
  advancing: number;
  declining: number;
  flat: number;
  /** Rows whose change window is unpublished — excluded from the breadth split. */
  unknown: number;
  medianChange: number | null;
  totalMarketCap: number | null;
  totalVolume: number | null;
  totalLiquidity: number | null;
  totalTraders: number | null;
  /** Total pools folded into the visible rows. */
  poolCount: number;
  best: { symbol: string; change: number } | null;
  worst: { symbol: string; change: number } | null;
}

/**
 * Market breadth for the rows currently on screen.
 *
 * Everything is computed from the loaded snapshot; when a value is missing it
 * stays null so the strip can print a dash instead of an invented number.
 */
export function screenerStats(rows: MarketToken[], timeframe: ScannerTimeframe): ScreenerStats {
  const changes: number[] = [];
  let advancing = 0;
  let declining = 0;
  let flat = 0;
  let best: { symbol: string; change: number } | null = null;
  let worst: { symbol: string; change: number } | null = null;

  for (const row of rows) {
    const change = row.changePct[timeframe];
    if (change == null) continue;
    changes.push(change);
    if (change > 0) advancing += 1;
    else if (change < 0) declining += 1;
    else flat += 1;
    if (best == null || change > best.change) best = { symbol: row.symbol, change };
    if (worst == null || change < worst.change) worst = { symbol: row.symbol, change };
  }

  return {
    count: rows.length,
    advancing,
    declining,
    flat,
    unknown: rows.length - changes.length,
    medianChange: median(changes),
    totalMarketCap: sumKnown(rows.map((row) => row.marketCapUsd)),
    totalVolume: sumKnown(rows.map((row) => row.volumeUsd[timeframe])),
    totalLiquidity: sumKnown(rows.map((row) => row.liquidityUsd)),
    totalTraders: sumKnown(rows.map((row) => traderCount(row, timeframe))),
    poolCount: rows.reduce((total, row) => total + ((row as Partial<ScreenerRow>).poolCount ?? 1), 0),
    best,
    worst,
  };
}
