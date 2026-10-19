import { clampNonNegative, d, EPSILON, isNonNegativeFinite, isPositiveFinite, notional } from "./decimals";
import type {
  BuyInput,
  BuyPlan,
  EngineResult,
  LimitOrder,
  Position,
  SellInput,
  SellPlan,
  TokenRef,
  Trade,
  TradeErrorCode,
  UnrealizedPnl,
} from "./types";

export const INITIAL_PAPER_BALANCE = 50;
export const DEFAULT_FEE_BPS = 50; // 0.50 %
export const DEFAULT_SLIPPAGE_BPS = 100; // 1.00 %
export const MAX_FEE_BPS = 500;
export const MAX_SLIPPAGE_BPS = 5_000;

export const SLIPPAGE_PRESETS = [50, 100, 500, 2_000];

/**
 * Fee convention (documented in the UI):
 *   notional = entered quote amount
 *   fee      = notional × feeRate
 *   debit    = notional + fee + priority fee
 *   quantity = notional ÷ simulated fill price
 * Fees are expensed immediately and tracked separately; they are NOT added to
 * the position's cost basis and therefore are not double-counted in realised PnL.
 */
export function computeBuyPlan(input: BuyInput): EngineResult<BuyPlan> {
  if (!input || !input.token) return fail("INVALID_TOKEN", "Select a token first.");
  if (!isPositiveFinite(input.amountQuote)) return fail("INVALID_AMOUNT", "Enter an amount greater than zero.");
  if (!isPositiveFinite(input.priceUsd)) return fail("INVALID_PRICE", "No usable market price is available.");
  if (!isPositiveFinite(input.quoteUsd)) return fail("NO_QUOTE_PRICE", "The quote-currency reference price is unavailable.");
  if (!isNonNegativeFinite(input.balance)) return fail("INVALID_AMOUNT", "Paper account balance is invalid.");
  if (!isNonNegativeFinite(input.feeRateBps) || input.feeRateBps > MAX_FEE_BPS) {
    return fail("INVALID_AMOUNT", `Fee rate must be between 0% and ${MAX_FEE_BPS / 100}%.`);
  }
  if (!isNonNegativeFinite(input.slippageBps) || input.slippageBps > MAX_SLIPPAGE_BPS) {
    return fail("INVALID_AMOUNT", "Slippage assumption is outside the supported range.");
  }
  const priorityFee = clampNonNegative(input.priorityFeeQuote ?? 0);

  const referencePrice = d(input.priceUsd / input.quoteUsd);
  if (!isPositiveFinite(referencePrice)) return fail("INVALID_PRICE", "Reference price is invalid.");
  const fillPrice = d(referencePrice * (1 + input.slippageBps / 10_000));
  const amount = d(input.amountQuote);
  const quantity = d(amount / fillPrice);
  const fee = d(amount * (input.feeRateBps / 10_000));
  const totalDebit = d(amount + fee + priorityFee);

  if (!isPositiveFinite(quantity)) return fail("INVALID_AMOUNT", "Amount is too small to acquire any tokens.");
  if (totalDebit > d(input.balance) + EPSILON) {
    return fail(
      "INSUFFICIENT_BALANCE",
      `Insufficient ${input.quote} balance. Required ${totalDebit.toFixed(4)} ${input.quote}, available ${input.balance.toFixed(4)} ${input.quote}.`,
    );
  }

  return {
    ok: true,
    value: {
      notional: amount,
      referencePrice,
      fillPrice,
      quantity,
      fee,
      priorityFee,
      totalDebit,
      priceUsd: input.priceUsd,
      at: input.at ?? Date.now(),
      feeRateBps: input.feeRateBps,
      slippageBps: input.slippageBps,
    },
  };
}

/**
 * Sell convention:
 *   fillPrice = reference × (1 − slippage)
 *   gross     = quantity × fillPrice
 *   fee       = gross × feeRate
 *   net       = gross − fee
 *   realised  = net − (quantity × average entry price)
 */
