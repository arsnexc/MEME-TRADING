import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PositionsTable } from "@/components/terminal/positions-table";
import { OrdersTable } from "@/components/terminal/orders-table";
import { CalloutComposer } from "@/components/terminal/callouts";
import { useCalloutStore } from "@/stores/callouts";
import { useHydrationStore } from "@/stores/hydration";
import type { LimitOrder, Position, TokenRef } from "@/lib/trading/types";

const token: TokenRef = {
  network: "solana",
  pool: "pool123",
  address: "token123",
  symbol: "TEST",
  name: "Test Token",
  imageUrl: null,
};

const position: Position = {
  id: "pos-1",
  token,
  quote: "SOL",
  quantity: 1_000_000,
  avgEntryPrice: 0.00005,
  costBasis: 50,
  realizedPnl: 0,
  feesPaid: 0.01,
  openedAt: Date.now() - 60_000,
  updatedAt: Date.now() - 60_000,
  lastPriceQuote: 0.00005,
  lastPriceAt: Date.now() - 60_000,
};

const order: LimitOrder = {
  id: "ord-1",
  token,
  quote: "SOL",
  side: "buy",
  limitPrice: 0.00004,
  amount: 1,
  status: "open",
  createdAt: Date.now() - 30_000,
  updatedAt: Date.now() - 30_000,
  feeRateBps: 50,
  slippageBps: 100,
};

function renderWithProviders(ui: React.ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

beforeEach(() => {
  useHydrationStore.setState({ hydrated: true });
  useCalloutStore.setState({ callouts: [] });
});

describe("positions table", () => {
  it("renders a live position and allows a full simulated sell", async () => {
    const onSell = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <PositionsTable
        positions={[position]}
        currentToken={token}
        priceFor={() => ({ priceUsd: 0.00006, quoteUsd: 100, source: "live", at: Date.now() })}
        feeRateBps={50}
        hydrated
        onSell={onSell}
      />,
    );

    expect(screen.getAllByText("TEST").length).toBeGreaterThan(0);
    expect(screen.getByText(/net of est\. exit fee/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    await waitFor(() => expect(onSell).toHaveBeenCalledTimes(1));
    expect(onSell).toHaveBeenCalledWith(position, 1);
  });

  it("blocks selling when only a last-seen price exists", () => {
    const onSell = vi.fn();
    renderWithProviders(
      <PositionsTable
        positions={[position]}
        currentToken={token}
        priceFor={() => ({ priceUsd: null, quoteUsd: null, source: "last-seen", at: position.lastPriceAt })}
        feeRateBps={50}
        hydrated
        onSell={onSell}
      />,
    );
    for (const label of ["25%", "50%", "100%"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("shows an empty state before any position is opened", () => {
    renderWithProviders(
      <PositionsTable
        positions={[]}
        currentToken={token}
        priceFor={() => ({ priceUsd: null, quoteUsd: null, source: "last-seen", at: null })}
        feeRateBps={50}
        hydrated
        onSell={vi.fn()}
      />,
    );
    expect(screen.getByText(/no open paper positions/i)).toBeInTheDocument();
  });
});

describe("orders table", () => {
  it("cancels an open limit order through the callback", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<OrdersTable hydrated orders={[order]} onCancel={onCancel} />);

    expect(screen.getByText("open")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith("ord-1"));
  });

  it("does not render a cancel action for filled orders", () => {
    renderWithProviders(
      <OrdersTable hydrated orders={[{ ...order, status: "filled" }]} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByText("filled")).toBeInTheDocument();
  });
});

describe("callout composer", () => {
  it("caps the note at 280 characters and saves it locally", () => {
    renderWithProviders(<CalloutComposer token={token} />);

    const textarea = screen.getByLabelText(/callout message/i);
    fireEvent.change(textarea, { target: { value: "x".repeat(300) } });
    expect((textarea as HTMLTextAreaElement).value).toHaveLength(280);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    const callouts = useCalloutStore.getState().callouts;
    expect(callouts).toHaveLength(1);
    expect(callouts[0].message).toHaveLength(280);
    expect(callouts[0].token.symbol).toBe("TEST");
  });

  it("rejects an empty note", () => {
    renderWithProviders(<CalloutComposer token={token} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/write a short callout message first/i)).toBeInTheDocument();
    expect(useCalloutStore.getState().callouts).toHaveLength(0);
  });
});
