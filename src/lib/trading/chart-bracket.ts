/**
 * Pure helpers for the on-chart TP/SL bracket.
 *
 * The chart draws prices converted to the selected display currency, while the
 * paper engine stores levels in the account's quote currency. These helpers are
 * the single place that conversion happens, so a dragged level can never be
 * written back in the wrong units.
 */

export type BracketLevel = "tp" | "sl";

/** Default offsets used when a level is switched on from the chart. */
export const DEFAULT_TAKE_PROFIT_PCT = 50;
export const DEFAULT_STOP_LOSS_PCT = 20;

/** Chart value → quote price. */
export function toChartValue(priceQuote: number, multiplier: number): number {
  if (!Number.isFinite(priceQuote) || !Number.isFinite(multiplier) || multiplier <= 0) return Number.NaN;
  return priceQuote * multiplier;
}

/** Quote price → chart value. */
export function toQuotePrice(value: number, multiplier: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(multiplier) || multiplier <= 0) return Number.NaN;
  return value / multiplier;
}

export function defaultLevel(level: BracketLevel, entry: number): number {
  const pct = level === "tp" ? DEFAULT_TAKE_PROFIT_PCT : DEFAULT_STOP_LOSS_PCT;
  return level === "tp" ? entry * (1 + pct / 100) : entry * (1 - pct / 100);
}

/**
 * Chip behaviour: a level that exists is cleared, a missing one is created at
 * the default offset. Toggling never leaves an invalid level behind.
 */
export function toggleLevel(level: BracketLevel, current: number | null | undefined, entry: number): number | null {
  if (current != null && Number.isFinite(current)) return null;
  if (!Number.isFinite(entry) || entry <= 0) return null;
  return defaultLevel(level, entry);
}

/**
 * Validate a dragged price before it reaches the store. Take profit must sit
 * above entry and stop loss below it; anything else is rejected so a drag
 * cannot create an instantly-triggered exit.
 */
export function validateLevel(level: BracketLevel, price: number, entry: number): boolean {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(entry) || entry <= 0) return false;
  return level === "tp" ? price > entry : price < entry;
}

/** Percentage distance from entry, signed, for the chip labels. */
export function levelPct(price: number | null | undefined, entry: number): number | null {
  if (price == null || !Number.isFinite(price) || !Number.isFinite(entry) || entry <= 0) return null;
  return ((price - entry) / entry) * 100;
}
