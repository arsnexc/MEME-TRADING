import type { SortKey, ScreenerColumn } from "@/stores/preferences";

export type ScreenerColumnKey = "rank" | "token" | ScreenerColumn | "action";

export interface ColumnDef {
  key: ScreenerColumnKey;
  label: string;
  /** Fixed width in px. Only the token column grows. */
  width: number;
  align: "left" | "right";
  sortKey?: SortKey;
  /** Small qualifier rendered next to the label. */
  hint?: "window" | "traders";
  /** Structural columns (rank, token, action) cannot be hidden. */
  hideable: boolean;
}

/**
 * One source of truth for the screener grid: the header, the body cells, the
 * hidden-column menu and the minimum table width all read from this list, so a
 * column can never drift out of alignment with its own header.
 */
export const SCREENER_TABLE_COLUMNS: ColumnDef[] = [
  { key: "rank", label: "Rank", width: 56, align: "right", sortKey: "marketCap", hideable: false },
  { key: "token", label: "Token", width: 250, align: "left", hideable: false },
  { key: "price", label: "Price", width: 104, align: "right", sortKey: "price", hideable: true },
  { key: "change", label: "Change %", width: 100, align: "right", sortKey: "change", hint: "window", hideable: true },
  { key: "marketCap", label: "Market cap", width: 112, align: "right", sortKey: "marketCap", hideable: true },
  { key: "volume", label: "Volume", width: 108, align: "right", sortKey: "volume", hint: "window", hideable: true },
  { key: "liquidity", label: "Liquidity", width: 104, align: "right", sortKey: "liquidity", hideable: true },
  { key: "traders", label: "Traders", width: 96, align: "right", sortKey: "traders", hint: "traders", hideable: true },
  { key: "age", label: "Age", width: 82, align: "right", sortKey: "age", hideable: true },
  { key: "action", label: "Action", width: 84, align: "right", hideable: false },
];

export function visibleScreenerColumns(hidden: ScreenerColumn[]): ColumnDef[] {
  return SCREENER_TABLE_COLUMNS.filter((column) => !column.hideable || !hidden.includes(column.key as ScreenerColumn));
}

export function visibleScreenerColumnKeys(hidden: ScreenerColumn[]): Set<ScreenerColumnKey> {
  return new Set(visibleScreenerColumns(hidden).map((column) => column.key));
}

export function screenerMinWidth(columns: ColumnDef[]): number {
  return columns.reduce((total, column) => total + column.width, 0);
}

/** Sticky columns keep the identity of a row visible while scrolling sideways. */
export const STICKY_COLUMN_KEYS: ScreenerColumnKey[] = ["rank", "token"];
