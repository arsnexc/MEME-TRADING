"use client";

import { create, type StateCreator } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isNetworkId, networkQuote, type NetworkId, type QuoteCurrency } from "@/lib/constants";
import {
  applyBuyToPositions,
  applySellToPositions,
  computeBuyPlan,
  computeSellPlan,
  createBuyTrade,
  createSellTrade,
  DEFAULT_FEE_BPS,
  DEFAULT_SLIPPAGE_BPS,
  limitTriggered,
  MAX_FEE_BPS,
  MAX_SLIPPAGE_BPS,
  quantityForFraction,
  tokenKey,
} from "@/lib/trading/engine";
import { d, EPSILON, isPositiveFinite } from "@/lib/trading/decimals";
import {
  createInitialSnapshot,
  createPaperRawStorage,
  PAPER_STORE_KEY,
  PAPER_STORE_VERSION,
  sanitizePaperSnapshot,
  snapshotOf,
} from "@/lib/trading/sanitize";
import type {
  BuyPlan,
  EngineResult,
  LimitOrder,
  PaperSnapshot,
  PriceTick,
  SellPlan,
  TokenRef,
  Trade,
  TradeFailure,
} from "@/lib/trading/types";
import { uid } from "@/lib/utils";

const MAX_TRADE_HISTORY = 1_000;
const MAX_ORDER_HISTORY = 400;
const ORDER_STATUSES = ["open", "filled", "cancelled", "failed"] as const;

export interface BuyActionInput {
  token: TokenRef;
  amountQuote: number;
  priceUsd: number;
  quoteUsd: number;
  priorityFeeQuote?: number;
  at?: number;
}

export interface SellActionInput {
  positionId: string;
  quantity?: number;
  fraction?: number;
  priceUsd: number;
  quoteUsd: number;
  at?: number;
}

export interface PlaceLimitInput {
  token: TokenRef;
  side: "buy" | "sell";
  limitPrice: number;
  amount: number;
  quoteUsd: number;
  at?: number;
}

export interface ExecutionOutcome {
  trade: Trade;
  plan: BuyPlan | SellPlan;
  positionId: string | null;
}

export type ExecutionResult = { ok: true; value: ExecutionOutcome } | { ok: false; error: TradeFailure };

export interface PaperActions {
  buy: (input: BuyActionInput) => ExecutionResult;
  sell: (input: SellActionInput) => ExecutionResult;
  placeLimit: (input: PlaceLimitInput) => EngineResult<LimitOrder>;
  cancelLimit: (orderId: string) => EngineResult<LimitOrder>;
  processTicks: (ticks: PriceTick[]) => { fills: Trade[]; failures: LimitOrder[] };
  setFeeRateBps: (value: number) => void;
  setSlippageBps: (value: number) => void;
  resetAccount: () => void;
}

export type PaperStore = PaperSnapshot & PaperActions;

function fail(code: TradeFailure["code"], message: string): { ok: false; error: TradeFailure } {
  return { ok: false, error: { code, message } };
}

function normalizeToken(token: TokenRef): TokenRef | null {
  if (!token || !isNetworkId(token.network)) return null;
  const address = typeof token.address === "string" ? token.address.trim() : "";
  const pool = typeof token.pool === "string" ? token.pool.trim() : "";
  const symbol = typeof token.symbol === "string" ? token.symbol.trim().slice(0, 40) : "";
  const name = typeof token.name === "string" ? token.name.trim().slice(0, 80) : "";
  if (!address || !pool || !symbol || !name || address.length > 120 || pool.length > 120) return null;
  return {
    network: token.network,
    address,
    pool,
    symbol,
    name,
    imageUrl: typeof token.imageUrl === "string" && token.imageUrl.startsWith("http") ? token.imageUrl : null,
  };
}

