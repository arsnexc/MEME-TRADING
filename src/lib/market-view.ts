import type { NetworkId, ScannerTimeframe } from "@/lib/constants";
import type { MarketToken } from "@/lib/market-data/types";
import type { SortDirection, SortKey } from "@/stores/preferences";

export type NetworkFilter = "all" | NetworkId;

export interface FilterOptions {
  query?: string;
  timeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  minLiquidity?: number;
  network?: NetworkFilter;
}

/**
 * Rank by market cap inside the loaded universe.
 *
 * Rank is intentionally independent of the active sort and filters: filtering
 * to Solana keeps #7 as #7 instead of renumbering the visible rows. Tokens
 * without a market cap rank after everything that has one.
 */
export function rankByMarketCap(tokens: MarketToken[]): Map<string, number> {
  const ranked = [...tokens].sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  const ranks = new Map<string, number>();
  ranked.forEach((token, index) => ranks.set(token.id, index + 1));
  return ranks;
}

/** Largest N tokens by market cap — the screener's "Top 100" universe. */
export function topByMarketCap(tokens: MarketToken[], limit: number): MarketToken[] {
  return [...tokens]
    .sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1))
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
  const filtered = tokens.filter((token) => {
    if (options.network && options.network !== "all" && token.network !== options.network) return false;
    if (minLiquidity > 0 && (token.liquidityUsd ?? 0) < minLiquidity) return false;
    if (!query) return true;
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.tokenAddress.toLowerCase().includes(query)
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
