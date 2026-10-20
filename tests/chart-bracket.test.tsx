import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { ChartBracket, type ChartBracketData } from "@/components/terminal/chart-bracket";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  defaultLevel,
  levelPct,
  toChartValue,
  toQuotePrice,
  toggleLevel,
  validateLevel,
} from "@/lib/trading/chart-bracket";

const ENTRY = 0.0001;

const DATA: ChartBracketData = {
  entryQuote: ENTRY,
  takeProfitQuote: 0.0002,
  stopLossQuote: 0.00008,
  quote: "SOL",
  symbol: "XDP",
  netPnlQuote: 0.002,
  usdPnl: 0.2,
};

/** Fake chart: y = 200 − price × 1e6, so entry sits at 100, TP at 0, SL at 120. */
function refs() {
  const series = {
    priceToCoordinate: (price: number) => 200 - price * 1_000_000,
    coordinateToPrice: (y: number) => (200 - y) / 1_000_000,
  } as unknown as ISeriesApi<"Candlestick">;
  const chart = {
    timeScale: () => ({
      subscribeVisibleLogicalRangeChange: () => undefined,
      unsubscribeVisibleLogicalRangeChange: () => undefined,
    }),
  } as unknown as IChartApi;
  return {
    chartRef: { current: chart } as React.RefObject<IChartApi | null>,
    seriesRef: { current: series } as React.RefObject<ISeriesApi<"Candlestick"> | null>,
  };
}

function renderBracket(overrides: Partial<ChartBracketData> = {}) {
  const onSetLevel = vi.fn();
  const onClosePosition = vi.fn();
  const { chartRef, seriesRef } = refs();
  render(
    <TooltipProvider delayDuration={0}>
      <ChartBracket
        chartRef={chartRef}
        seriesRef={seriesRef}
        multiplier={1}
        data={{ ...DATA, ...overrides }}
        version={1}
        onSetLevel={onSetLevel}
        onClosePosition={onClosePosition}
      />
    </TooltipProvider>,
  );
  return { onSetLevel, onClosePosition };
}

describe("chart bracket geometry helpers", () => {
  it("round-trips quote prices through the chart display value", () => {
    expect(toChartValue(0.0001, 100)).toBeCloseTo(0.01, 12);
    expect(toQuotePrice(0.01, 100)).toBeCloseTo(0.0001, 12);
    expect(toChartValue(0.0001, 1)).toBe(0.0001);
    expect(Number.isNaN(toQuotePrice(1, 0))).toBe(true);
  });

  it("creates sensible defaults and toggles cleanly", () => {
    expect(defaultLevel("tp", ENTRY)).toBeCloseTo(ENTRY * 1.5, 12);
    expect(defaultLevel("sl", ENTRY)).toBeCloseTo(ENTRY * 0.8, 12);
    expect(toggleLevel("tp", null, ENTRY)).toBeCloseTo(ENTRY * 1.5, 12);
    expect(toggleLevel("tp", 0.0002, ENTRY)).toBeNull();
    expect(toggleLevel("sl", undefined, ENTRY)).toBeCloseTo(ENTRY * 0.8, 12);
    // A broken entry never produces a level.
    expect(toggleLevel("tp", null, 0)).toBeNull();
  });

  it("rejects levels on the wrong side of entry", () => {
    expect(validateLevel("tp", ENTRY * 1.1, ENTRY)).toBe(true);
    expect(validateLevel("tp", ENTRY * 0.9, ENTRY)).toBe(false);
    expect(validateLevel("sl", ENTRY * 0.9, ENTRY)).toBe(true);
    expect(validateLevel("sl", ENTRY * 1.1, ENTRY)).toBe(false);
    expect(validateLevel("tp", Number.NaN, ENTRY)).toBe(false);
    expect(validateLevel("sl", 0.0001, 0)).toBe(false);
  });

  it("reports signed distance from entry", () => {
    expect(levelPct(0.0002, ENTRY)).toBeCloseTo(100, 9);
    expect(levelPct(0.00008, ENTRY)).toBeCloseTo(-20, 9);
    expect(levelPct(null, ENTRY)).toBeNull();
  });
});

describe("chart bracket overlay", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  });

  it("shows the entry pill with PnL in the quote currency and USD", () => {
    renderBracket();
    expect(screen.getByText("+0.002")).toBeInTheDocument();
    expect(screen.getByText("+$0.20 USD")).toBeInTheDocument();
    expect(screen.getByText("TP 0.0002")).toBeInTheDocument();
    expect(screen.getByText("SL 0.00008")).toBeInTheDocument();
  });

  it("switches a level off when it is on", () => {
    const { onSetLevel } = renderBracket();
    fireEvent.click(screen.getByRole("button", { name: "TP" }));
    expect(onSetLevel).toHaveBeenCalledWith("tp", null);
    fireEvent.click(screen.getByRole("button", { name: "SL" }));
    expect(onSetLevel).toHaveBeenCalledWith("sl", null);
  });

  it("switches a missing level on at the default offset", () => {
    const { onSetLevel } = renderBracket({ takeProfitQuote: null, stopLossQuote: null });
    expect(screen.queryByText("TP 0.0002")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TP" }));
    expect(onSetLevel).toHaveBeenCalledWith("tp", ENTRY * 1.5);
    fireEvent.click(screen.getByRole("button", { name: "SL" }));
    expect(onSetLevel).toHaveBeenCalledWith("sl", ENTRY * 0.8);
  });

  it("writes a dragged level back in quote currency", () => {
    const { onSetLevel } = renderBracket();
    const handle = screen.getByRole("button", { name: "Drag take profit" });
    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 50, pointerId: 1 });
    // y = 50 maps to 0.00015 in the fake chart.
    expect(onSetLevel).toHaveBeenCalledWith("tp", 0.00015);
  });

  it("refuses a drag that would put take profit below entry", () => {
    const { onSetLevel } = renderBracket();
    const handle = screen.getByRole("button", { name: "Drag take profit" });
    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 150, pointerId: 1 });
    expect(onSetLevel).not.toHaveBeenCalled();
  });

  it("needs two clicks on the close button before closing the position", () => {
    const { onClosePosition } = renderBracket();
    const button = screen.getByRole("button", { name: "Close position" });
    fireEvent.click(button);
    expect(onClosePosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm close position" }));
    expect(onClosePosition).toHaveBeenCalledTimes(1);
  });

  it("renders nothing on the price scale when the series cannot map prices", () => {
    const emptySeries = {
      priceToCoordinate: () => null,
      coordinateToPrice: () => null,
    } as unknown as ISeriesApi<"Candlestick">;
    render(
      <TooltipProvider delayDuration={0}>
        <ChartBracket
          chartRef={{ current: null }}
          seriesRef={{ current: emptySeries }}
          multiplier={1}
          data={DATA}
          version={1}
          onSetLevel={() => undefined}
          onClosePosition={() => undefined}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "TP" })).not.toBeInTheDocument();
  });
});
