import type { NetworkId, QuoteCurrency } from "@/lib/constants";

export interface TokenRef {
  network: NetworkId;
  pool: string;
  address: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
}

export interface Position {
  id: string;
  token: TokenRef;
  quote: QuoteCurrency;
  quantity: number;
  /** Weighted-average entry price in quote currency, excluding fees. */
  avgEntryPrice: number;
  /** Remaining cost basis in quote currency (excludes fees). */
  costBasis: number;
  realizedPnl: number;
  feesPaid: number;
  openedAt: number;
  updatedAt: number;
  lastPriceQuote: number;
  lastPriceAt: number;
  /** Take-profit trigger in the account's quote currency (null = off). */
  takeProfitPrice?: number | null;
  /** Stop-loss trigger in the account's quote currency (null = off). */
  stopLossPrice?: number | null;
}

export interface Trade {
  id: string;
  token: TokenRef;
  quote: QuoteCurrency;
  side: "buy" | "sell";
  orderKind: "market" | "limit";
  quantity: number;
  /** Simulated fill price in the account's quote currency. */
  priceQuote: number;
  priceUsd: number;
  notional: number;
  fee: number;
  priorityFee: number;
  /** Buy: total debit from the quote balance. Sell: net proceeds credited. */
  total: number;
  realizedPnl: number | null;
  at: number;
  orderId?: string;
  /** Why the fill happened. Manual orders and limit fills are the default. */
  trigger?: "manual" | "limit" | "take-profit" | "stop-loss";
}

export type LimitOrderStatus = "open" | "filled" | "cancelled" | "failed";

export interface LimitOrder {
  id: string;
  token: TokenRef;
  quote: QuoteCurrency;
  side: "buy" | "sell";
  /** Limit price in quote currency per token. */
  limitPrice: number;
  /** Buy: quote notional. Sell: token quantity. */
  amount: number;
  status: LimitOrderStatus;
  createdAt: number;
  updatedAt: number;
  feeRateBps: number;
  slippageBps: number;
  filledTradeId?: string;
  failureReason?: string;
}

export type PaperAccountBalances = Record<QuoteCurrency, number>;

export interface PaperSnapshot {
  balances: PaperAccountBalances;
  initialBalances: PaperAccountBalances;
  positions: Position[];
  trades: Trade[];
  orders: LimitOrder[];
  realizedPnl: PaperAccountBalances;
  feesPaid: PaperAccountBalances;
  feeRateBps: number;
  slippageBps: number;
}

export type TradeErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "NO_QUOTE_PRICE"
  | "INSUFFICIENT_BALANCE"
  | "NO_POSITION"
  | "INSUFFICIENT_QUANTITY"
  | "INVALID_LIMIT_PRICE"
  | "ORDER_NOT_OPEN"
  | "INVALID_QUOTE"
  | "INVALID_TOKEN";

export interface TradeFailure {
  code: TradeErrorCode;
  message: string;
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: TradeFailure };

export interface BuyPlan {
  notional: number;
  referencePrice: number;
  fillPrice: number;
  quantity: number;
  fee: number;
  priorityFee: number;
  totalDebit: number;
  priceUsd: number;
  at: number;
  feeRateBps: number;
  slippageBps: number;
}

export interface SellPlan {
  quantity: number;
  referencePrice: number;
  fillPrice: number;
  gross: number;
  fee: number;
  netProceeds: number;
  costBasis: number;
  realizedPnl: number;
  priceUsd: number;
  at: number;
  feeRateBps: number;
  slippageBps: number;
}

export interface ProtectionLevels {
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
}

export interface BuyInput {
  token: TokenRef;
  quote: QuoteCurrency;
  /** Pre-fee notional in quote currency. */
  amountQuote: number;
  priceUsd: number;
  quoteUsd: number;
  balance: number;
  feeRateBps: number;
  slippageBps: number;
  priorityFeeQuote?: number;
  at?: number;
}

export interface SellInput {
  token: TokenRef;
  quote: QuoteCurrency;
  positionId: string;
  quantity: number;
  priceUsd: number;
  quoteUsd: number;
  avgEntryPrice: number;
  feeRateBps: number;
  slippageBps: number;
  at?: number;
}

export interface PriceTick {
  network: NetworkId;
  address: string;
  pool: string;
  priceUsd: number;
  quoteUsd: number;
  at: number;
}

export interface UnrealizedPnl {
  marketValue: number;
  exitFee: number;
  grossPnl: number;
  netPnl: number;
  pct: number;
  includesExitFee: true;
}
