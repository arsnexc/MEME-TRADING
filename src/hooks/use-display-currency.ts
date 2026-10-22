"use client";

import { usePreferencesStore } from "@/stores/preferences";
import { useMarketStore } from "@/stores/market";
import type { DisplayCurrency } from "@/lib/constants";
import {
  convertUsd,
  formatDisplayMoney,
  formatDisplayPrice,
} from "@/lib/formatting";

export function useDisplayCurrency() {
  const currency = usePreferencesStore((state) => state.displayCurrency);
  const setCurrency = usePreferencesStore((state) => state.setDisplayCurrency);
  const quotePrices = useMarketStore((state) => state.quotePrices);
  const priceMap = {
    SOL: quotePrices.SOL?.usd ?? null,
    ETH: quotePrices.ETH?.usd ?? null,
  };

  return {
    currency,
    setCurrency,
    quotePrices,
    priceMap,
    formatMoney: (usd: number | null | undefined, opts?: { compact?: boolean }) =>
      formatDisplayMoney(usd, currency, priceMap, opts),
    formatPrice: (usd: number | null | undefined) => formatDisplayPrice(usd, currency, priceMap),
    convert: (usd: number | null | undefined) => convertUsd(usd, currency, priceMap),
  };
}

export type { DisplayCurrency };
