import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Candle, MarketTrade } from "@/lib/market-data/types";

/**
 * The chart must survive data refreshes and live ticks without snapping back.
 *
 * `series.setData()` rebuilds the series and resets the time scale, so the panel
 * may only call it when the candle window actually changed, and it has to put
 * the user's pan/zoom back afterwards. These cases drive the real ChartPanel
 * against a fake chart that records every call.
 */

const chartState = {
  setData: 0,
  update: 0,
  fit: 0,
  created: 0,
  restoreCalls: [] as { from: number; to: number }[],
  range: null as { from: number; to: number } | null,
  /** Bars the fake series currently holds, so backward updates can be caught. */
  lastTime: 0,
  backwardsUpdates: 0,
};

vi.mock("lightweight-charts", () => {
  const timeScale = () => ({
    fitContent: () => {
      chartState.fit += 1;
    },
    options: () => ({ barSpacing: 6 }),
    applyOptions: () => undefined,
    subscribeVisibleLogicalRangeChange: () => undefined,
    unsubscribeVisibleLogicalRangeChange: () => undefined,
    getVisibleLogicalRange: () => chartState.range,
    setVisibleLogicalRange: (range: { from: number; to: number }) => {
      chartState.restoreCalls.push({ ...range });
    },
  });
  const series = () => ({
    setData: (bars: { time: number }[]) => {
      chartState.setData += 1;
      const last = bars[bars.length - 1];
      chartState.lastTime = last ? Number(last.time) : 0;
    },
    update: (bar: { time: number }) => {
      if (Number(bar.time) < chartState.lastTime) chartState.backwardsUpdates += 1;
      chartState.update += 1;
      chartState.lastTime = Number(bar.time);
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
      chartState.created += 1;
      return {
        addSeries: () => series(),
        applyOptions: () => undefined,
        timeScale,
        priceScale: () => ({ applyOptions: () => undefined }),
        subscribeClick: () => undefined,
        subscribeCrosshairMove: () => undefined,
        unsubscribeClick: () => undefined,
        unsubscribeCrosshairMove: () => undefined,
        remove: () => undefined,
      };
    },
    createSeriesMarkers: () => ({ setMarkers: () => undefined, detach: () => undefined }),
  };
});

import { ChartPanel } from "@/components/terminal/chart-panel";

const T0 = 1_790_000_000;

function bars(count = 30, lastClose = 0.0125): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: T0 + index * 60,
    open: 0.012 + index * 0.00001,
    high: 0.0121 + index * 0.00001,
    low: 0.0119 + index * 0.00001,
    close: index === count - 1 ? lastClose : 0.012 + index * 0.00001,
    volume: 100 + index,
  }));
}

const QUOTES = { SOL: { usd: 105.74, at: 1 }, ETH: { usd: 2_400, at: 1 }, fetchedAt: 1 };

function view(props: {
  candles: Candle[];
  livePrice?: number | null;
  livePriceAt?: number | null;
  marketTrades?: MarketTrade[];
}) {
  return (
    <TooltipProvider>
      <ChartPanel
        symbol="XDP"
        network="solana"
        pool="pool"
        candles={props.candles}
        timeframe="1m"
        onTimeframeChange={() => undefined}
        loading={false}
        fetching={false}
        error={null}
        onRetry={() => undefined}
        quotePrices={QUOTES}
        currency="USD"
        paperTrades={[]}
        marketTrades={props.marketTrades ?? []}
        lastUpdated={1}
        stale={false}
        livePrice={props.livePrice ?? null}
        livePriceAt={props.livePriceAt ?? null}
      />
    </TooltipProvider>
  );
}

/** Fixed wall clock; the newest bar is the bucket that contains it. */
const NOW_SEC = T0 + 29 * 60;