export function computeSellPlan(input: SellInput): EngineResult<SellPlan> {
  if (!input || !input.token) return fail("INVALID_TOKEN", "Select a token first.");
  if (!isPositiveFinite(input.quantity)) return fail("INVALID_QUANTITY", "Enter a quantity greater than zero.");
  if (!isPositiveFinite(input.priceUsd)) return fail("INVALID_PRICE", "No usable market price is available.");
  if (!isPositiveFinite(input.quoteUsd)) return fail("NO_QUOTE_PRICE", "The quote-currency reference price is unavailable.");
  if (!isPositiveFinite(input.avgEntryPrice)) return fail("NO_POSITION", "Position cost basis is invalid.");
  if (!isNonNegativeFinite(input.feeRateBps) || input.feeRateBps > MAX_FEE_BPS) {
    return fail("INVALID_AMOUNT", `Fee rate must be between 0% and ${MAX_FEE_BPS / 100}%.`);
  }
  if (!isNonNegativeFinite(input.slippageBps) || input.slippageBps > MAX_SLIPPAGE_BPS) {
    return fail("INVALID_AMOUNT", "Slippage assumption is outside the supported range.");
  }

  const referencePrice = d(input.priceUsd / input.quoteUsd);
  if (!isPositiveFinite(referencePrice)) return fail("INVALID_PRICE", "Reference price is invalid.");
  const fillPrice = d(referencePrice * (1 - input.slippageBps / 10_000));
  const quantity = d(input.quantity);
  const gross = d(quantity * fillPrice);
  const fee = d(gross * (input.feeRateBps / 10_000));
  const netProceeds = d(gross - fee);
  const costBasis = d(quantity * input.avgEntryPrice);
  const realizedPnl = d(netProceeds - costBasis);

  if (netProceeds < 0) return fail("INVALID_PRICE", "Net proceeds would be negative.");
  if (!isPositiveFinite(fillPrice)) return fail("INVALID_PRICE", "Fill price is invalid.");

  return {
    ok: true,
    value: {
      quantity,
      referencePrice,
      fillPrice,
      gross,
      fee,
      netProceeds,
      costBasis,
      realizedPnl,
      priceUsd: input.priceUsd,
      at: input.at ?? Date.now(),
      feeRateBps: input.feeRateBps,
      slippageBps: input.slippageBps,
    },
  };
}

export function tokenKey(token: Pick<TokenRef, "network" | "address">): string {
  return `${token.network}:${token.address}`;
}

/** Weighted-average entry price for a position after adding a buy. */
export function applyBuyToPositions(
  positions: Position[],
  plan: BuyPlan,
  token: TokenRef,
  quote: Position["quote"],
): { positions: Position[]; positionId: string } {
  const key = tokenKey(token);
  const index = positions.findIndex((p) => tokenKey(p.token) === key);
  if (index === -1) {
    const position: Position = {
      id: `pos_${key}`,
      token,
      quote,
      quantity: plan.quantity,
      avgEntryPrice: d(plan.notional / plan.quantity),
      costBasis: plan.notional,
      realizedPnl: 0,
      feesPaid: d(plan.fee + plan.priorityFee),
      openedAt: plan.at,
      updatedAt: plan.at,
      lastPriceQuote: plan.fillPrice,
      lastPriceAt: plan.at,
    };
    return { positions: [position, ...positions], positionId: position.id };
  }

  const existing = positions[index];
  const totalCost = d(existing.costBasis + plan.notional);
  const totalQuantity = d(existing.quantity + plan.quantity);
  const updated: Position = {
    ...existing,
    token,
    quantity: totalQuantity,
    costBasis: totalCost,
    avgEntryPrice: d(totalCost / totalQuantity),
    feesPaid: d(existing.feesPaid + plan.fee + plan.priorityFee),
    updatedAt: plan.at,
    lastPriceQuote: plan.fillPrice,
    lastPriceAt: plan.at,
  };
  const copy = [...positions];
  copy[index] = updated;
  return { positions: copy, positionId: updated.id };
}

