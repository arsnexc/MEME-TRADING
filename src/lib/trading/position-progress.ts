import type { Position } from "./types";

export interface PositionProgress {
  /** Percent positions (0–100) of each marker along the bar. */
  entryPct: number;
  currentPct: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
  /** Lowest and highest price the bar represents. */
  low: number;
  high: number;
  /** Net PnL in the quote currency, after the estimated exit fee. */
  netPnlQuote: number;
  pnlPct: number;
  /** How far the trade has travelled from entry toward take profit, 0–1. */
  towardTarget: number | null;
}

const MIN_SPAN = 0.000_001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Geometry for the position progress bar.
 *
 * The bar always spans from the stop level (or a modest fallback below entry)
 * to the take-profit level (or a modest fallback above entry), so the entry,
 * current price and both exits stay readable even when only one level is set.
 * Pure: the component and the tests share exactly the same numbers.
 */
export function positionProgress(
  position: Position,
  currentPrice: number,
  feeRateBps: number,
): PositionProgress {
  const entry = position.avgEntryPrice;
  const tp = position.takeProfitPrice ?? null;
  const sl = position.stopLossPrice ?? null;

  const hasTp = tp != null && Number.isFinite(tp) && tp > entry;
  const hasSl = sl != null && Number.isFinite(sl) && sl > 0 && sl < entry;

  // Fallbacks keep the entry roughly centred when a level is missing.
  const fallbackUp = Math.max(entry * 0.1, 0.000_001);
  const fallbackDown = Math.max(entry * 0.1, 0.000_001);
  const high = hasTp ? (tp as number) : entry + (hasSl ? (entry - (sl as number)) : fallbackUp);
  const low = hasSl ? (sl as number) : entry - (hasTp ? ((tp as number) - entry) : fallbackDown);

  const span = Math.max(high - low, MIN_SPAN);
  const pct = (price: number) => clamp(((price - low) / span) * 100, 0, 100);

  const exitFee = (position.quantity * currentPrice * feeRateBps) / 10_000;
  const marketValue = position.quantity * currentPrice;
  const netPnlQuote = marketValue - position.costBasis - exitFee;
  const pnlPct = position.costBasis > 0 ? (netPnlQuote / position.costBasis) * 100 : 0;

  return {
    entryPct: pct(entry),
    currentPct: pct(currentPrice),
    takeProfitPct: hasTp ? pct(tp as number) : null,
    stopLossPct: hasSl ? pct(sl as number) : null,
    low,
    high,
    netPnlQuote,
    pnlPct,
    towardTarget: hasTp && tp! > entry ? clamp((currentPrice - entry) / (tp! - entry), 0, 1) : null,
  };
}

/** "3m 12s" / "1h 04m" — compact, no seconds above an hour. */
export function formatHeld(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}