describe("chart does not reset on ticks or polls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SEC * 1_000);
    chartState.setData = 0;
    chartState.update = 0;
    chartState.fit = 0;
    chartState.created = 0;
    chartState.restoreCalls = [];
    chartState.range = null;
    chartState.lastTime = 0;
    chartState.backwardsUpdates = 0;
  });

  it("tags the newest buy and sell from the public trade feed", () => {
    const now = Date.now();
    const trade = (id: string, side: "buy" | "sell", priceUsd: number, at: number): MarketTrade => ({
      id,
      side,
      priceUsd,
      baseAmount: 1,
      valueUsd: priceUsd,
      wallet: "wallet",
      txHash: `tx-${id}`,
      at,
    });

    const { container } = render(
      view({
        candles: bars(),
        marketTrades: [
          trade("1", "buy", 0.01255, now - 5_000),
          trade("2", "sell", 0.0124, now - 3_000),
          trade("3", "buy", 0.0126, now - 1_000),
        ],
      }),
    );

    expect(screen.getByText(/last trades/i)).toBeInTheDocument();
    // Newest trade of each side wins: the 0.0125 buy is superseded. The tags
    // are split text nodes, so assert on the block's text content.
    const tags = screen.getByText(/last trades/i).parentElement?.textContent ?? "";
    expect(tags).toContain("B $0.0126");
    expect(tags).toContain("S $0.0124");
    expect(container.textContent).not.toContain("0.01255");
  });

  it("omits the tags when the pool has no trades", () => {
    render(view({ candles: bars() }));
    expect(screen.queryByText(/last trades/i)).not.toBeInTheDocument();
  });

  it("ignores a poll that returns the same window as a fresh array", () => {
    const first = bars();
    const { rerender } = render(view({ candles: first }));
    const afterMount = chartState.setData;
    expect(afterMount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i += 1) {
      rerender(view({ candles: bars().map((bar) => ({ ...bar })) }));
    }

    expect(chartState.created).toBe(1);
    expect(chartState.setData).toBe(afterMount);
    expect(chartState.fit).toBe(1);
  });

  it("restores the panned window when new candles arrive", () => {
    const { rerender } = render(view({ candles: bars() }));
    // The user panned back into history.
    chartState.range = { from: 2, to: 12 };
    const before = chartState.setData;

    rerender(view({ candles: bars(30, 0.0135) }));

    expect(chartState.setData).toBe(before + 2); // candle series + volume
    expect(chartState.restoreCalls).toHaveLength(1);
    expect(chartState.restoreCalls[0]).toEqual({ from: 2, to: 12 });
    // Not re-fitted, or the pan would be lost anyway.
    expect(chartState.fit).toBe(1);
  });

  it("keeps following the newest bar when the user is at the live edge", () => {
    const { rerender } = render(view({ candles: bars() }));
    chartState.range = { from: 20, to: 29 };
    const before = chartState.setData;

    rerender(view({ candles: bars(30, 0.0135) }));

    expect(chartState.setData).toBe(before + 2);
    expect(chartState.restoreCalls).toHaveLength(0);
  });

  it("never sends an update that goes backwards in time", () => {
    const candles = bars();
    const at = (secondsFromT0: number) => (T0 + secondsFromT0) * 1_000;
    // The newest provider bar is the 08:29 bucket (T0+1740).
    const { rerender } = render(view({ candles, livePrice: 0.0126, livePriceAt: at(1745) }));
    expect(chartState.update).toBeGreaterThanOrEqual(1);

    // One minute later the tick opens a new bucket at T0+1800 (candle + volume).
    rerender(view({ candles, livePrice: 0.0127, livePriceAt: at(1805) }));
    const drawn = chartState.update;
    expect(drawn).toBeGreaterThanOrEqual(2);

    // A late tick (35s old, still inside the freshness window) lands back in
    // the T0+1740 bucket, which is older than the bar already on screen.
    // Without the monotonic guard this would throw inside the series.
    rerender(view({ candles, livePrice: 0.0128, livePriceAt: at(1775) }));

    expect(chartState.update).toBe(drawn);
    expect(chartState.backwardsUpdates).toBe(0);
    expect(chartState.created).toBe(1);
  });
});
