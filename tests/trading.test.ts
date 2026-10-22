import { describe, expect, it } from "vitest";
import { d, notional, withinEpsilon } from "@/lib/trading/decimals";
import { parseAmountInput, isFreshPrice } from "@/lib/trading/validation";
import {
  computeBuyPlan,
  computeSellPlan,
  computeUnrealized,
  limitTriggered,
  quantityForFraction,
} from "@/lib/trading/engine";
import { createInitialSnapshot, sanitizePaperSnapshot } from "@/lib/trading/sanitize";
import { createPaperStore } from "@/stores/paper-trading";
import type { TokenRef } from "@/lib/trading/types";

const SOL_TOKEN: TokenRef = {
  network: "solana",
  pool: "pool-sol",
  address: "token-sol",
  symbol: "TEST",
  name: "Test Token",
  imageUrl: null,
};

const ETH_TOKEN: TokenRef = {
  network: "eth",
  pool: "pool-eth",
  address: "token-eth",
  symbol: "ETHT",
  name: "Ethereum Test",
  imageUrl: null,
};

describe("decimal helpers", () => {
  it("strips binary float tails", () => {
    expect(d(0.1 + 0.2)).toBe(0.3);
    expect(notional(0.1, 3)).toBe(0.3);
    expect(withinEpsilon(1, 1 + 1e-10)).toBe(true);
    expect(withinEpsilon(1, 1.001)).toBe(false);
  });
});

describe("amount validation", () => {
  it("accepts plain positive decimals and rejects invalid formats", () => {
    expect(parseAmountInput("1.25")).toEqual({ ok: true, value: 1.25, error: null });
    expect(parseAmountInput("").error).toBeNull();
    expect(parseAmountInput("").value).toBeNull();
    expect(parseAmountInput("1e3").ok).toBe(false);
    expect(parseAmountInput("-1").ok).toBe(false);
    expect(parseAmountInput("0").ok).toBe(false);
    expect(parseAmountInput(".").ok).toBe(false);
  });

  it("enforces precision and maximums", () => {
    expect(parseAmountInput("0.1234567890", { maxDecimals: 9 }).error).toMatch(/Maximum 9 decimals/);
    expect(parseAmountInput("999", { max: 10 }).error).toMatch(/too large/);
  });

  it("only treats recent timestamps as fresh", () => {
    expect(isFreshPrice(Date.now())).toBe(true);
    expect(isFreshPrice(Date.now() - 61_000)).toBe(false);
    expect(isFreshPrice(null)).toBe(false);
  });
});

