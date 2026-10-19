import { describe, expect, it } from "vitest";
import {
  computeUnrealized,
  protectionFromPercent,
  protectionPercent,
  protectionTriggered,
  tokenKey,
} from "@/lib/trading/engine";
import { sanitizePaperSnapshot, snapshotOf } from "@/lib/trading/sanitize";
import { createPaperStore } from "@/stores/paper-trading";
import type { BuyPlan, TokenRef } from "@/lib/trading/types";

const TOKEN: TokenRef = {
  network: "solana",
  pool: "pool-tp",
  address: "token-tp",
  symbol: "PROT",
  name: "Protected Token",
  imageUrl: null,
};

const QUOTE_USD = 100;
/** 0.0001 SOL per token at SOL = $100. */
const PRICE_USD = 0.01;
const AT = 1_700_000_000_000;

function freshStore() {
  return createPaperStore({ persist: false });
}

describe("account balance semantics", () => {
  it("moves cash into the position on a buy, leaving equity down only by fees", () => {
    const store = freshStore();
    const before = store.getState();
    const beforeEquity =
      before.balances.SOL +
      before.positions.reduce((sum, position) => sum + position.costBasis, 0);

    const result = store.getState().buy({
      token: TOKEN,
      amountQuote: 2,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.value.plan as BuyPlan;

    const after = store.getState();
    const position = after.positions[0];

    // Cash really moved: the full debit (notional + fee) left the free balance.
    expect(after.balances.SOL).toBeCloseTo(47.99, 6);
    expect(before.balances.SOL - after.balances.SOL).toBeCloseTo(plan.totalDebit, 9);

    // The position is worth what was bought at the entry mark.
    const unrealized = computeUnrealized(position, position.lastPriceQuote, after.feeRateBps);
    expect(unrealized.marketValue).toBeCloseTo(2, 6);

    // Total value only drops by the fee; the principal is not lost.
    const afterEquity = after.balances.SOL + unrealized.marketValue;
    expect(beforeEquity - afterEquity).toBeCloseTo(plan.fee, 6);
    expect(afterEquity).toBeCloseTo(49.99, 6);
  });

  it("restores the post-trade balance from a persisted snapshot instead of resetting to 50", () => {
    const store = freshStore();
    store.getState().buy({ token: TOKEN, amountQuote: 2, priceUsd: PRICE_USD, quoteUsd: QUOTE_USD, at: AT });
    const raw = JSON.parse(JSON.stringify({ state: snapshotOf(store.getState()), version: 1 })) as unknown;

    const restored = sanitizePaperSnapshot(raw);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.balances.SOL).toBeCloseTo(47.99, 6);
    expect(restored.positions).toHaveLength(1);
    expect(restored.positions[0].costBasis).toBeCloseTo(2, 6);
  });
});

describe("take profit / stop loss", () => {
  it("converts percentages into absolute levels around the entry price", () => {
    const levels = protectionFromPercent(1, 50, 20);
    expect(levels.takeProfitPrice).toBeCloseTo(1.5, 9);
    expect(levels.stopLossPrice).toBeCloseTo(0.8, 9);
    expect(protectionPercent(1, levels.takeProfitPrice)).toBeCloseTo(50, 6);
    expect(protectionPercent(1, levels.stopLossPrice)).toBeCloseTo(-20, 6);

    // Missing or nonsense input switches the level off rather than guessing.
    expect(protectionFromPercent(1, null, 0).takeProfitPrice).toBeNull();
    expect(protectionFromPercent(1, undefined, 150).stopLossPrice).toBeCloseTo(0.001, 9);
  });

  it("reports which level a price crossed, with take profit winning a tie", () => {
    const levels = { takeProfitPrice: 2, stopLossPrice: 0.5 };
    expect(protectionTriggered(levels, 2.1)).toBe("take-profit");
    expect(protectionTriggered(levels, 0.4)).toBe("stop-loss");
    expect(protectionTriggered(levels, 1)).toBeNull();
    expect(protectionTriggered({ takeProfitPrice: 2, stopLossPrice: 2.5 }, 2.2)).toBe("take-profit");
    expect(protectionTriggered({ takeProfitPrice: null, stopLossPrice: null }, 3)).toBeNull();
  });

  it("attaches a bracket on buy using the resulting average entry", () => {
    const store = freshStore();
    const result = store.getState().buy({
      token: TOKEN,
      amountQuote: 2,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      takeProfitPct: 50,
      stopLossPct: 20,
    });
    expect(result.ok).toBe(true);
    const position = store.getState().positions[0];
    // The default 1% slippage makes the entry 0.000101, so the bracket is
    // measured from the price actually paid rather than the mid price.
    expect(position.avgEntryPrice).toBeCloseTo(0.000101, 12);
    expect(position.takeProfitPrice).toBeCloseTo(0.0001515, 12);
    expect(position.stopLossPrice).toBeCloseTo(0.0000808, 12);
  });

  it("keeps the same percentages when averaging into a position", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 1,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      takeProfitPct: 50,
      stopLossPct: 20,
    });
    const first = store.getState().positions[0];
    expect(first.takeProfitPrice! / first.avgEntryPrice).toBeCloseTo(1.5, 6);

    // Buy more at a much higher price: the average entry rises, so a level that
    // stayed at its absolute price would now sit below entry.
    store.getState().buy({
      token: TOKEN,
      amountQuote: 3,
      priceUsd: 0.02,
      quoteUsd: QUOTE_USD,
      at: AT + 1_000,
    });
    const averaged = store.getState().positions[0];
    expect(averaged.avgEntryPrice).toBeGreaterThan(first.avgEntryPrice);
    expect(averaged.takeProfitPrice! / averaged.avgEntryPrice).toBeCloseTo(1.5, 6);
    expect(averaged.stopLossPrice! / averaged.avgEntryPrice).toBeCloseTo(0.8, 6);
  });

  it("sells the whole position when take profit is hit on a tick", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 2,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      takeProfitPct: 50,
    });

    // Inside the 5s grace window after opening: no automatic exit yet.
    const early = store.getState().processTicks([
      { network: "solana", address: TOKEN.address, pool: TOKEN.pool, priceUsd: 0.02, quoteUsd: QUOTE_USD, at: AT + 1_000 },
    ]);
    expect(early.fills).toHaveLength(0);
    expect(store.getState().positions).toHaveLength(1);

    const hit = store.getState().processTicks([
      { network: "solana", address: TOKEN.address, pool: TOKEN.pool, priceUsd: 0.02, quoteUsd: QUOTE_USD, at: AT + 30_000 },
    ]);
    expect(hit.fills).toHaveLength(1);
    expect(hit.fills[0].trigger).toBe("take-profit");
    expect(hit.fills[0].side).toBe("sell");
    expect(hit.fills[0].realizedPnl).toBeGreaterThan(0);
    expect(store.getState().positions).toHaveLength(0);

    // Proceeds actually land in the free balance.
    expect(store.getState().balances.SOL).toBeGreaterThan(49);
    expect(store.getState().trades[0].trigger).toBe("take-profit");
  });

  it("sells the whole position when stop loss is hit on a tick", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 2,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      stopLossPct: 20,
    });

    const miss = store.getState().processTicks([
      { network: "solana", address: TOKEN.address, pool: TOKEN.pool, priceUsd: 0.0105, quoteUsd: QUOTE_USD, at: AT + 30_000 },
    ]);
    expect(miss.fills).toHaveLength(0);

    const hit = store.getState().processTicks([
      { network: "solana", address: TOKEN.address, pool: TOKEN.pool, priceUsd: 0.00007, quoteUsd: QUOTE_USD, at: AT + 60_000 },
    ]);
    expect(hit.fills).toHaveLength(1);
    expect(hit.fills[0].trigger).toBe("stop-loss");
    expect(hit.fills[0].realizedPnl).toBeLessThan(0);
    expect(store.getState().positions).toHaveLength(0);
  });

  it("ignores ticks for other pools", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 1,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      takeProfitPct: 10,
    });
    const result = store.getState().processTicks([
      { network: "solana", address: "someone-else", pool: "other-pool", priceUsd: 1, quoteUsd: QUOTE_USD, at: AT + 60_000 },
    ]);
    expect(result.fills).toHaveLength(0);
    expect(store.getState().positions).toHaveLength(1);
  });

  it("lets a user set and clear levels with validation", () => {
    const store = freshStore();
    store.getState().buy({ token: TOKEN, amountQuote: 1, priceUsd: PRICE_USD, quoteUsd: QUOTE_USD, at: AT });
    const position = store.getState().positions[0];

    const bad = store.getState().setProtection(position.id, { takeProfitPrice: 0.00001, stopLossPrice: null });
    expect(bad.ok).toBe(false);

    const badStop = store.getState().setProtection(position.id, { takeProfitPrice: null, stopLossPrice: 0.0002 });
    expect(badStop.ok).toBe(false);

    const good = store.getState().setProtection(position.id, {
      takeProfitPrice: 0.0002,
      stopLossPrice: 0.00005,
    });
    expect(good.ok).toBe(true);
    expect(store.getState().positions[0].takeProfitPrice).toBeCloseTo(0.0002, 12);

    store.getState().setProtection(position.id, { takeProfitPrice: null, stopLossPrice: null });
    expect(store.getState().positions[0].takeProfitPrice).toBeNull();
    expect(store.getState().positions[0].stopLossPrice).toBeNull();
  });

  it("survives a localStorage round trip and discards impossible levels", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 1,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
      takeProfitPct: 40,
      stopLossPct: 25,
    });

    const raw = JSON.parse(JSON.stringify({ state: snapshotOf(store.getState()), version: 1 })) as {
      state: Record<string, unknown>;
    };
    const restored = sanitizePaperSnapshot(raw);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.positions[0].takeProfitPrice).toBeCloseTo(0.0001414, 12);
    expect(restored.positions[0].stopLossPrice).toBeCloseTo(0.00007575, 12);

    // A corrupted level must not delete the position, it is simply dropped.
    const positions = raw.state.positions as Record<string, unknown>[];
    positions[0].takeProfitPrice = 0.0000001;
    positions[0].stopLossPrice = 99;
    const repaired = sanitizePaperSnapshot(raw);
    expect(repaired?.positions).toHaveLength(1);
    expect(repaired?.positions[0].takeProfitPrice).toBeNull();
    expect(repaired?.positions[0].stopLossPrice).toBeNull();
  });

  it("keys tokens by network and address", () => {
    expect(tokenKey(TOKEN)).toBe("solana:token-tp");
  });
});
