/**
 * Display formatting helpers.
 *
 * All monetary values are computed as IEEE-754 numbers but every formatter
 * takes care to avoid binary-float artefacts (1e-7 style tails) when rendering.
 * See lib/trading/decimals.ts for the arithmetic guards.
 */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const compactPrecise = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 3,
});

/** Turn 2.951e-7 into "0.0000002951" without an exponent. */
export function expandExponential(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const str = String(value);
  if (!/e/i.test(str)) return str;
  return value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.min(maxDecimals, 20),
    minimumFractionDigits: 0,
  }).format(value);
}

/** Compact USD formatting: $1.24M, $12.1K, $0.42. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1_000) return `$${compact.format(value)}`;
  if (abs >= 1) return `$${formatNumber(value, 2)}`;
  return `$${formatPrice(value).replace(/^\$/, "")}`;
}

/** Small-cap USD value (market cap / liquidity / volume) with a compact suffix. */
export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1_000) return `$${compact.format(value)}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

/**
 * Price formatting with sensible precision for micro-cap tokens.
 * Always returns a non-exponential decimal string.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1000) return `$${formatNumber(value, 2)}`;
  if (abs >= 1) return `$${formatNumber(value, 4)}`;
  if (abs >= 0.01) return `$${formatNumber(value, 5)}`;
  if (abs >= 0.0001) return `$${formatNumber(value, 7)}`;
  if (abs >= 1e-9) {
    const decimals = Math.min(18, Math.max(8, -Math.floor(Math.log10(abs)) + 3));
    return `$${expandExponential(Number(value.toFixed(decimals)))}`;
  }
  return `$${value.toExponential(2)}`;
}

/** Price in a quote currency, without the dollar sign. */
export function formatQuotePrice(value: number | null | undefined): string {
  const formatted = formatPrice(value);
  return formatted === "—" ? formatted : formatted.replace(/^\$/, "");
}

export function formatTokenAmount(value: number | null | undefined, maxDecimals = 6): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let decimals = maxDecimals;
  if (abs >= 1_000_000) decimals = Math.min(2, maxDecimals);
  else if (abs >= 1_000) decimals = Math.min(4, maxDecimals);
  const rounded = Number(value.toFixed(decimals));
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    notation: abs >= 1_000_000 ? "compact" : "standard",
  }).format(rounded);
}

export function formatQuote(value: number | null | undefined, quote: string, decimals = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)} ${quote}`;
}

export function formatUsdWithSymbol(value: number | null | undefined): string {
  return formatUsd(value);
}

export function formatPercent(value: number | null | undefined, opts?: { sign?: boolean; decimals?: number }): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = opts?.sign === false ? "" : value > 0 ? "+" : "";
  const decimals = opts?.decimals ?? 2;
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatSigned(value: number | null | undefined, decimals = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), decimals)}`;
}

export function pnlClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-muted";
  return value > 0 ? "text-buy" : "text-sell";
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1000) return formatNumber(value, Math.abs(value) < 1 ? 4 : 2);
  return compactPrecise.format(value);
}

export function formatTimestamp(ts: number | null | undefined, opts?: { withSeconds?: boolean }): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}

export function formatClock(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatAge(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function formatRelativeTime(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "—";
  const delta = Math.round((now - timestamp) / 1000);
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return formatTimestamp(timestamp);
}

/** Convert a USD price into the selected display currency using reference quote prices. */
export function convertUsd(
  usd: number | null | undefined,
  currency: "USD" | "SOL" | "ETH",
  quotePrices: Partial<Record<"SOL" | "ETH", number | null>>,
): number | null {
  if (usd == null || !Number.isFinite(usd)) return null;
  if (currency === "USD") return usd;
  const quoteUsd = quotePrices[currency];
  if (!quoteUsd || !Number.isFinite(quoteUsd) || quoteUsd <= 0) return null;
  return usd / quoteUsd;
}

/** Format a USD amount in the selected display currency. */
export function formatDisplayMoney(
  usd: number | null | undefined,
  currency: "USD" | "SOL" | "ETH",
  quotePrices: Partial<Record<"SOL" | "ETH", number | null>>,
  opts?: { compact?: boolean },
): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (currency === "USD") return opts?.compact ? formatUsdCompact(usd) : formatUsd(usd);
  const converted = convertUsd(usd, currency, quotePrices);
  if (converted == null) return "—";
  const formatted = opts?.compact ? formatCompact(converted) : formatNumber(converted, 4);
  return `${formatted} ${currency}`;
}

export function formatDisplayPrice(
  usd: number | null | undefined,
  currency: "USD" | "SOL" | "ETH",
  quotePrices: Partial<Record<"SOL" | "ETH", number | null>>,
): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (currency === "USD") return formatPrice(usd);
  const converted = convertUsd(usd, currency, quotePrices);
  if (converted == null) return "—";
  return `${formatPrice(converted).replace(/^\$/, "")} ${currency}`;
}

export function priceDecimalsFor(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value === 0) return 2;
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 7;
  return Math.min(18, Math.max(8, -Math.floor(Math.log10(abs)) + 3));
}
