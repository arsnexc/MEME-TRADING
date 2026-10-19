"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DisplayCurrency, NetworkId, ScannerTimeframe } from "@/lib/constants";
import { createSafeStorage } from "@/lib/trading/sanitize";

export type SortKey = "marketCap" | "liquidity" | "volume" | "change";
export type SortDirection = "asc" | "desc";

interface PreferencesState {
  displayCurrency: DisplayCurrency;
  scannerTimeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  networkFilter: NetworkId[] | null;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  setScannerTimeframe: (timeframe: ScannerTimeframe) => void;
  setSort: (key: SortKey) => void;
  setNetworkFilter: (networks: NetworkId[] | null) => void;
}

const DEFAULTS = {
  displayCurrency: "USD" as DisplayCurrency,
  scannerTimeframe: "h24" as ScannerTimeframe,
  sortKey: "volume" as SortKey,
  sortDirection: "desc" as SortDirection,
  networkFilter: null as NetworkId[] | null,
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
          sortKey: ["marketCap", "liquidity", "volume", "change"].includes(saved.sortKey as string)
            ? (saved.sortKey as SortKey)
            : current.sortKey,
          sortDirection: saved.sortDirection === "asc" ? "asc" : "desc",
          networkFilter: Array.isArray(saved.networkFilter)
            ? saved.networkFilter.filter((n): n is NetworkId => ["solana", "eth", "base"].includes(n))
            : null,
        };
      },
    },
  ),
);
