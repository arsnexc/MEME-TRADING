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

/**
 * Tokens that need a background price tick.
 *
 * Covers both resting limit orders and positions carrying a take-profit or
 * stop-loss level, so automatic exits are evaluated even when the user is not
 * looking at that token's terminal.
 */
export function selectWatchedTokens(state: {
  orders: { status: string; token: { network: NetworkId; address: string; pool: string; symbol: string; name: string; imageUrl: string | null } }[];
  positions: { quantity: number; takeProfitPrice?: number | null; stopLossPrice?: number | null; token: { network: NetworkId; address: string; pool: string; symbol: string; name: string; imageUrl: string | null } }[];
}) {
  const seen = new Set<string>();
  const tokens: { network: NetworkId; address: string; pool: string; symbol: string; name: string; imageUrl: string | null }[] = [];
  const push = (token: { network: NetworkId; address: string; pool: string; symbol: string; name: string; imageUrl: string | null }) => {
    const key = `${token.network}:${token.address}`;
    if (seen.has(key) || tokens.length >= 8) return;
    seen.add(key);
    tokens.push(token);
  };
  for (const order of state.orders) {
    if (order.status !== "open") continue;
    push(order.token);
  }
  for (const position of state.positions) {
    if (position.takeProfitPrice == null && position.stopLossPrice == null) continue;
    push(position.token);
  }
  return tokens;
}
