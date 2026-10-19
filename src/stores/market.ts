"use client";

import { create } from "zustand";
import type { NetworkId } from "@/lib/constants";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";

interface MarketState {
  quotePrices: QuotePrices;
  snapshots: Record<string, MarketToken>;
  lastListUpdate: number | null;
  setQuotePrices: (prices: QuotePrices) => void;
  upsertTokens: (tokens: MarketToken[]) => void;
  getToken: (network: NetworkId, address: string) => MarketToken | null;
}

const EMPTY_PRICES: QuotePrices = { SOL: null, ETH: null, fetchedAt: 0 };

export const useMarketStore = create<MarketState>()((set, get) => ({
  quotePrices: EMPTY_PRICES,
  snapshots: {},
  lastListUpdate: null,
  setQuotePrices: (prices) => set({ quotePrices: prices }),
  upsertTokens: (tokens) =>
    set((state) => {
      const snapshots = { ...state.snapshots };
      for (const token of tokens) {
        snapshots[`${token.network}:${token.tokenAddress}`] = token;
      }
      return { snapshots, lastListUpdate: Date.now() };
    }),
  getToken: (network, address) => get().snapshots[`${network}:${address}`] ?? null,
}));

export function selectOpenOrderTokens(state: { orders: { status: string; token: { network: NetworkId; address: string; pool: string; symbol: string; name: string; imageUrl: string | null } }[] }) {
  const seen = new Set<string>();
  return state.orders
    .filter((order) => order.status === "open")
    .filter((order) => {
      const key = `${order.token.network}:${order.token.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((order) => order.token);
}
