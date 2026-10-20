import type { ChartTimeframe } from "@/lib/constants";
import type { Candle } from "./types";

/** Seconds per chart timeframe. Kept next to the merge logic that depends on it. */
export const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
};

export interface LiveBar {
  /** Unix seconds of the bar being edited. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** True when the tick opened a new bar after the provider's last one closed. */
  openedNewBar: boolean;
}

/**
 * Convert a provider candle (USD) into the chart's display currency.
 *
 * Every value that reaches the series — history, the forming bar and the legend —
 * must go through this, otherwise a quote-currency chart mixes two scales and a
 * single bar can be a hundred times taller than the rest of the series.
 */
export function scaleCandle(candle: Candle, factor: number): Candle {
  if (!Number.isFinite(factor) || factor <= 0) return candle;
  return {
    ...candle,
    open: candle.open * factor,
    high: candle.high * factor,
    low: candle.low * factor,
    close: candle.close * factor,
  };
}

/**
 * Fold one provider price into the newest candle.
 *
 * This only ever edits the bar that is still forming (extending its high/low and
 * moving the close) or opens the immediately following bar with the previous
 * close. It never rewrites older bars, and it refuses to invent a run of bars
 * when the provider has not delivered them yet — the caller simply keeps the
 * last known chart state and waits for the next fetch.
 *
 * All prices in and out are in the chart's display currency: scale the candle
 * with `scaleCandle` before passing it in, never a raw USD candle.
 */
export function mergeLiveTick(options: {
  last: Candle | null | undefined;
  /** Latest price, already multiplied by the display-currency factor. */
  price: number;
  /** Wall-clock time of the tick in epoch milliseconds. */
  tickMs: number;
  intervalSeconds: number;
}): LiveBar | null {
  const { last, price, tickMs, intervalSeconds } = options;
  if (!last) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return null;
  if (!Number.isFinite(tickMs)) return null;

  const tickSec = Math.floor(tickMs / 1000);
  const barEnd = last.time + intervalSeconds;

  if (tickSec >= barEnd) {
    // Exactly one bucket behind: start the next bar at the previous close.
    if (tickSec >= barEnd + intervalSeconds) return null;
    return {
      time: barEnd,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      openedNewBar: true,
    };
  }

  return {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
    close: price,
    openedNewBar: false,
  };
}
