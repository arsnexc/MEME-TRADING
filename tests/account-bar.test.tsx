import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountBar } from "@/components/shell/account-bar";
import { createInitialSnapshot } from "@/lib/trading/sanitize";
import type { TokenRef } from "@/lib/trading/types";
import { useHydrationStore } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";

const TOKEN: TokenRef = {
  network: "solana",
  pool: "pool-bar",
  address: "token-bar",
  symbol: "BAR",
  name: "Bar Token",
  imageUrl: null,
};

function reset() {
  usePaperStore.setState({ ...createInitialSnapshot(), positions: [], trades: [], orders: [] });
}

describe("account bar", () => {
  beforeEach(() => {
    useHydrationStore.setState({ hydrated: true });
    reset();
  });

  it("shows both quote accounts at their starting balances", () => {
    render(<AccountBar />);
    const balanceCells = screen.getAllByText("Balance");
    expect(balanceCells).toHaveLength(2);
    expect(screen.getAllByText("50 SOL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Paper account")).toBeInTheDocument();
  });

  it("keeps equity flat while cash drops on a buy", () => {
    const store = usePaperStore.getState();
    const result = store.buy({ token: TOKEN, amountQuote: 2, priceUsd: 0.01, quoteUsd: 100, at: 1_700_000_000_000 });
    expect(result.ok).toBe(true);

    render(<AccountBar />);
    // 2 SOL notional + 0.5% fee left cash; the position carries the same value.
    expect(screen.getByText("47.99 SOL")).toBeInTheDocument();
    expect(screen.getByText("49.99 SOL")).toBeInTheDocument();
    // And it is visibly not the starting balance any more.
    expect(screen.queryByText("50 SOL")).not.toBeInTheDocument();
  });
});