describe("buy plan", () => {
  it("applies fee and slippage exactly once", () => {
    const result = computeBuyPlan({
      token: SOL_TOKEN,
      quote: "SOL",
      amountQuote: 1,
      priceUsd: 0.01,
      quoteUsd: 100,
      balance: 50,
      feeRateBps: 50,
      slippageBps: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.value;
    expect(plan.referencePrice).toBeCloseTo(0.0001, 12);
    expect(plan.fillPrice).toBeCloseTo(0.000101, 12);
    expect(plan.quantity).toBeCloseTo(9900.990099, 6);
    expect(plan.fee).toBeCloseTo(0.005, 12);
    expect(plan.totalDebit).toBeCloseTo(1.005, 12);
  });

  it("adds the priority fee to the debit only", () => {
    const result = computeBuyPlan({
      token: SOL_TOKEN,
      quote: "SOL",
      amountQuote: 1,
      priceUsd: 0.01,
      quoteUsd: 100,
      balance: 50,
      feeRateBps: 50,
      slippageBps: 0,
      priorityFeeQuote: 0.02,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.priorityFee).toBe(0.02);
    expect(result.value.totalDebit).toBeCloseTo(1.025, 12);
    expect(result.value.quantity).toBeCloseTo(10_000, 6);
  });

  it("rejects unaffordable, mispriced and out-of-range requests", () => {
    const base = {
      token: SOL_TOKEN,
      quote: "SOL" as const,
      amountQuote: 1,
      priceUsd: 0.01,
      quoteUsd: 100,
      balance: 50,
      feeRateBps: 50,
      slippageBps: 100,
    };
    expect(computeBuyPlan({ ...base, amountQuote: 1000 }).ok).toBe(false);
    expect(computeBuyPlan({ ...base, priceUsd: 0 }).ok).toBe(false);
    expect(computeBuyPlan({ ...base, quoteUsd: 0 }).ok).toBe(false);
    expect(computeBuyPlan({ ...base, feeRateBps: 501 }).ok).toBe(false);
    expect(computeBuyPlan({ ...base, slippageBps: 5_001 }).ok).toBe(false);
  });
});

describe("sell plan", () => {
  it("nets fees and slippage from proceeds", () => {
    const result = computeSellPlan({
      token: SOL_TOKEN,
      quote: "SOL",
      positionId: "pos-1",
      quantity: 9900.990099,
      priceUsd: 0.02,
      quoteUsd: 100,
      avgEntryPrice: 0.000101,
      feeRateBps: 50,
      slippageBps: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fillPrice).toBeCloseTo(0.000198, 12);
    expect(result.value.gross).toBeCloseTo(1.960396, 6);
    expect(result.value.fee).toBeCloseTo(0.009802, 6);
    expect(result.value.netProceeds).toBeCloseTo(1.950594, 6);
    expect(result.value.realizedPnl).toBeCloseTo(0.950594, 6);
  });
});

describe("unrealized PnL", () => {
  it("deducts the estimated exit fee", () => {
    const pnl = computeUnrealized(
      {
        id: "pos",
        token: SOL_TOKEN,
        quote: "SOL",
        quantity: 100,
        avgEntryPrice: 1,
        costBasis: 100,
        realizedPnl: 0,
        feesPaid: 0,
        openedAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        lastPriceQuote: 1,
        lastPriceAt: 1_700_000_000_000,
      },
      2,
      50,
    );
    expect(pnl.marketValue).toBe(200);
    expect(pnl.exitFee).toBe(1);
    expect(pnl.grossPnl).toBe(100);
    expect(pnl.netPnl).toBe(99);
    expect(pnl.pct).toBe(99);
    expect(pnl.includesExitFee).toBe(true);
  });
});

describe("limit helpers", () => {
  const order = {
    id: "o1",
    token: SOL_TOKEN,
    quote: "SOL" as const,
    side: "buy" as const,
    limitPrice: 0.0001,
    amount: 1,
    status: "open" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    feeRateBps: 50,
    slippageBps: 100,
  };

  it("triggers buys at or below the limit and sells at or above it", () => {
    expect(limitTriggered(order, 0.00009)).toBe(true);
    expect(limitTriggered(order, 0.00011)).toBe(false);
    expect(limitTriggered({ ...order, side: "sell" }, 0.00011)).toBe(true);
    expect(limitTriggered({ ...order, side: "sell" }, 0.00009)).toBe(false);
    expect(limitTriggered({ ...order, status: "cancelled" }, 0.00001)).toBe(false);
  });

  it("never returns more than the position quantity", () => {
    expect(quantityForFraction(10, 0.25)).toBe(2.5);
    expect(quantityForFraction(10, 1)).toBe(10);
  });
});

describe("paper store", () => {
  it("buys, marks and fully sells a Solana position", () => {
    const store = createPaperStore({ persist: false });
    const at = Date.now();
    const buy = store.getState().buy({
      token: SOL_TOKEN,
      amountQuote: 1,
      priceUsd: 0.01,
      quoteUsd: 100,
      at,
    });
    expect(buy.ok).toBe(true);
    expect(store.getState().balances.SOL).toBeCloseTo(48.995, 9);
    expect(store.getState().balances.ETH).toBe(50);

    const position = store.getState().positions[0];
    expect(position.quantity).toBeCloseTo(9900.990099, 5);
    expect(position.feesPaid).toBeCloseTo(0.005, 9);

    const tick = store.getState().processTicks([
      { network: "solana", address: SOL_TOKEN.address, pool: SOL_TOKEN.pool, priceUsd: 0.02, quoteUsd: 100, at: at + 1 },
    ]);
    expect(tick.fills).toHaveLength(0);
    expect(store.getState().positions[0].lastPriceQuote).toBeCloseTo(0.0002, 12);

    const sell = store.getState().sell({
      positionId: position.id,
      fraction: 1,
      priceUsd: 0.02,
      quoteUsd: 100,
      at: at + 2,
    });
    expect(sell.ok).toBe(true);
    if (!sell.ok) return;
    expect(sell.value.plan.fee).toBeCloseTo(0.00980198, 7);
    expect(sell.value.trade.realizedPnl).toBeCloseTo(0.950594, 5);
    expect(store.getState().positions).toHaveLength(0);
    expect(store.getState().balances.SOL).toBeCloseTo(50.945594, 5);
    expect(store.getState().realizedPnl.SOL).toBeCloseTo(0.950594, 5);
    expect(store.getState().feesPaid.SOL).toBeCloseTo(0.014802, 5);
  });

  it("keeps quote-currency accounts separate", () => {
    const store = createPaperStore({ persist: false });
    const result = store.getState().buy({
      token: ETH_TOKEN,
      amountQuote: 2,
      priceUsd: 30,
      quoteUsd: 3_000,
    });
    expect(result.ok).toBe(true);
    expect(store.getState().balances.ETH).toBeCloseTo(47.99, 9);
    expect(store.getState().balances.SOL).toBe(50);
    expect(store.getState().positions[0].quote).toBe("ETH");
  });

  it("rejects buys that exceed the paper balance", () => {
    const store = createPaperStore({ persist: false });
    const result = store.getState().buy({
      token: SOL_TOKEN,
      amountQuote: 60,
      priceUsd: 0.01,
      quoteUsd: 100,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INSUFFICIENT_BALANCE");
    expect(store.getState().balances.SOL).toBe(50);
  });

  it("fills a resting limit order only on a crossing fresh tick", () => {
    const store = createPaperStore({ persist: false });
    const order = store.getState().placeLimit({
      token: SOL_TOKEN,
      side: "buy",
      limitPrice: 0.0001,
      amount: 1,
      quoteUsd: 100,
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;

    const above = store.getState().processTicks([
      { network: "solana", address: SOL_TOKEN.address, pool: SOL_TOKEN.pool, priceUsd: 0.011, quoteUsd: 100, at: Date.now() },
    ]);
    expect(above.fills).toHaveLength(0);
    expect(store.getState().orders[0].status).toBe("open");

    const below = store.getState().processTicks([
      { network: "solana", address: SOL_TOKEN.address, pool: SOL_TOKEN.pool, priceUsd: 0.009, quoteUsd: 100, at: Date.now() },
    ]);
    expect(below.fills).toHaveLength(1);
    expect(store.getState().orders[0].status).toBe("filled");
    expect(store.getState().positions[0].quantity).toBeCloseTo(10_000, 6);
    expect(store.getState().balances.SOL).toBeCloseTo(48.995, 9);
  });

  it("cancels only open orders and resets the account", () => {
    const store = createPaperStore({ persist: false });
    const placed = store.getState().placeLimit({
      token: SOL_TOKEN,
      side: "buy",
      limitPrice: 0.0001,
      amount: 1,
      quoteUsd: 100,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const cancelled = store.getState().cancelLimit(placed.value.id);
    expect(cancelled.ok).toBe(true);
    expect(store.getState().orders[0].status).toBe("cancelled");
    expect(store.getState().cancelLimit(placed.value.id).ok).toBe(false);

    store.getState().setFeeRateBps(500);
    store.getState().resetAccount();
    expect(store.getState().balances).toEqual({ SOL: 50, ETH: 50 });
    expect(store.getState().orders).toHaveLength(0);
    expect(store.getState().feeRateBps).toBe(50);
  });
});

describe("persistence guard", () => {
  it("accepts a fresh snapshot and rejects corrupted payloads", () => {
    const fresh = createInitialSnapshot();
    expect(sanitizePaperSnapshot(fresh)).not.toBeNull();
    expect(sanitizePaperSnapshot({ state: fresh, version: 1 })).not.toBeNull();
    expect(sanitizePaperSnapshot({ state: fresh, version: 99 })).toBeNull();
    expect(sanitizePaperSnapshot({ balances: { SOL: Number.NaN } })?.balances.SOL).toBe(50);
    expect(sanitizePaperSnapshot("nonsense")).toBeNull();
  });

  it("drops malformed orders but keeps the readable account", () => {
    const fresh = createInitialSnapshot();
    const sanitized = sanitizePaperSnapshot({
      state: {
        ...fresh,
        balances: { SOL: 12.5, ETH: 50 },
        orders: [
          { id: "bad" },
          {
            id: "ord_ok",
            token: SOL_TOKEN,
            quote: "SOL",
            side: "buy",
            limitPrice: 0.0001,
            amount: 1,
            status: "open",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            feeRateBps: 50,
            slippageBps: 100,
          },
        ],
      },
      version: 1,
    });
    expect(sanitized?.balances.SOL).toBe(12.5);
    expect(sanitized?.orders).toHaveLength(1);
    expect(sanitized?.orders[0].id).toBe("ord_ok");
  });
});
