"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isNetworkId, type NetworkId } from "@/lib/constants";
import { createSafeStorage } from "@/lib/trading/sanitize";
import type { TokenRef } from "@/lib/trading/types";
import { uid } from "@/lib/utils";

export interface WatchlistEntry extends TokenRef {
  id: string;
  addedAt: number;
}

interface WatchlistState {
  entries: WatchlistEntry[];
  add: (token: TokenRef) => boolean;
  remove: (network: NetworkId, address: string) => void;
  toggle: (token: TokenRef) => boolean;
  has: (network: NetworkId, address: string) => boolean;
}

const MAX_ENTRIES = 100;

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      entries: [],
      add: (token) => {
        if (!isNetworkId(token?.network)) return false;
        const exists = get().entries.some(
          (entry) => entry.network === token.network && entry.address === token.address,
        );
        if (exists) return false;
        set((state) => ({
          entries: [
            { ...token, id: uid("watch"), addedAt: Date.now() },
            ...state.entries,
          ].slice(0, MAX_ENTRIES),
        }));
        return true;
      },
      remove: (network, address) =>
        set((state) => ({
          entries: state.entries.filter((entry) => !(entry.network === network && entry.address === address)),
        })),
      toggle: (token) => {
        if (get().has(token.network, token.address)) {
          get().remove(token.network, token.address);
          return false;
        }
        return get().add(token);
      },
      has: (network, address) =>
        get().entries.some((entry) => entry.network === network && entry.address === address),
    }),
    {
      name: "memescope.watchlist.v1",
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
      skipHydration: true,
      partialize: (state) => ({ entries: state.entries }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<WatchlistState> | undefined;
        if (!saved || !Array.isArray(saved.entries)) return current;
        const entries = saved.entries
          .filter(
            (entry): entry is WatchlistEntry =>
              !!entry &&
              typeof entry === "object" &&
              typeof entry.address === "string" &&
              typeof entry.pool === "string" &&
              isNetworkId(entry.network) &&
              typeof entry.symbol === "string",
          )
          .slice(0, MAX_ENTRIES);
        return { ...current, entries };
      },
    },
  ),
);
