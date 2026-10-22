import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExecutionPanel } from "@/components/terminal/execution-panel";
import { createInitialSnapshot } from "@/lib/trading/sanitize";
import type { MarketToken, QuotePrices } from "@/lib/market-data/types";
import type { TokenRef } from "@/lib/trading/types";
import { useHydrationStore } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";

const token: TokenRef = {
  network: "solana",
  pool: "pool123",
  address: "token123",
  symbol: "TEST",
  name: "Test Token",
  imageUrl: null,
};

const market: MarketToken = {
  id: "solana:pool123",
  network: "solana",
  quote: "SOL",
  pool: "pool123",
  tokenAddress: "token123",
  name: "Test Token",
  symbol: "TEST",
  priceUsd: 0.01,
  marketCapUsd: 1_000_000,
  fdvUsd: 1_000_000,
  marketCapIsFdv: false,
  liquidityUsd: 50_000,
  volumeUsd: { m5: 100, m15: 200, m30: 300, h1: 500, h6: 1_000, h24: 5_000 },
  changePct: { m5: 1, m15: 1, m30: 1, h1: 2, h6: 3, h24: 4 },
  txns: { h24: { buys: 10, sells: 5, buyers: 8, sellers: 4 } },
  poolCreatedAt: Date.now() - 86_400_000,
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
    dataSource: "GeckoTerminal (locked liquidity)",
    note: "unverified",
  },
  source: "geckoterminal+dexscreener",
  updatedAt: Date.now(),
};

const quotePrices: QuotePrices = {
  SOL: { usd: 100, at: Date.now() },
  ETH: { usd: 3_000, at: Date.now() },
  fetchedAt: Date.now(),
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof ExecutionPanel>> = {}) {
  return render(
    <TooltipProvider delayDuration={0}>
      <ExecutionPanel
        token={token}
        market={market}
        quotePrices={quotePrices}
        priceLastUpdated={Date.now()}
        paperPositions={[]}
        hasTradeWindow={false}
        trades={[]}
        onRefreshPrice={() => undefined}
        {...overrides}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  useHydrationStore.setState({ hydrated: true });
  usePaperStore.setState({ ...createInitialSnapshot(), positions: [], trades: [], orders: [] });
});

describe("execution panel", () => {
  it("previews and fills a simulated market buy", async () => {
    renderPanel();

    expect(screen.getByText(/order preview/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/amount \(sol\)/i), { target: { value: "1" } });
    expect(screen.getByText(/est\. fill price/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /buy test/i }));
    await waitFor(() => expect(usePaperStore.getState().positions).toHaveLength(1));

    expect(usePaperStore.getState().balances.SOL).toBeCloseTo(48.995, 9);
    expect(usePaperStore.getState().positions[0].quantity).toBeCloseTo(9900.990099, 4);
    expect(await screen.findByText(/filled: bought/i)).toBeInTheDocument();
  });

  it("blocks trading on a stale price", () => {
    renderPanel({ priceLastUpdated: Date.now() - 120_000 });
    expect(screen.getByText(/price is stale/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buy test/i })).toBeDisabled();
  });

  it("blocks buying beyond the paper balance", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText(/amount \(sol\)/i), { target: { value: "60" } });
    expect(screen.getByText(/insufficient sol balance/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buy test/i })).toBeDisabled();
  });

  it("places a buy limit order instead of filling immediately", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Limit" }));
    fireEvent.change(screen.getByLabelText(/amount \(sol\)/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/limit price/i), { target: { value: "0.00009" } });
    fireEvent.click(screen.getByRole("button", { name: /place limit buy/i }));

    await waitFor(() => expect(usePaperStore.getState().orders).toHaveLength(1));
    expect(usePaperStore.getState().orders[0]).toMatchObject({ side: "buy", status: "open", amount: 1 });
    expect(usePaperStore.getState().positions).toHaveLength(0);
  });

  it("switches between the order ticket and the DOM ladder", () => {
    renderPanel({
      trades: [
        {
          id: "t1",
          side: "buy",
          // buildDepth buckets in quote currency: 0.01 USD / 100 = 0.0001 SOL.
          priceUsd: 0.01,
          baseAmount: 100,
          valueUsd: 1,
          wallet: "wallet",
          txHash: "sig",
          at: Date.now(),
        },
      ],
    });

    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Market" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "DOM" }));
    expect(screen.getByText(/trade-flow ladder, not a real order book/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Order" }));
    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
  });

  it("shows a different fill price on each side of the ticket", () => {
    renderPanel();
    // Reference is 0.01 USD / 100 USD per SOL = 0.0001 SOL; the default 1%
    // slippage assumption is what the engine applies to each side.
    expect(screen.getByRole("button", { name: "Buy" })).toHaveTextContent("0.000101");
    expect(screen.getByRole("button", { name: "Sell" })).toHaveTextContent("0.000099");
    expect(screen.getByRole("button", { name: "Buy" })).toHaveTextContent("est.");
  });

  it("uses the limit price on both tags when a limit is typed", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Limit" }));
    fireEvent.change(screen.getByLabelText(/limit price/i), { target: { value: "0.00009" } });

    expect(screen.getByRole("button", { name: "Buy" })).toHaveTextContent("0.00009");
    expect(screen.getByRole("button", { name: "Buy" })).toHaveTextContent("limit");
    // Slippage is not applied to limit fills, so both sides show the same price.
    expect(screen.getByRole("button", { name: "Sell" })).toHaveTextContent("0.00009");
    expect(screen.getByRole("button", { name: "Sell" })).not.toHaveTextContent("est.");
  });

  it("buckets the DOM ladder in quote currency and splits each level by side", () => {
    const at = Date.now();
    renderPanel({
      trades: [
        // 0.01 USD at 100 USD/SOL is 0.0001 SOL — the live reference.
        { id: "b1", side: "buy", priceUsd: 0.01, baseAmount: 100, valueUsd: 5, wallet: "w", txHash: "a", at },
        { id: "s1", side: "sell", priceUsd: 0.01, baseAmount: 60, valueUsd: 3, wallet: "w", txHash: "b", at },
        // ~1% above the reference, so a second bucket.
        { id: "b2", side: "buy", priceUsd: 0.0101, baseAmount: 40, valueUsd: 2, wallet: "w", txHash: "c", at },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "DOM" }));

    // One bucket, priced in the quote currency, with both sides attributed.
    expect(screen.getByTitle(/\$5\.00 bought · \$3\.00 sold · 2 trades/)).toBeInTheDocument();
    expect(screen.getByText("0.0001")).toBeInTheDocument();
    expect(screen.queryByText("0.01")).not.toBeInTheDocument();
  });

  it("drives the amount from the balance slider", () => {
    renderPanel();
    const slider = screen.getByLabelText(/percent of cash to spend/i);
    fireEvent.change(slider, { target: { value: "50" } });
    const input = screen.getByLabelText(/amount \(sol\)/i) as HTMLInputElement;
    expect(Number(input.value)).toBeGreaterThan(20);
    expect(Number(input.value)).toBeLessThan(30);
  });

  it("requires an open position before selling", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByText(/no open position for this token/i)).toBeInTheDocument();
  });
});
