export interface ValidationResult {
  ok: boolean;
  value: number | null;
  error: string | null;
}

const NUMERIC_INPUT = /^\d*(?:\.\d*)?$/;

/**
 * Parse a controlled amount input without accepting scientific notation,
 * negatives, NaN or Infinity. Empty input is "no value yet", not an error.
 */
export function parseAmountInput(input: string, options: { maxDecimals?: number; max?: number } = {}): ValidationResult {
  const maxDecimals = options.maxDecimals ?? 9;
  const max = options.max ?? 1_000_000_000_000;
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, value: null, error: null };
  if (!NUMERIC_INPUT.test(trimmed)) return { ok: false, value: null, error: "Enter a positive number." };
  if (trimmed === "." || trimmed === "") return { ok: false, value: null, error: null };
  const decimals = trimmed.split(".")[1]?.length ?? 0;
  if (decimals > maxDecimals) return { ok: false, value: null, error: `Maximum ${maxDecimals} decimals.` };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, value: null, error: "Enter a valid number." };
  if (value <= 0) return { ok: false, value: null, error: "Amount must be greater than zero." };
  if (value > max) return { ok: false, value: null, error: "Amount is too large." };
  return { ok: true, value, error: null };
}

export function formatInputValue(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number(value.toFixed(maxDecimals)).toString();
}

export function isFreshPrice(lastUpdated: number | null | undefined, maxAgeMs = 60_000): boolean {
  return typeof lastUpdated === "number" && Number.isFinite(lastUpdated) && Date.now() - lastUpdated <= maxAgeMs;
}
