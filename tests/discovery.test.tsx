import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScannerTable } from "@/components/discovery/scanner-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import { filterAndSortTokens, rankByMarketCap, topByMarketCap, traderCount } from "@/lib/market-view";
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
    txns: { h24: { buys: 25_900, sells: 10_359, buyers: 8_400, sellers: 3_100 } },
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

function renderTable(
  tokens: MarketToken[],
  onSort = vi.fn(),
  ranks = new Map(tokens.map((item, index) => [item.id, index + 1])),
) {
  render(
    <TooltipProvider>
      <ScannerTable
        tokens={tokens}
        ranks={ranks}
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
    for (const heading of ["Rank", "Token", "Price", "Change %", "Market cap", "Volume", "Liquidity", "Traders", "Age", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }

    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).getByLabelText("Rank 1")).toBeInTheDocument();
    expect(within(row).getByText("MEME")).toBeInTheDocument();
    expect(within(row).getByText("Meme Token")).toBeInTheDocument();
    expect(within(row).getByText("$0.000658")).toBeInTheDocument();
    expect(within(row).getByText("+15.33%")).toBeInTheDocument();
    expect(within(row).getByText("$600K")).toBeInTheDocument();
    expect(within(row).getByText("$82.2K")).toBeInTheDocument();
    expect(within(row).getByText("$188.64K")).toBeInTheDocument();
    // Buyer + seller wallet counts, compacted. Not a holder count.
    expect(within(row).getByText("11.5K")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Buy MEME with the SOL paper account" }),
    ).toBeInTheDocument();
  });

  it("uses the supplied market-cap rank instead of the row position", () => {
    const late = token({ id: "solana:late", symbol: "LATE", tokenAddress: "late", marketCapUsd: 10_000 });
    renderTable([token(), late], vi.fn(), new Map([["solana:pool-meme", 7], ["solana:late", 42]]));

    // Sorted by whatever the parent passes in, but the ranks are the universe's.
    expect(within(screen.getByTestId("token-row-MEME")).getByLabelText("Rank 7")).toBeInTheDocument();
    expect(within(screen.getByTestId("token-row-LATE")).getByLabelText("Rank 42")).toBeInTheDocument();
  });

  it("shows a dash when the provider has no wallet counts", () => {
    renderTable([token({ txns: { h24: { buys: 10, sells: 5 } } })]);
    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("11.5K")).not.toBeInTheDocument();
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

describe("screener universe", () => {
  const big = token({ id: "solana:big", symbol: "BIG", marketCapUsd: 9_000_000 });
  const mid = token({ id: "eth:mid", symbol: "MID", network: "eth", marketCapUsd: 500_000 });
  const small = token({ id: "base:small", symbol: "SMALL", network: "base", marketCapUsd: 1_000 });
  const unknown = token({ id: "base:unknown", symbol: "UNK", network: "base", marketCapUsd: null });

  it("ranks by market cap and keeps ranks attached to the token", () => {
    const ranks = rankByMarketCap([small, unknown, big, mid]);
    expect(ranks.get("solana:big")).toBe(1);
    expect(ranks.get("eth:mid")).toBe(2);
    expect(ranks.get("base:small")).toBe(3);
    // A pool without a market cap ranks last instead of first.
    expect(ranks.get("base:unknown")).toBe(4);

    // Filtering to one network must not renumber anything.
    const filtered = filterAndSortTokens([big, mid, small], {
      timeframe: "h24",
      sortKey: "change",
      sortDirection: "desc",
      network: "eth",
    });
    expect(filtered.map((item) => ranks.get(item.id))).toEqual([2]);
  });

  it("caps the ranked universe at the requested size", () => {
    expect(topByMarketCap([small, mid, big], 2).map((item) => item.symbol)).toEqual(["BIG", "MID"]);
    expect(topByMarketCap([small, mid, big], 100)).toHaveLength(3);
  });

  it("counts traders as wallet participation, not holders", () => {
    const counted = token({ txns: { h24: { buys: 10, sells: 5, buyers: 30, sellers: 12 } } });
    expect(traderCount(counted, "h24")).toBe(42);
    expect(traderCount(counted, "h1")).toBeNull();
    // A zero-participation window is reported as unavailable, not as zero.
    expect(traderCount(token({ txns: { h24: { buys: 0, sells: 0, buyers: 0, sellers: 0 } } }), "h24")).toBeNull();
    // The providers may omit the wallet fields entirely.
    expect(traderCount(token({ txns: { h24: { buys: 10, sells: 5 } } }), "h24")).toBeNull();
  });

  it("sorts by trader count", () => {
    const busy = token({ id: "solana:busy", symbol: "BUSY", txns: { h24: { buys: 1, sells: 1, buyers: 90, sellers: 40 } } });
    const quiet = token({ id: "solana:quiet", symbol: "QUIET", txns: { h24: { buys: 1, sells: 1, buyers: 5, sellers: 2 } } });
    const sorted = filterAndSortTokens([quiet, busy], { timeframe: "h24", sortKey: "traders", sortDirection: "desc" });
    expect(sorted.map((item) => item.symbol)).toEqual(["BUSY", "QUIET"]);
  });
});
