import type { ChartTimeframe, NetworkId, QuoteCurrency, ScannerTimeframe } from "@/lib/constants";

export type AuthorityStatus = "unknown" | "revoked" | "active";
export type TimeframeValues = Record<ScannerTimeframe, number | null>;

export interface TxCounts {
  buys: number;
  sells: number;
  buyers?: number | null;
  sellers?: number | null;
}

export type TxCountsMap = Partial<Record<ScannerTimeframe, TxCounts>>;

export interface SocialLink {
  type: string;
  url: string;
}

export interface SecurityInfo {
  /** Percentage of pool liquidity reported as locked by the data provider. Null = unknown. */
  lpLockedPct: number | null;
  /** Holder concentration is not supplied by either free API in use. Null = unknown. */
  topHolderPct: number | null;
  /** Authority checks require a chain RPC/indexer we do not run. Always unknown here. */
  mintAuthority: AuthorityStatus;
  freezeAuthority: AuthorityStatus;
  /** Verified creator/dev holdings are not available from the data sources in use. */
  devHoldingsPct: number | null;
  dataSource: string | null;
  note: string;
}

export interface MarketToken {
  /** Stable internal id: `${network}:${pool}` */
  id: string;
  network: NetworkId;
  quote: QuoteCurrency;
  pool: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  /** True when marketCapUsd is derived from fully-diluted value because circulating supply was unavailable. */
  marketCapIsFdv: boolean;
  liquidityUsd: number | null;
  volumeUsd: TimeframeValues;
  changePct: TimeframeValues;
  txns: TxCountsMap;
  poolCreatedAt: number | null;
  imageUrl: string | null;
  websites: string[];
  socials: SocialLink[];
  dexId: string | null;
  dexscreenerUrl: string | null;
  security: SecurityInfo;
  source: "geckoterminal+dexscreener" | "geckoterminal" | "dexscreener";
  updatedAt: number;
}

export interface QuotePrice {
  usd: number;
  at: number;
}

export interface QuotePrices {
  SOL: QuotePrice | null;
  ETH: QuotePrice | null;
  fetchedAt: number;
}

export interface MarketsResponse {
  tokens: MarketToken[];
  tab: string;
  fetchedAt: number;
  quotePrices: QuotePrices;
  stale: boolean;
  warnings: string[];
}

/** Batched price refresh for portfolios and trackers (one call per network). */
export interface QuotesResponse {
  tokens: MarketToken[];
  quotePrices: QuotePrices;
  fetchedAt: number;
  stale: boolean;
  warnings: string[];
}

export interface TokenDetailResponse {
  market: MarketToken;
  dexName: string | null;
  quotePrices: QuotePrices;
  fetchedAt: number;
  stale: boolean;
  warnings: string[];
}

export interface Candle {
  /** Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResponse {
  candles: Candle[];
  timeframe: ChartTimeframe;
  fetchedAt: number;
  stale: boolean;
  source: "geckoterminal";
  warnings: string[];
}

export interface MarketTrade {
  id: string;
  side: "buy" | "sell";
  priceUsd: number;
  baseAmount: number;
  valueUsd: number;
  wallet: string;
  txHash: string;
  at: number;
}

export interface TradesResponse {
  trades: MarketTrade[];
  fetchedAt: number;
  stale: boolean;
  warnings: string[];
  window: {
    count: number;
    from: number | null;
    to: number | null;
    /** The provider caps this feed; derived aggregates cover only this window. */
    complete: false;
  };
}

export interface PoolPriceResponse {
  network: string;
  pool: string;
  priceUsd: number;
  /** Provider timestamp for the quote, not when we asked for it. */
  fetchedAt: number;
  source: "dexscreener";
}

export interface SearchResponse {
  tokens: MarketToken[];
  fetchedAt: number;
  query: string;
}

export type UpstreamErrorCode = "rate_limited" | "timeout" | "http" | "malformed" | "network";

export class UpstreamError extends Error {
  code: UpstreamErrorCode;
  status: number;
  provider: string;
  /** Suggested client backoff in milliseconds (set for rate limits). */
  retryAfterMs: number | null;

  constructor(
    code: UpstreamErrorCode,
    message: string,
    opts: { status?: number; provider?: string; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "UpstreamError";
    this.code = code;
    this.status = opts.status ?? (code === "rate_limited" ? 429 : 502);
    this.provider = opts.provider ?? "unknown";
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

export const EMPTY_TIMEFRAMES: TimeframeValues = {
  m5: null,
  m15: null,
  m30: null,
  h1: null,
  h6: null,
  h24: null,
};

export const UNKNOWN_SECURITY_NOTE =
  "Security data is not provided by DEX Screener or GeckoTerminal. No mint/freeze authority or holder-concentration audit is performed in this build.";
