import type { MarketToken } from "@/lib/market-data/types";
import { scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
import { tokenKey, traderCount, type ScreenerRow } from "@/lib/market-view";

/**
 * CSV export of the rows currently on screen.
 *
 * Numbers are written at full provider precision (no compact "1.2M" strings) so
 * the file can be sorted and charted in a spreadsheet. Anything the provider did
 * not publish is left empty rather than zero-filled — a zero in a spreadsheet is
 * a number, an empty cell is "unknown".
 */
function quoteCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function optionalNumber(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

export function screenerCsv(
  rows: MarketToken[],
  options: { ranks: Map<string, number>; timeframe: ScannerTimeframe },
): string {
  const window = scannerTimeframeLabel(options.timeframe);
  const header = [
    "Rank",
    "Symbol",
    "Name",
    "Network",
    "Price USD",
    `Change ${window} %`,
    "Market cap USD",
    "Market cap basis",
    "FDV USD",
    "Liquidity USD",
    `Volume ${window} USD`,
    `Buyers ${window}`,
    `Sellers ${window}`,
    `Traders ${window}`,
    "Oldest pool created",
    "Pools aggregated",
    "DEX",
    "Pool address",
    "Token address",
  ];

  const lines = rows.map((row) => {
    const txns = row.txns[options.timeframe];
    const pools = (row as Partial<ScreenerRow>).poolCount ?? 1;
    return [
      options.ranks.get(row.id) ?? null,
      row.symbol,
      row.name,
      row.network,
      optionalNumber(row.priceUsd),
      optionalNumber(row.changePct[options.timeframe]),
      optionalNumber(row.marketCapUsd),
      row.marketCapUsd == null ? null : row.marketCapIsFdv ? "FDV (supply unpublished)" : "reported",
      optionalNumber(row.fdvUsd),
      optionalNumber(row.liquidityUsd),
      optionalNumber(row.volumeUsd[options.timeframe]),
      txns?.buyers ?? null,
      txns?.sellers ?? null,
      traderCount(row, options.timeframe),
      row.poolCreatedAt == null ? null : new Date(row.poolCreatedAt).toISOString(),
      pools,
      row.dexId,
      row.pool,
      row.tokenAddress,
    ]
      .map(quoteCell)
      .join(",");
  });

  return [header.map(quoteCell).join(","), ...lines].join("\n");
}

/** Timestamped filename, local time, so repeated exports never overwrite silently. */
export function screenerCsvFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    "memescope-screener",
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}`,
  ].join("-") + ".csv";
}

/** Browser-only download. Returns false when there is nothing to export. */
export function downloadCsv(csv: string, filename = screenerCsvFilename()): boolean {
  if (!csv || typeof document === "undefined") return false;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next task so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** Unique-token count helper shared by the header counters. */
export function uniqueTokenCount(rows: MarketToken[]): number {
  return new Set(rows.map(tokenKey)).size;
}
