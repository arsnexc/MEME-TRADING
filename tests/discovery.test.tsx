import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScannerTable } from "@/components/discovery/scanner-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import { filterAndSortTokens } from "@/lib/market-view";
import type { ScannerTimeframe } from "@/lib/constants";

const BASE = Date.UTC(2026, 0, 1);

function token(overrides: Partial<MarketToken> = {}): MarketToken {
  return {
    id: "solana:pool-meme",
    network: "solana",
    quote: "SOL",
    pool: "pool-meme",
    tokenAddress: "token-meme",
    name: "Meme Token",
    symbol: "MEME",
    priceUsd: 0.000658,
    marketCapUsd: 600_000,
    fdvUsd: 900_000,
    marketCapIsFdv: false,
    liquidityUsd: 82_200,
    volumeUsd: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 188_640 },
    changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 15.33 },
    txns: { h24: { buys: 25_900, sells: 10_359 } },
    poolCreatedAt: BASE - 3 * 86_400_000,
    imageUrl: null,
    websites: [],
    socials: [],
    dexId: "pumpswap",
    dexscreenerUrl: null,
    security: {
      lpLockedPct: 90,
      topHolderPct: null,
      mintAuthority: "unknown",
      freezeAuthority: "unknown",
      devHoldingsPct: null,
      dataSource: null,
      note: "",
    },
    source: "geckoterminal+dexscreener",
    updatedAt: BASE,
    ...overrides,
  };
}

const TIMEFRAME: ScannerTimeframe = "h24";

function renderTable(tokens: MarketToken[], onSort = vi.fn()) {
  render(
    <TooltipProvider>
      <ScannerTable
        tokens={tokens}
        timeframe={TIMEFRAME}
        sortKey="volume"
        sortDirection="desc"
        onSort={onSort}
        onOpen={() => {}}
        watched={new Set()}
        onToggleWatch={() => {}}
      />
    </TooltipProvider>,
  );
  return { onSort };
}

describe("screener table", () => {
  it("renders the TradingView-style columns and one compact row per token", () => {
    renderTable([token()]);
    const table = screen.getByRole("table", { name: "Token scanner" });
    for (const heading of ["Token / pair", "Price", "Change %", "Age", "Mkt cap", "Liquidity", "Volume", "Txns", "Security", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }

    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).getByText("MEME")).toBeInTheDocument();
    expect(within(row).getByText("Meme Token")).toBeInTheDocument();
    expect(within(row).getByText("$0.000658")).toBeInTheDocument();
    expect(within(row).getByText("+15.33%")).toBeInTheDocument();
    expect(within(row).getByText("$600K")).toBeInTheDocument();
    expect(within(row).getByText("$82.2K")).toBeInTheDocument();
    expect(within(row).getByText("$188.64K")).toBeInTheDocument();
    // Buy/sell counts are compacted so the split bar stays readable.
    expect(within(row).getByText("25.9K")).toBeInTheDocument();
    expect(within(row).getByText("10.4K")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Buy MEME with the SOL paper account" }),
    ).toBeInTheDocument();
  });

  it("never labels an unknown security check as safe", () => {
    renderTable([token()]);
    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).getByRole("img", { name: "Liquidity lock: 90 percent reported" })).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Mint and freeze authority: unknown" })).toBeInTheDocument();
    expect(within(row).queryByLabelText(/safe/i)).not.toBeInTheDocument();
  });

  it("sorts by price and toggles aria-sort on the active column", () => {
    const { onSort } = renderTable([token()]);
    fireEvent.click(screen.getByRole("button", { name: /sort by price/i }));
    expect(onSort).toHaveBeenCalledWith("price");

    const volume = screen.getByRole("columnheader", { name: /volume/i });
    expect(volume).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /price/i })).toHaveAttribute("aria-sort", "none");
  });

  it("marks negative change in the sell colour and renders a dash for a missing window", () => {
    renderTable([token({ changePct: { ...token().changePct, h24: -12.5 } })]);
    const change = within(screen.getByTestId("token-row-MEME")).getByText("-12.50%");
    expect(change.className).toContain("text-sell");
  });
});

describe("screener sorting", () => {
  const cheap = token({
    id: "solana:cheap",
    tokenAddress: "cheap",
    symbol: "CHEAP",
    pool: "pool-cheap",
    priceUsd: 0.0001,
    poolCreatedAt: BASE - 10 * 86_400_000,
    txns: { h24: { buys: 10, sells: 5 } },
  });
  const rich = token({
    id: "eth:rich",
    network: "eth",
    quote: "ETH",
    tokenAddress: "rich",
    symbol: "RICH",
    pool: "pool-rich",
    priceUsd: 12,
    poolCreatedAt: BASE - 86_400_000,
    txns: { h24: { buys: 900, sells: 100 } },
  });
  const tokens = [rich, cheap];

  it("sorts by price", () => {
    const asc = filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "price", sortDirection: "asc" });
    expect(asc.map((item) => item.symbol)).toEqual(["CHEAP", "RICH"]);
  });

  it("sorts by pool age, newest first by default", () => {
    const sorted = filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "age", sortDirection: "desc" });
    expect(sorted.map((item) => item.symbol)).toEqual(["RICH", "CHEAP"]);
  });

  it("sorts by the total transaction count of the selected window", () => {
    const sorted = filterAndSortTokens(tokens, { timeframe: "h24", sortKey: "txns", sortDirection: "desc" });
    expect(sorted.map((item) => item.symbol)).toEqual(["RICH", "CHEAP"]);
    // A missing window yields null and sorts last rather than counting as zero.
    const empty = token({ id: "base:empty", network: "base", symbol: "EMPTY", txns: {} });
    const withEmpty = filterAndSortTokens([...tokens, empty], {
      timeframe: "h24",
      sortKey: "txns",
      sortDirection: "desc",
    });
    expect(withEmpty.at(-1)?.symbol).toBe("EMPTY");
  });
});
