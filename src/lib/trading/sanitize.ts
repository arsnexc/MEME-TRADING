import { isNetworkId, QUOTE_CURRENCIES, type NetworkId, type QuoteCurrency } from "@/lib/constants";
import { DEFAULT_FEE_BPS, DEFAULT_SLIPPAGE_BPS, INITIAL_PAPER_BALANCE, MAX_FEE_BPS, MAX_SLIPPAGE_BPS } from "./engine";
import { d, isNonNegativeFinite, isPositiveFinite } from "./decimals";
import type {
  LimitOrder,
  LimitOrderStatus,
  PaperAccountBalances,
  PaperSnapshot,
  Position,
  TokenRef,
  Trade,
} from "./types";

export const PAPER_STORE_VERSION = 1;
export const PAPER_STORE_KEY = "memescope.paper.v1";
const ORDER_STATUSES: LimitOrderStatus[] = ["open", "filled", "cancelled", "failed"];
const MAX_POSITIONS = 250;
const MAX_TRADES = 1_000;
const MAX_ORDERS = 400;
const MAX_ID_LENGTH = 160;
const MAX_SYMBOL_LENGTH = 40;

function defaultBalances(): PaperAccountBalances {
  return { SOL: INITIAL_PAPER_BALANCE, ETH: INITIAL_PAPER_BALANCE };
}

