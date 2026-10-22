import { describe, expect, it } from "vitest";
import { formatHeld, positionProgress } from "@/lib/trading/position-progress";
import type { Position } from "@/lib/trading/types";

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: "pos-1",
    token: {
      network: "solana",
      pool: "pool",
      address: "token",
      symbol: "XDP",
      name: "XDP",
      imageUrl: null,
    },
    quote: "SOL",
    quantity: 100,
    avgEntryPrice: 0.0001,
    costBasis: 0.01,
    realizedPnl: 0,
    feesPaid: 0.00005,
    openedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastPriceQuote: 0.0001,
    lastPriceAt: 1_700_000_000_000,
    takeProfitPrice: 0.0002,
    stopLossPrice: 0.00008,
    ...overrides,
  };
}

describe("position progress bar", () => {
  it("places stop, entry and take-profit in order across the bar", () => {
    const progress = positionProgress(position(), 0.0001, 50);
    expect(progress.stopLossPct).toBe(0);
    expect(progress.takeProfitPct).toBe(100);
    expect(progress.entryPct).toBeGreaterThan(0);
    expect(progress.entryPct).toBeLessThan(100);
    expect(progress.currentPct).toBeCloseTo(progress.entryPct, 6);
  });

  it("moves the marker toward the target as the price rises", () => {
    const low = positionProgress(position(), 0.00011, 50);
    const high = positionProgress(position(), 0.00018, 50);
    expect(high.currentPct).toBeGreaterThan(low.currentPct);
    expect(high.towardTarget).toBeCloseTo(0.8, 6);
    expect(low.towardTarget).toBeCloseTo(0.1, 6);
    // Below entry the trade has made no progress toward the target at all.
    expect(positionProgress(position(), 0.00009, 50).towardTarget).toBe(0);
  });

  it("clamps the marker when the price trades past a level", () => {
    const beyond = positionProgress(position(), 0.0005, 50);
    expect(beyond.currentPct).toBe(100);
    expect(beyond.towardTarget).toBe(1);
    const crashed = positionProgress(position(), 0.00001, 50);
    expect(crashed.currentPct).toBe(0);
    expect(crashed.towardTarget).toBe(0);
  });

  it("still draws a usable bar when no exits are set", () => {
    const progress = positionProgress(
      position({ takeProfitPrice: null, stopLossPrice: null }),
      0.00011,
      50,
    );
    expect(progress.stopLossPct).toBeNull();
    expect(progress.takeProfitPct).toBeNull();
    expect(progress.low).toBeLessThan(0.0001);
    expect(progress.high).toBeGreaterThan(0.0001);
    expect(progress.currentPct).toBeGreaterThan(progress.entryPct);
  });

  it("ignores levels on the wrong side of entry", () => {
    // A take profit below entry or a stop above entry is not drawn.
    const progress = positionProgress(position({ takeProfitPrice: 0.00005, stopLossPrice: 0.0002 }), 0.0001, 50);
    expect(progress.takeProfitPct).toBeNull();
    expect(progress.stopLossPct).toBeNull();
  });

  it("reports PnL net of the estimated exit fee", () => {
    const flat = positionProgress(position(), 0.0001, 50);
    expect(flat.netPnlQuote).toBeCloseTo(-0.00005, 9);
    expect(flat.pnlPct).toBeCloseTo(-0.5, 6);

    const doubled = positionProgress(position(), 0.0002, 50);
    expect(doubled.netPnlQuote).toBeCloseTo(0.01 - 0.000_1, 9);
    expect(doubled.netPnlQuote).toBeGreaterThan(0);
  });
});

describe("formatHeld", () => {
  it("formats short and long holds compactly", () => {
    expect(formatHeld(0)).toBe("0s");
    expect(formatHeld(9_000)).toBe("9s");
    expect(formatHeld(75_000)).toBe("1m 15s");
    expect(formatHeld(3_900_000)).toBe("1h 05m");
    expect(formatHeld(Number.NaN)).toBe("—");
    expect(formatHeld(-1)).toBe("—");
  });
});