function clampBps(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

const createPaperState: StateCreator<PaperStore> = (set, get) => ({
  ...createInitialSnapshot(),

  buy: (input) => {
    const token = normalizeToken(input.token);
    if (!token) return fail("INVALID_TOKEN", "This token reference is invalid.");
    const quote = networkQuote(token.network);
    const state = get();
    const planResult = computeBuyPlan({
      token,
      quote,
      amountQuote: input.amountQuote,
      priceUsd: input.priceUsd,
      quoteUsd: input.quoteUsd,
      balance: state.balances[quote],
      feeRateBps: state.feeRateBps,
      slippageBps: state.slippageBps,
      priorityFeeQuote: input.priorityFeeQuote,
      at: input.at,
    });
    if (!planResult.ok) return { ok: false, error: planResult.error };
    const plan = planResult.value;
    const { positions, positionId } = applyBuyToPositions(state.positions, plan, token, quote);
    const trade = createBuyTrade(plan, token, quote);

    set({
      balances: { ...state.balances, [quote]: d(Math.max(0, state.balances[quote] - plan.totalDebit)) },
      positions,
      trades: [trade, ...state.trades].slice(0, MAX_TRADE_HISTORY),
      feesPaid: { ...state.feesPaid, [quote]: d(state.feesPaid[quote] + plan.fee + plan.priorityFee) },
    });

    return { ok: true, value: { trade, plan, positionId } };
  },

  sell: (input) => {
    const state = get();
    const position = state.positions.find((p) => p.id === input.positionId);
    if (!position) return fail("NO_POSITION", "No open position was found for this token.");
    const requested =
      input.fraction != null ? quantityForFraction(position.quantity, input.fraction) : (input.quantity ?? 0);
    if (!isPositiveFinite(requested)) return fail("INVALID_AMOUNT", "Enter a sell quantity greater than zero.");
    if (requested > position.quantity + EPSILON) {
      return fail("INSUFFICIENT_QUANTITY", "Sell quantity exceeds the remaining position.");
    }
    const quantity = requested > position.quantity - EPSILON ? position.quantity : d(requested);
    const planResult = computeSellPlan({
      token: position.token,
      quote: position.quote,
      positionId: position.id,
      quantity,
      priceUsd: input.priceUsd,
      quoteUsd: input.quoteUsd,
      avgEntryPrice: position.avgEntryPrice,
      feeRateBps: state.feeRateBps,
      slippageBps: state.slippageBps,
      at: input.at,
    });
    if (!planResult.ok) return { ok: false, error: planResult.error };
    const plan = planResult.value;
    const positions = applySellToPositions(state.positions, plan, position.id);
    const trade = createSellTrade(plan, position.token, position.quote);

    set({
      balances: { ...state.balances, [position.quote]: d(state.balances[position.quote] + plan.netProceeds) },
      positions,
      trades: [trade, ...state.trades].slice(0, MAX_TRADE_HISTORY),
      realizedPnl: {
        ...state.realizedPnl,
        [position.quote]: d(state.realizedPnl[position.quote] + plan.realizedPnl),
      },
      feesPaid: { ...state.feesPaid, [position.quote]: d(state.feesPaid[position.quote] + plan.fee) },
    });

    return { ok: true, value: { trade, plan, positionId: position.id } };
  },

  placeLimit: (input) => {
    const token = normalizeToken(input.token);
    if (!token) return fail("INVALID_TOKEN", "This token reference is invalid.");
    const quote = networkQuote(token.network);
    if (!isPositiveFinite(input.limitPrice)) return fail("INVALID_LIMIT_PRICE", "Enter a limit price greater than zero.");
    if (!isPositiveFinite(input.amount)) return fail("INVALID_AMOUNT", "Enter an order amount greater than zero.");
    if (!isPositiveFinite(input.quoteUsd)) return fail("NO_QUOTE_PRICE", "The quote-currency reference price is unavailable.");
    if (input.side !== "buy" && input.side !== "sell") return fail("INVALID_AMOUNT", "Invalid order side.");

    const state = get();
    const at = input.at ?? Date.now();

    if (input.side === "buy") {
      const fee = d(input.amount * (state.feeRateBps / 10_000));
      if (d(input.amount + fee) > state.balances[quote] + EPSILON) {
        return fail("INSUFFICIENT_BALANCE", `Insufficient ${quote} balance to back this limit order.`);
      }
    } else {
      const position = state.positions.find((p) => tokenKey(p.token) === tokenKey(token));
      if (!position) return fail("NO_POSITION", "There is no open position to place a sell limit order.");
      if (input.amount > position.quantity + EPSILON) {
        return fail("INSUFFICIENT_QUANTITY", "Sell limit quantity exceeds the open position.");
      }
    }

    const order: LimitOrder = {
      id: uid("ord"),
      token,
      quote,
      side: input.side,
      limitPrice: d(input.limitPrice),
      amount: d(input.amount),
      status: "open",
      createdAt: at,
      updatedAt: at,
      feeRateBps: state.feeRateBps,
      slippageBps: state.slippageBps,
    };

    set({ orders: [order, ...state.orders].slice(0, MAX_ORDER_HISTORY) });
    return { ok: true, value: order };
  },

  cancelLimit: (orderId) => {
    const state = get();
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return fail("ORDER_NOT_OPEN", "Order not found.");
    if (order.status !== "open") return fail("ORDER_NOT_OPEN", "Only open orders can be cancelled.");
    const updated: LimitOrder = { ...order, status: "cancelled", updatedAt: Date.now() };
    set({ orders: state.orders.map((o) => (o.id === orderId ? updated : o)) });
    return { ok: true, value: updated };
  },

  processTicks: (ticks) => {
    if (!Array.isArray(ticks) || ticks.length === 0) return { fills: [], failures: [] };
    const state = get();
    let balances = { ...state.balances };
    let positions = [...state.positions];
    let trades = [...state.trades];
    const orders = [...state.orders];
    let realizedPnl = { ...state.realizedPnl };
    let feesPaid = { ...state.feesPaid };
    const fills: Trade[] = [];
    const failures: LimitOrder[] = [];
    let changed = false;

    for (const tick of ticks) {
      if (!tick || !isNetworkId(tick.network)) continue;
      if (!isPositiveFinite(tick.priceUsd) || !isPositiveFinite(tick.quoteUsd)) continue;
      const quote = networkQuote(tick.network);
      const priceQuote = d(tick.priceUsd / tick.quoteUsd);
      if (!isPositiveFinite(priceQuote)) continue;
      const key = `${tick.network}:${tick.address}`;

      positions = positions.map((position) => {
        if (tokenKey(position.token) !== key) return position;
        changed = true;
        return { ...position, lastPriceQuote: priceQuote, lastPriceAt: tick.at };
      });

      for (let index = 0; index < orders.length; index += 1) {
        const order = orders[index];
        if (order.status !== "open") continue;
        if (tokenKey(order.token) !== key || order.quote !== quote) continue;
        if (!limitTriggered(order, priceQuote)) continue;

        const syntheticPriceUsd = d(order.limitPrice * tick.quoteUsd);
        if (order.side === "buy") {
          const planResult = computeBuyPlan({
            token: order.token,
            quote,
            amountQuote: order.amount,
            priceUsd: syntheticPriceUsd,
            quoteUsd: tick.quoteUsd,
            balance: balances[quote],
            feeRateBps: order.feeRateBps,
            slippageBps: 0,
            at: tick.at,
          });
          if (!planResult.ok) {
            const failed: LimitOrder = {
              ...order,
              status: "failed",
              updatedAt: tick.at,
              failureReason: planResult.error.message,
            };
            orders[index] = failed;
            failures.push(failed);
            changed = true;
            continue;
          }
          const plan = planResult.value;
          const applied = applyBuyToPositions(positions, plan, order.token, quote);
          positions = applied.positions;
          const trade = createBuyTrade(plan, order.token, quote, order.id);
          trades = [trade, ...trades].slice(0, MAX_TRADE_HISTORY);
          fills.push(trade);
          balances = { ...balances, [quote]: d(Math.max(0, balances[quote] - plan.totalDebit)) };
          feesPaid = { ...feesPaid, [quote]: d(feesPaid[quote] + plan.fee) };
          orders[index] = {
            ...order,
            status: "filled",
            updatedAt: tick.at,
            filledTradeId: trade.id,
          };
          changed = true;
          continue;
        }

        const position = positions.find((p) => tokenKey(p.token) === key && p.quote === quote);
        if (!position || position.quantity + EPSILON < order.amount) {
          const failed: LimitOrder = {
            ...order,
            status: "failed",
            updatedAt: tick.at,
            failureReason: !position
              ? "Position was closed before the limit triggered."
              : "Remaining position is smaller than the limit order quantity.",
          };
          orders[index] = failed;
          failures.push(failed);
          changed = true;
          continue;
        }
        const quantity = order.amount > position.quantity - EPSILON ? position.quantity : d(order.amount);
        const planResult = computeSellPlan({
          token: position.token,
          quote,
          positionId: position.id,
          quantity,
          priceUsd: syntheticPriceUsd,
          quoteUsd: tick.quoteUsd,
          avgEntryPrice: position.avgEntryPrice,
          feeRateBps: order.feeRateBps,
          slippageBps: 0,
          at: tick.at,
        });
        if (!planResult.ok) {
          const failed: LimitOrder = { ...order, status: "failed", updatedAt: tick.at, failureReason: planResult.error.message };
          orders[index] = failed;
          failures.push(failed);
          changed = true;
          continue;
        }
        const plan = planResult.value;
        positions = applySellToPositions(positions, plan, position.id);
        const trade = createSellTrade(plan, position.token, quote, order.id);
        trades = [trade, ...trades].slice(0, MAX_TRADE_HISTORY);
        fills.push(trade);
        balances = { ...balances, [quote]: d(balances[quote] + plan.netProceeds) };
        realizedPnl = { ...realizedPnl, [quote]: d(realizedPnl[quote] + plan.realizedPnl) };
        feesPaid = { ...feesPaid, [quote]: d(feesPaid[quote] + plan.fee) };
        orders[index] = { ...order, status: "filled", updatedAt: tick.at, filledTradeId: trade.id };
        changed = true;
      }
    }

    if (changed) {
      set({
        balances,
        positions,
        trades,
        orders: orders.slice(0, MAX_ORDER_HISTORY),
        realizedPnl,
        feesPaid,
      });
    }
    return { fills, failures };
  },

  setFeeRateBps: (value) => set({ feeRateBps: clampBps(value, MAX_FEE_BPS) }),
  setSlippageBps: (value) => set({ slippageBps: clampBps(value, MAX_SLIPPAGE_BPS) }),
  resetAccount: () =>
    set({
      ...createInitialSnapshot(),
      feeRateBps: DEFAULT_FEE_BPS,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    }),
});

function persistOptions() {
  return {
    name: PAPER_STORE_KEY,
    version: PAPER_STORE_VERSION,
    storage: createJSONStorage(createPaperRawStorage),
    skipHydration: true,
    partialize: (state: PaperStore) => snapshotOf(state),
    merge: (persisted: unknown, current: PaperStore) => {
      const sanitized = sanitizePaperSnapshot(persisted);
      if (!sanitized) return current;
      return { ...current, ...sanitized };
    },
  };
}

export function createPaperStore(options: { persist?: boolean } = {}) {
  if (options.persist === false) {
    return create<PaperStore>()(createPaperState);
  }
  return create<PaperStore>()(persist(createPaperState, persistOptions()));
}

export function createPersistedPaperStore() {
  return create<PaperStore>()(persist(createPaperState, persistOptions()));
}

export const usePaperStore = create<PaperStore>()(persist(createPaperState, persistOptions()));

export function getQuoteBalance(store: Pick<PaperStore, "balances">, quote: QuoteCurrency): number {
  return store.balances[quote] ?? 0;
}

export function toTokenRef(market: {
  network: NetworkId;
  pool: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
}): TokenRef {
  return {
    network: market.network,
    pool: market.pool,
    address: market.tokenAddress,
    symbol: market.symbol,
    name: market.name,
    imageUrl: market.imageUrl,
  };
}

export function isOrderStatus(value: unknown): value is (typeof ORDER_STATUSES)[number] {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