export function createInitialSnapshot(): PaperSnapshot {
  return {
    balances: defaultBalances(),
    initialBalances: defaultBalances(),
    positions: [],
    trades: [],
    orders: [],
    realizedPnl: { SOL: 0, ETH: 0 },
    feesPaid: { SOL: 0, ETH: 0 },
    feeRateBps: DEFAULT_FEE_BPS,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, max = MAX_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function safeTimestamp(value: unknown): number | null {
  if (!isPositiveFinite(value)) return null;
  if (value < 1_000_000_000_000 || value > Date.now() + 86_400_000) return null;
  return Math.floor(value);
}

function sanitizeToken(value: unknown): TokenRef | null {
  if (!isRecord(value)) return null;
  const network = value.network;
  if (!isNetworkId(network)) return null;
  const address = safeString(value.address, 100);
  const pool = safeString(value.pool, 120);
  const symbol = safeString(value.symbol, MAX_SYMBOL_LENGTH);
  const name = safeString(value.name, 80);
  if (!address || !pool || !symbol || !name) return null;
  const imageUrl = typeof value.imageUrl === "string" && value.imageUrl.startsWith("http") ? value.imageUrl.slice(0, 500) : null;
  return { network, address, pool, symbol, name, imageUrl };
}

function sanitizeQuote(value: unknown): QuoteCurrency | null {
  return typeof value === "string" && (QUOTE_CURRENCIES as string[]).includes(value) ? (value as QuoteCurrency) : null;
}

function sanitizePosition(value: unknown): Position | null {
  if (!isRecord(value)) return null;
  const token = sanitizeToken(value.token);
  const quote = sanitizeQuote(value.quote);
  const id = safeString(value.id);
  const quantity = value.quantity;
  const avgEntryPrice = value.avgEntryPrice;
  const costBasis = value.costBasis;
  const openedAt = safeTimestamp(value.openedAt);
  const updatedAt = safeTimestamp(value.updatedAt);
  const lastPriceAt = (value.lastPriceAt as number) ?? openedAt;

  if (!token || !quote || !id) return null;
  if (!isNonNegativeFinite(quantity) || !isPositiveFinite(avgEntryPrice)) return null;
  if (!isNonNegativeFinite(costBasis) || !isNonNegativeFinite(value.realizedPnl) || !isNonNegativeFinite(value.feesPaid)) {
    return null;
  }
  if (!openedAt || !updatedAt) return null;
  if (!isPositiveFinite(value.lastPriceQuote)) return null;
  if (quantity <= 1e-9) return null;

  const normalizedCostBasis = d(quantity * avgEntryPrice);
  const basis = Math.abs(normalizedCostBasis - costBasis) / Math.max(normalizedCostBasis, 1e-9) > 0.001
    ? normalizedCostBasis
    : d(costBasis);

  // Protection levels are optional and additive; older snapshots simply have
  // none. A level on the wrong side of entry is discarded rather than throwing
  // the whole position away.
  const rawTakeProfit = isPositiveFinite(value.takeProfitPrice) ? d(value.takeProfitPrice) : null;
  const rawStopLoss = isPositiveFinite(value.stopLossPrice) ? d(value.stopLossPrice) : null;
  const takeProfitPrice = rawTakeProfit != null && rawTakeProfit > avgEntryPrice ? rawTakeProfit : null;
  const stopLossPrice = rawStopLoss != null && rawStopLoss < avgEntryPrice ? rawStopLoss : null;

  return {
    id,
    token,
    quote,
    quantity: d(quantity),
    avgEntryPrice: d(avgEntryPrice),
    costBasis: basis,
    realizedPnl: d(value.realizedPnl),
    feesPaid: d(value.feesPaid),
    openedAt,
    updatedAt,
    lastPriceQuote: d(value.lastPriceQuote),
    lastPriceAt: safeTimestamp(lastPriceAt) ?? updatedAt,
    takeProfitPrice,
    stopLossPrice,
  };
}

function sanitizeTrade(value: unknown): Trade | null {
  if (!isRecord(value)) return null;
  const token = sanitizeToken(value.token);
  const quote = sanitizeQuote(value.quote);
  const id = safeString(value.id);
  const side = value.side === "buy" || value.side === "sell" ? value.side : null;
  const orderKind = value.orderKind === "limit" ? "limit" : "market";
  const at = safeTimestamp(value.at);
  if (!token || !quote || !id || !side || !at) return null;
  const numericKeys: (keyof Trade)[] = ["quantity", "priceQuote", "priceUsd", "notional", "fee", "total"];
  for (const key of numericKeys) {
    if (!isNonNegativeFinite(value[key as string])) return null;
  }
  if (!isPositiveFinite(value.quantity) || !isPositiveFinite(value.priceQuote)) return null;
  const realized = value.realizedPnl;
  return {
    id,
    token,
    quote,
    side,
    orderKind,
    quantity: d(value.quantity as number),
    priceQuote: d(value.priceQuote as number),
    priceUsd: d(value.priceUsd as number),
    notional: d(value.notional as number),
    fee: d(value.fee as number),
    priorityFee: isNonNegativeFinite(value.priorityFee) ? d(value.priorityFee) : 0,
    total: d(value.total as number),
    realizedPnl: typeof realized === "number" && Number.isFinite(realized) && Math.abs(realized) < 1e15 ? d(realized) : null,
    at,
    ...(typeof value.orderId === "string" ? { orderId: value.orderId.slice(0, MAX_ID_LENGTH) } : {}),
  };
}

function sanitizeOrder(value: unknown): LimitOrder | null {
  if (!isRecord(value)) return null;
  const token = sanitizeToken(value.token);
  const quote = sanitizeQuote(value.quote);
  const id = safeString(value.id);
  const side = value.side === "buy" || value.side === "sell" ? value.side : null;
  const status = typeof value.status === "string" && (ORDER_STATUSES as string[]).includes(value.status)
    ? (value.status as LimitOrderStatus)
    : null;
  const createdAt = safeTimestamp(value.createdAt);
  const updatedAt = safeTimestamp(value.updatedAt);
  if (!token || !quote || !id || !side || !status || !createdAt || !updatedAt) return null;
  if (!isPositiveFinite(value.limitPrice) || !isPositiveFinite(value.amount)) return null;
  if (!isNonNegativeFinite(value.feeRateBps) || !isNonNegativeFinite(value.slippageBps)) return null;
  return {
    id,
    token,
    quote,
    side,
    limitPrice: d(value.limitPrice),
    amount: d(value.amount),
    status,
    createdAt,
    updatedAt,
    feeRateBps: Math.min(value.feeRateBps, MAX_FEE_BPS),
    slippageBps: Math.min(value.slippageBps, MAX_SLIPPAGE_BPS),
    ...(typeof value.filledTradeId === "string" ? { filledTradeId: value.filledTradeId.slice(0, MAX_ID_LENGTH) } : {}),
    ...(typeof value.failureReason === "string" ? { failureReason: value.failureReason.slice(0, 240) } : {}),
  };
}

function sanitizeBalanceMap(value: unknown): PaperAccountBalances {
  const fallback = defaultBalances();
  if (!isRecord(value)) return fallback;
  const out = { ...fallback };
  for (const quote of QUOTE_CURRENCIES) {
    const entry = value[quote];
    if (isNonNegativeFinite(entry)) out[quote] = d(entry);
  }
  return out;
}

function sanitizePnlMap(value: unknown): PaperAccountBalances {
  const out: PaperAccountBalances = { SOL: 0, ETH: 0 };
  if (!isRecord(value)) return out;
  for (const quote of QUOTE_CURRENCIES) {
    const entry = value[quote];
    if (typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) < 1e15) out[quote] = d(entry);
  }
  return out;
}

/**
 * Validate everything restored from localStorage. Returns null when the shape
 * is not a usable snapshot, which makes the store fall back to a fresh account
 * instead of rendering corrupted balances.
 */
export function sanitizePaperSnapshot(raw: unknown): PaperSnapshot | null {
  if (!isRecord(raw)) return null;
  // Persist stores { state, version }; accept either the wrapper or a bare state.
  const candidate = isRecord(raw.state) ? raw.state : raw;
  if (isRecord(raw) && "version" in raw && raw.version !== PAPER_STORE_VERSION) return null;

  const positions: Position[] = [];
  if (Array.isArray(candidate.positions)) {
    for (const item of candidate.positions.slice(0, MAX_POSITIONS)) {
      const position = sanitizePosition(item);
      if (position) positions.push(position);
    }
  }

  const trades: Trade[] = [];
  if (Array.isArray(candidate.trades)) {
    for (const item of candidate.trades.slice(0, MAX_TRADES)) {
      const trade = sanitizeTrade(item);
      if (trade) trades.push(trade);
    }
  }

  const orders: LimitOrder[] = [];
  if (Array.isArray(candidate.orders)) {
    for (const item of candidate.orders.slice(0, MAX_ORDERS)) {
      const order = sanitizeOrder(item);
      if (order) orders.push(order);
    }
  }

  const feeRateBps = isNonNegativeFinite(candidate.feeRateBps)
    ? Math.min(candidate.feeRateBps, MAX_FEE_BPS)
    : DEFAULT_FEE_BPS;
  const slippageBps = isNonNegativeFinite(candidate.slippageBps)
    ? Math.min(candidate.slippageBps, MAX_SLIPPAGE_BPS)
    : DEFAULT_SLIPPAGE_BPS;

  const balances = sanitizeBalanceMap(candidate.balances);
  const initialBalances = sanitizeBalanceMap(candidate.initialBalances);
  const hasAnyState =
    positions.length > 0 || trades.length > 0 || orders.length > 0 || candidate.balances !== undefined;
  if (!hasAnyState) return null;

  return {
    balances,
    initialBalances,
    positions,
    trades,
    orders,
    realizedPnl: sanitizePnlMap(candidate.realizedPnl),
    feesPaid: sanitizePnlMap(candidate.feesPaid),
    feeRateBps,
    slippageBps,
  };
}

/**
 * Storage adapter that drops unreadable payloads instead of surfacing parse
 * errors. `validate` runs against the parsed `{state, version}` wrapper so a
 * corrupted store is cleared rather than partially applied.
 */
export function createSafeStorage(validate?: (parsed: unknown) => boolean) {
  return {
    getItem: (name: string): string | null => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(name);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (validate && !validate(parsed)) {
          window.localStorage.removeItem(name);
          return null;
        }
        return raw;
      } catch {
        try {
          window.localStorage.removeItem(name);
        } catch {
          // Storage may be blocked entirely (private mode); callers fall back to memory.
        }
        return null;
      }
    },
    setItem: (name: string, value: string): void => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(name, value);
      } catch {
        // Quota or privacy-mode failure: keep trading in memory for this session.
      }
    },
    removeItem: (name: string): void => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Ignore.
      }
    },
  };
}

export function createPaperRawStorage() {
  return createSafeStorage((parsed) => sanitizePaperSnapshot(parsed) !== null);
}

export function snapshotOf(state: PaperSnapshot): PaperSnapshot {
  return {
    balances: state.balances,
    initialBalances: state.initialBalances,
    positions: state.positions,
    trades: state.trades,
    orders: state.orders,
    realizedPnl: state.realizedPnl,
    feesPaid: state.feesPaid,
    feeRateBps: state.feeRateBps,
    slippageBps: state.slippageBps,
  };
}

export function tokenIdentity(network: NetworkId, address: string): string {
  return `${network}:${address}`;
}
