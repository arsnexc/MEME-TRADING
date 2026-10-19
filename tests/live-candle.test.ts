import { describe, expect, it } from "vitest";
import { TIMEFRAME_SECONDS, mergeLiveTick } from "@/lib/market-data/live-candle";
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

  it("exposes the interval for every chart timeframe", () => {
    expect(TIMEFRAME_SECONDS["1m"]).toBe(60);
    expect(TIMEFRAME_SECONDS["1h"]).toBe(3_600);
    expect(TIMEFRAME_SECONDS["1d"]).toBe(86_400);
  });
});
