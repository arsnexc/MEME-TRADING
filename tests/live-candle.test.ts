import { describe, expect, it } from "vitest";
import { TIMEFRAME_SECONDS, mergeLiveTick, scaleCandle } from "@/lib/market-data/live-candle";
import type { Candle } from "@/lib/market-data/types";

const BAR: Candle = { time: 1_700_000_000, open: 10, high: 12, low: 9, close: 11, volume: 500 };
const FIVE_MIN = TIMEFRAME_SECONDS["5m"];

describe("live candle merge", () => {
  it("moves the close and extends the range of the forming bar", () => {
    const bar = mergeLiveTick({
      last: BAR,
      price: 13.5,
      tickMs: (BAR.time + 120) * 1_000,
      intervalSeconds: FIVE_MIN,
    });
    expect(bar).not.toBeNull();
    expect(bar!.time).toBe(BAR.time);
    expect(bar!.open).toBe(10);
    expect(bar!.high).toBe(13.5);
    expect(bar!.low).toBe(9);
    expect(bar!.close).toBe(13.5);
    expect(bar!.openedNewBar).toBe(false);
  });

  it("keeps the previous high when the tick is lower", () => {
    const bar = mergeLiveTick({
      last: BAR,
      price: 8,
      tickMs: (BAR.time + 60) * 1_000,
      intervalSeconds: FIVE_MIN,
    });
    expect(bar!.high).toBe(12);
    expect(bar!.low).toBe(8);
    expect(bar!.close).toBe(8);
  });

  it("opens the next bar at the previous close once the bucket closes", () => {
    const bar = mergeLiveTick({
      last: BAR,
      price: 11.4,
      tickMs: (BAR.time + FIVE_MIN + 10) * 1_000,
      intervalSeconds: FIVE_MIN,
    });
    expect(bar).not.toBeNull();
    expect(bar!.time).toBe(BAR.time + FIVE_MIN);
    expect(bar!.open).toBe(11);
    expect(bar!.close).toBe(11.4);
    expect(bar!.high).toBe(11.4);
    expect(bar!.low).toBe(11);
    expect(bar!.openedNewBar).toBe(true);
  });

  it("refuses to invent a run of bars when the provider has not delivered them", () => {
    const bar = mergeLiveTick({
      last: BAR,
      price: 11.4,
      tickMs: (BAR.time + FIVE_MIN * 3) * 1_000,
      intervalSeconds: FIVE_MIN,
    });
    expect(bar).toBeNull();
  });

  it("ignores unusable prices and missing bars", () => {
    const tick = { last: BAR, tickMs: (BAR.time + 10) * 1_000, intervalSeconds: FIVE_MIN };
    expect(mergeLiveTick({ ...tick, price: 0 })).toBeNull();
    expect(mergeLiveTick({ ...tick, price: Number.NaN })).toBeNull();
    expect(mergeLiveTick({ ...tick, price: 5, last: null })).toBeNull();
  });

  it("keeps a quote-currency chart on one scale", () => {
    // Regression: a SOL-display chart mixed the USD provider candle with the
    // already-converted live price, drawing one bar 100x taller than the rest.
    const SOL_USD = 105.74;
    const factor = 1 / SOL_USD;
    const raw: Candle = { time: BAR.time, open: 0.0125, high: 0.0127, low: 0.01225, close: 0.01263, volume: 10 };
    const bar = mergeLiveTick({
      last: scaleCandle(raw, factor),
      price: 0.01265 * factor,
      tickMs: (raw.time + 30) * 1_000,
      intervalSeconds: 60,
    });
    expect(bar).not.toBeNull();
    // Everything sits around 0.00012 SOL, not 0.0125.
    expect(bar!.open).toBeCloseTo(0.0125 * factor, 10);
    expect(bar!.high).toBeCloseTo(0.0127 * factor, 10);
    expect(bar!.low).toBeCloseTo(0.01225 * factor, 10);
    expect(bar!.close).toBeCloseTo(0.01265 * factor, 10);
    expect(bar!.high).toBeLessThan(0.001);
    // A single tick can never stretch the bar by two orders of magnitude.
    expect(bar!.high / bar!.low).toBeLessThan(1.1);
  });

  it("opens the next bar in display units, without a cross-currency jump", () => {
    const SOL_USD = 105.74;
    const factor = 1 / SOL_USD;
    const raw: Candle = { time: BAR.time, open: 0.0125, high: 0.0127, low: 0.01225, close: 0.01263, volume: 10 };
    const bar = mergeLiveTick({
      last: scaleCandle(raw, factor),
      price: 0.0127 * factor,
      tickMs: (raw.time + 60) * 1_000,
      intervalSeconds: 60,
    });
    expect(bar!.openedNewBar).toBe(true);
    expect(bar!.open).toBeCloseTo(raw.close * factor, 10);
    expect(bar!.open).toBeLessThan(0.001);
    expect(bar!.high).toBeLessThan(0.001);
  });

  it("leaves candles untouched when the conversion factor is unusable", () => {
    expect(scaleCandle(BAR, 1)).toEqual(BAR);
    expect(scaleCandle(BAR, 0)).toEqual(BAR);
    expect(scaleCandle(BAR, Number.NaN)).toEqual(BAR);
    const scaled = scaleCandle(BAR, 0.5);
    expect(scaled).toMatchObject({ open: 5, high: 6, low: 4.5, close: 5.5, volume: 500 });
  });

  it("exposes the interval for every chart timeframe", () => {
    expect(TIMEFRAME_SECONDS["1m"]).toBe(60);
    expect(TIMEFRAME_SECONDS["1h"]).toBe(3_600);
    expect(TIMEFRAME_SECONDS["1d"]).toBe(86_400);
  });
});