/** Remove a sold quantity from cost basis; delete the position when fully closed. */
export function applySellToPositions(
  positions: Position[],
  plan: SellPlan,
  positionId: string,
): Position[] {
  const index = positions.findIndex((p) => p.id === positionId);
  if (index === -1) return positions;
  const existing = positions[index];
  const remainingQty = d(existing.quantity - plan.quantity);
  if (remainingQty <= EPSILON) {
    return positions.filter((p) => p.id !== positionId);
  }
  const basisRatio = plan.quantity / existing.quantity;
  const remainingBasis = d(Math.max(0, existing.costBasis * (1 - basisRatio)));
  const updated: Position = {
    ...existing,
    quantity: remainingQty,
    costBasis: remainingBasis,
    avgEntryPrice: existing.avgEntryPrice,
    realizedPnl: d(existing.realizedPnl + plan.realizedPnl),
    feesPaid: d(existing.feesPaid + plan.fee),
    updatedAt: plan.at,
    lastPriceQuote: plan.fillPrice,
    lastPriceAt: plan.at,
  };
  const copy = [...positions];
  copy[index] = updated;
  return copy;
}

export function computeUnrealized(position: Position, currentPriceQuote: number, feeRateBps: number): UnrealizedPnl {
  const marketValue = d(position.quantity * currentPriceQuote);
  const exitFee = d(marketValue * (feeRateBps / 10_000));
  const grossPnl = d(marketValue - position.costBasis);
  const netPnl = d(grossPnl - exitFee);
  const pct = position.costBasis > 0 ? d((netPnl / position.costBasis) * 100) : 0;
  return { marketValue, exitFee, grossPnl, netPnl, pct, includesExitFee: true };
}

export function quantityForFraction(quantity: number, fraction: number): number {
  if (!isPositiveFinite(quantity)) return 0;
  if (fraction >= 1) return quantity;
  return Math.min(quantity, d(quantity * fraction));
}

export function limitTriggered(order: LimitOrder, priceQuote: number): boolean {
  if (!Number.isFinite(priceQuote) || priceQuote <= 0 || order.status !== "open") return false;
  return order.side === "buy" ? priceQuote <= order.limitPrice : priceQuote >= order.limitPrice;
}

export function createBuyTrade(plan: BuyPlan, token: TokenRef, quote: Trade["quote"], orderId?: string): Trade {
  return {
    id: `trade_${plan.at}_${Math.random().toString(36).slice(2, 9)}`,
    token,
    quote,
    side: "buy",
    orderKind: orderId ? "limit" : "market",
    quantity: plan.quantity,
    priceQuote: plan.fillPrice,
    priceUsd: plan.priceUsd,
    notional: plan.notional,
    fee: plan.fee,
    priorityFee: plan.priorityFee,
    total: plan.totalDebit,
    realizedPnl: null,
    at: plan.at,
    orderId,
  };
}

export function createSellTrade(plan: SellPlan, token: TokenRef, quote: Trade["quote"], orderId?: string): Trade {
  return {
    id: `trade_${plan.at}_${Math.random().toString(36).slice(2, 9)}`,
    token,
    quote,
    side: "sell",
    orderKind: orderId ? "limit" : "market",
    quantity: plan.quantity,
    priceQuote: plan.fillPrice,
    priceUsd: plan.priceUsd,
    notional: d(plan.quantity * plan.fillPrice),
    fee: plan.fee,
    priorityFee: 0,
    total: plan.netProceeds,
    realizedPnl: plan.realizedPnl,
    at: plan.at,
    orderId,
  };
}

export function fail(code: TradeErrorCode, message: string): EngineResult<never> {
  return { ok: false, error: { code, message } };
}

export function ok<T>(value: T): EngineResult<T> {
  return { ok: true, value };
}

export function positionMarketValue(position: Position, price: number | null | undefined): number {
  const mark = isPositiveFinite(price) ? price : position.lastPriceQuote;
  if (!isPositiveFinite(mark)) return 0;
  return d(notional(mark, position.quantity));
}
