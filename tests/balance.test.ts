import { describe, expect, it } from "vitest";
import { createPaperStore } from "@/stores/paper-trading";
import { sanitizePaperSnapshot, snapshotOf } from "@/lib/trading/sanitize";
import type { BuyPlan, TokenRef } from "@/lib/trading/types";

const TOKEN: TokenRef = {
  network: "solana",
  pool: "pool-balance",
  address: "token-balance",
  symbol: "BAL",
  name: "Balance Token",
  imageUrl: null,
};

/** SOL = $100 and the token = $0.01, so 1 SOL buys ~99 tokens after slippage. */
const QUOTE_USD = 100;
const PRICE_USD = 0.01;
const AT = 1_700_000_000_000;

function freshStore() {
  return createPaperStore({ persist: false });
}

describe("account balance persistence", () => {
  it("keeps the post-trade balance through a persist/sanitize round trip", () => {
    const store = freshStore();
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

    const raw = JSON.parse(JSON.stringify(snapshotOf(store.getState()))) as Record<string, unknown>;
    const restored = sanitizePaperSnapshot(raw);

    expect(restored).not.toBeNull();
    if (!restored) return;
    // A reload must not silently reset the account to its 50/50 starting point.
    expect(restored.balances.SOL).toBeCloseTo(50 - plan.totalDebit, 9);
    expect(restored.balances.SOL).toBeLessThan(50);
    expect(restored.positions).toHaveLength(1);
    expect(restored.positions[0].quantity).toBeGreaterThan(0);
    expect(restored.positions[0].costBasis).toBeCloseTo(2, 9);
    expect(restored.initialBalances.SOL).toBe(50);
  });

  it("restores a persisted snapshot into a fresh store without touching balances", () => {
    const store = freshStore();
    const result = store.getState().buy({
      token: TOKEN,
      amountQuote: 3,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
    });
    expect(result.ok).toBe(true);

    const restored = sanitizePaperSnapshot(
      JSON.parse(JSON.stringify(snapshotOf(store.getState()))) as Record<string, unknown>,
    );
    expect(restored).not.toBeNull();
    if (!restored) return;

    const second = freshStore();
    second.setState(restored);
    expect(second.getState().balances.SOL).toBeCloseTo(46.985, 9);
    expect(second.getState().positions).toHaveLength(1);
    // Equity is conserved: cash left, position value arrived.
    const position = second.getState().positions[0];
    const equity = second.getState().balances.SOL + position.quantity * position.lastPriceQuote;
    expect(equity).toBeCloseTo(49.985, 6);
  });

  it("credits a profitable sell back to the same cash balance", () => {
    const store = freshStore();
    store.getState().buy({
      token: TOKEN,
      amountQuote: 1,
      priceUsd: PRICE_USD,
      quoteUsd: QUOTE_USD,
      at: AT,
    });
    const position = store.getState().positions[0];
    const sold = store.getState().sell({
      positionId: position.id,
      fraction: 1,
      priceUsd: PRICE_USD * 2,
      quoteUsd: QUOTE_USD,
      at: AT + 60_000,
    });
    expect(sold.ok).toBe(true);

    const after = store.getState();
    expect(after.positions).toHaveLength(0);
    // Roughly doubled on the position, minus fees on both sides.
    expect(after.balances.SOL).toBeGreaterThan(50.5);
  });

  it("does not change cash when a limit order is still resting", () => {
    const store = freshStore();
    const placed = store.getState().placeLimit({
      token: TOKEN,
      side: "buy",
      // For a buy limit, `amount` is the quote notional to spend when it fills.
      amount: 0.5,
      limitPrice: PRICE_USD * 0.5,
      quoteUsd: QUOTE_USD,
      at: AT,
    });
    expect(placed.ok).toBe(true);
    // Pending orders reserve nothing: cash only moves when they fill.
    expect(store.getState().balances.SOL).toBe(50);
    expect(store.getState().orders).toHaveLength(1);
  });
});
