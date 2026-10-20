import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PositionBar } from "@/components/terminal/position-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Position } from "@/lib/trading/types";

const POSITION: Position = {
  id: "pos-1",
  token: { network: "solana", pool: "pool", address: "token", symbol: "XDP", name: "XDP", imageUrl: null },
  quote: "SOL",
  quantity: 100,
  avgEntryPrice: 0.0001,
  costBasis: 0.01,
  realizedPnl: 0,
  feesPaid: 0.00005,
  openedAt: Date.now() - 90_000,
  updatedAt: Date.now(),
  lastPriceQuote: 0.00012,
  lastPriceAt: Date.now(),
  takeProfitPrice: 0.0002,
  stopLossPrice: 0.00008,
};

function renderBar(overrides: Partial<React.ComponentProps<typeof PositionBar>> = {}) {
  const onSell = vi.fn();
  const onAdd = vi.fn();
  const onEditExits = vi.fn();
  render(
    <TooltipProvider delayDuration={0}>
      <PositionBar
        position={POSITION}
        priceQuote={0.00012}
        quoteUsd={100}
        feeRateBps={50}
        onSell={onSell}
        onAdd={onAdd}
        onEditExits={onEditExits}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return { onSell, onAdd, onEditExits };
}

describe("position bar", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("shows the pair, size, entry, exits and floating PnL", () => {
    renderBar();
    expect(screen.getByText("XDP/SOL")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.tagName === "P" && (element.textContent ?? "").includes("100 held")),
    ).toBeInTheDocument();
    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("Mark")).toBeInTheDocument();
    expect(screen.getByText("SL 0.00008")).toBeInTheDocument();
    expect(screen.getByText("TP 0.0002")).toBeInTheDocument();
    // 100 tokens from 0.0001 to 0.00012 = +0.002 SOL, minus the exit fee.
    expect(screen.getByText(/\+0\.0019 SOL/)).toBeInTheDocument();
    expect(screen.getByText(/≈ \$0\.19/)).toBeInTheDocument();
  });

  it("needs two clicks before it sells, so a stray click cannot close a trade", () => {
    const { onSell } = renderBar();
    const button = screen.getByRole("button", { name: "SELL" });
    fireEvent.click(button);
    expect(onSell).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSell).toHaveBeenCalledTimes(1);
  });

  it("hands the add-to-position request to the ticket without trading", () => {
    const { onAdd, onSell } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "BUY" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSell).not.toHaveBeenCalled();
  });

  it("opens the exit editor", () => {
    const { onEditExits } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /edit take-profit/i }));
    expect(onEditExits).toHaveBeenCalledTimes(1);
  });

  it("says when an exit level is missing instead of inventing one", () => {
    renderBar({ position: { ...POSITION, takeProfitPrice: null } });
    expect(screen.getByText("TP not set")).toBeInTheDocument();
    expect(screen.getByText("no TP set")).toBeInTheDocument();
  });
});
