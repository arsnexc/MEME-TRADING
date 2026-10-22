/**
 * Arithmetic guards for the paper-trading engine.
 *
 * Values are stored as doubles (the same representation used by the market-data
 * providers). We normalise to 12 decimal places after every operation so that
 * repeated fee/basis calculations don't accumulate binary-float drift, and use
 * an explicit epsilon when comparing balances and token quantities.
 */

export const DECIMAL_PLACES = 12;
export const EPSILON = 1e-9;
const SCALE = 10 ** DECIMAL_PLACES;

/** Round to 12 decimal places, avoiding float tails like 0.30000000000000004. */
export function d(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * SCALE) / SCALE;
}

export function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return d(value);
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function minBalance(a: number, b: number): number {
  return d(Math.min(a, b));
}

export function withinEpsilon(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

/** Multiply price * quantity and round consistently. */
export function notional(price: number, quantity: number): number {
  return d(price * quantity);
}
