"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DisplayCurrency, NetworkId, ScannerTimeframe } from "@/lib/constants";
import { createSafeStorage } from "@/lib/trading/sanitize";

export type SortKey =
  | "marketCap"
  | "liquidity"
  | "volume"
  | "change"
  | "price"
  | "age"
  | "txns"
  | "traders";
export type SortDirection = "asc" | "desc";

/**
 * Columns a desktop screener user may hide. Rank, token and the buy action are
 * structural and always shown, so they are not part of this union.
 */
export type ScreenerColumn = "price" | "change" | "marketCap" | "volume" | "liquidity" | "traders" | "age";
export const SCREENER_COLUMNS: ScreenerColumn[] = [
  "price",
  "change",
  "marketCap",
  "volume",
  "liquidity",
  "traders",
  "age",
];

interface PreferencesState {
  displayCurrency: DisplayCurrency;
  scannerTimeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  networkFilter: NetworkId[] | null;
  /** Rows per screener page. Validated against SCREENER_PAGE_SIZES on load. */
  screenerPageSize: number;
  /** Columns the user chose to hide; everything else is shown. */
  hiddenColumns: ScreenerColumn[];
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  setScannerTimeframe: (timeframe: ScannerTimeframe) => void;
  setSort: (key: SortKey) => void;
  setNetworkFilter: (networks: NetworkId[] | null) => void;
  setScreenerPageSize: (size: number) => void;
  toggleColumn: (column: ScreenerColumn) => void;
  resetColumns: () => void;
}

const DEFAULTS = {
  displayCurrency: "USD" as DisplayCurrency,
  scannerTimeframe: "h24" as ScannerTimeframe,
  // The screener opens as a market-cap ranking.
  sortKey: "marketCap" as SortKey,
  sortDirection: "desc" as SortDirection,
  networkFilter: null as NetworkId[] | null,
  screenerPageSize: 50,
  hiddenColumns: [] as ScreenerColumn[],
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setDisplayCurrency: (currency) => set({ displayCurrency: currency }),
      setScannerTimeframe: (timeframe) => set({ scannerTimeframe: timeframe }),
      setSort: (key) =>
        set((state) => ({
          sortKey: key,
          sortDirection: state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc",
        })),
      setNetworkFilter: (networks) => set({ networkFilter: networks }),
      setScreenerPageSize: (size) => set({ screenerPageSize: size }),
      toggleColumn: (column) =>
        set((state) => ({
          hiddenColumns: state.hiddenColumns.includes(column)
            ? state.hiddenColumns.filter((item) => item !== column)
            : [...state.hiddenColumns, column],
        })),
      resetColumns: () => set({ hiddenColumns: [] }),
    }),
    {
      name: "memescope.preferences.v1",
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
      skipHydration: true,
      partialize: (state) => ({
        displayCurrency: state.displayCurrency,
        scannerTimeframe: state.scannerTimeframe,
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
        networkFilter: state.networkFilter,
        screenerPageSize: state.screenerPageSize,
        hiddenColumns: state.hiddenColumns,
      }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const saved = persisted as Partial<PreferencesState>;
        return {
          ...current,
          displayCurrency: ["USD", "SOL", "ETH"].includes(saved.displayCurrency as string)
            ? (saved.displayCurrency as DisplayCurrency)
            : current.displayCurrency,
          scannerTimeframe: ["m5", "m15", "m30", "h1", "h6", "h24"].includes(saved.scannerTimeframe as string)
            ? (saved.scannerTimeframe as ScannerTimeframe)
            : current.scannerTimeframe,
          sortKey: ["marketCap", "liquidity", "volume", "change", "price", "age", "txns", "traders"].includes(
            saved.sortKey as string,
          )
            ? (saved.sortKey as SortKey)
            : current.sortKey,
          sortDirection: saved.sortDirection === "asc" ? "asc" : "desc",
          networkFilter: Array.isArray(saved.networkFilter)
            ? saved.networkFilter.filter((n): n is NetworkId => ["solana", "eth", "base"].includes(n))
            : null,
          screenerPageSize: [25, 50, 100].includes(saved.screenerPageSize as number)
            ? (saved.screenerPageSize as number)
            : current.screenerPageSize,
          hiddenColumns: Array.isArray(saved.hiddenColumns)
            ? saved.hiddenColumns.filter((column): column is ScreenerColumn =>
                SCREENER_COLUMNS.includes(column as ScreenerColumn),
              )
            : current.hiddenColumns,
        };
      },
    },
  ),
);
