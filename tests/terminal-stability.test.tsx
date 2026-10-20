import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createInitialSnapshot } from "@/lib/trading/sanitize";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import { useHydrationStore } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { usePaperStore } from "@/stores/paper-trading";

/**
 * Regression: the terminal must not restart itself on a price tick.
 *
 * Providers hand back fresh arrays on every poll and React re-renders on every
 * live tick. That combination used to call `series.setData()` repeatedly, which
 * rebuilds the series and snaps the time scale back to the newest bar. This
 * suite renders the real TerminalView against a fake chart and asserts the
 * chart instance, the series data and the order ticket all survive two minutes
 * of ticks and polls.
 */

const stats = { created: 0, setData: 0, update: 0, fit: 0, removed: 0, restored: 0 };

vi.mock("lightweight-charts", () => {
  const timeScale = () => ({
    fitContent: () => {
      stats.fit += 1;
    },
    options: () => ({ barSpacing: 6 }),
    applyOptions: () => undefined,
    subscribeVisibleLogicalRangeChange: () => undefined,
    unsubscribeVisibleLogicalRangeChange: () => undefined,
    getVisibleLogicalRange: () => ({ from: 10, to: 40 }),
    setVisibleLogicalRange: () => {
      stats.restored += 1;
    },
  });
  const series = () => ({
    setData: () => {
      stats.setData += 1;
    },
    update: () => {
      stats.update += 1;
    },
    applyOptions: () => undefined,
    createPriceLine: () => ({ applyOptions: () => undefined }),
    removePriceLine: () => undefined,
    priceScale: () => ({ applyOptions: () => undefined }),
    priceToCoordinate: (p: number) => p,
    coordinateToPrice: (p: number) => p,
  });
  return {
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0, Hidden: 1 },
    LineStyle: { Solid: 0, Dashed: 1, Dotted: 2 },
    PriceScaleMode: { Normal: 0, Logarithmic: 1 },
    CandlestickSeries: {},
    HistogramSeries: {},
    createChart: () => {
      stats.created += 1;
      return {
        addSeries: () => series(),
        applyOptions: () => undefined,
        timeScale,
        priceScale: () => ({ applyOptions: () => undefined }),
        subscribeClick: () => undefined,
        subscribeCrosshairMove: () => undefined,
        unsubscribeClick: () => undefined,
        unsubscribeCrosshairMove: () => undefined,
        remove: () => {
          stats.removed += 1;
        },
      };
    },
    createSeriesMarkers: () => ({ setMarkers: () => undefined, detach: () => undefined }),
  };
});

const NOW = Date.UTC(2026, 9, 20, 8, 0, 0);

const MARKET: MarketToken = {
  id: "solana:pool1",
  network: "solana",
  quote: "SOL",
  pool: "pool1",
  tokenAddress: "token1",
  name: "Startup SI",
  symbol: "startupSI",
  priceUsd: 0.012,
  marketCapUsd: 11_000_000,
  fdvUsd: 11_000_000,
  marketCapIsFdv: false,
  liquidityUsd: 340_000,
  volumeUsd: { m5: 1, m15: 2, m30: 3, h1: 4, h6: 5, h24: 6 },
  changePct: { m5: 1, m15: 1, m30: 1, h1: 1, h6: 1, h24: 12 },
  txns: { h24: { buys: 10, sells: 5 } },
  poolCreatedAt: NOW - 86_400_000,
  imageUrl: null,
  websites: [],
  socials: [],
  dexId: "pumpswap",
  dexscreenerUrl: null,
  security: {
    lpLockedPct: 80,
    topHolderPct: null,
    mintAuthority: "unknown",
    freezeAuthority: "unknown",
    devHoldingsPct: null,
    dataSource: null,
    note: "",
  },
  source: "geckoterminal+dexscreener",
  updatedAt: NOW,
};

const QUOTES: QuotePrices = {
  SOL: { usd: 105.74, at: NOW },
  ETH: { usd: 2_400, at: NOW },
  fetchedAt: NOW,
};

const CANDLES = Array.from({ length: 30 }, (_, index) => {
  const open = 0.012 + index * 0.00001;
  return {
    time: Math.floor(NOW / 1000) - (30 - index) * 60,
    open,
    high: open + 0.00005,
    low: open - 0.00005,
    close: open + 0.00002,
    volume: 1_000 + index,
  };
});

let tick = 0;

vi.mock("@/lib/market-data/client", () => ({
  fetchTokenClient: async () => ({
    data: {
      market: MARKET,
      dexName: "pumpswap",
      quotePrices: QUOTES,
      fetchedAt: Date.now(),
      stale: false,
      warnings: [],
    },
    transport: "proxy",
    receivedAt: Date.now(),
  }),
  // A real API response is a brand new array every poll, even when the window
  // has not changed — that is what used to reset the chart.
  fetchOhlcvClient: async () => ({
    data: {
      candles: CANDLES.map((candle) => ({ ...candle })),
      timeframe: "5m",
      fetchedAt: Date.now(),
      stale: false,
      source: "geckoterminal",
      warnings: [],
    },
    transport: "proxy",
    receivedAt: Date.now(),
  }),
  fetchTradesClient: async () => ({
    data: {
      trades: [],
      fetchedAt: Date.now(),
      stale: false,
      warnings: [],
      window: { limit: 120, returns: 0, capped: false },
    },
    transport: "proxy",
    receivedAt: Date.now(),
  }),
  fetchPoolPriceClient: async () => {
    tick += 1;
    return {
      data: {
        network: "solana",
        pool: "pool1",
        priceUsd: 0.012 + tick * 0.00001,
        fetchedAt: Date.now(),
        source: "dexscreener",
      },
      transport: "proxy",
      receivedAt: Date.now(),
    };
  },
}));

import { TerminalView } from "@/components/terminal/terminal-view";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await flush();
}

describe("terminal stability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tick = 0;
    stats.created = 0;
    stats.setData = 0;
    stats.update = 0;
    stats.fit = 0;
    stats.removed = 0;
    stats.restored = 0;
    useHydrationStore.setState({ hydrated: true });
    usePaperStore.setState({ ...createInitialSnapshot(), positions: [], trades: [], orders: [] });
    useMarketStore.setState({ quotePrices: QUOTES, snapshots: {}, lastListUpdate: null });
  });

  it("keeps the chart, the series and the ticket across two minutes of ticks", async () => {
    render(
      <TooltipProvider>
        <TerminalView network="solana" pool="pool1" tokenAddress="token1" />
      </TooltipProvider>,
    );

    await advance(50);
    expect(stats.created).toBe(1);

    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12.5" } });
    const setDataAfterMount = stats.setData;

    // 40 ticks at the 3s live cadence: crosses five 30s OHLCV polls and two
    // 45s market-detail polls.
    for (let i = 0; i < 40; i += 1) {
      await advance(3_000);
    }

    expect(stats.created).toBe(1);
    expect(stats.removed).toBe(0);
    // Identical poll payloads never rebuild the series.
    expect(stats.setData).toBe(setDataAfterMount);
    // Every tick still lands on the forming bar.
    expect(stats.update).toBeGreaterThanOrEqual(40);
    // The chart is fitted once per symbol/timeframe, not per tick.
    expect(stats.fit).toBe(1);
    // The user's typed amount is untouched.
    expect(input.value).toBe("12.5");
  }, 30_000);
});
