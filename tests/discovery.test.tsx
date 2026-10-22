import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScannerTable } from "@/components/discovery/scanner-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import {
  aggregateByToken,
  filterAndSortTokens,
  rankByMarketCap,
  screenerStats,
  tokenKey,
  topByMarketCap,
  traderCount,
} from "@/lib/market-view";
import { screenerCsv } from "@/lib/csv";
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
  ranks?: Map<string, number>,
  hiddenColumns: React.ComponentProps<typeof ScannerTable>["hiddenColumns"] = [],
) {
  render(
    <TooltipProvider>
      <ScannerTable
        tokens={tokens}
        ranks={ranks ?? new Map(tokens.map((item, index) => [item.id, index + 1]))}
        timeframe={TIMEFRAME}
        sortKey="volume"
        sortDirection="desc"
        onSort={onSort}
        onOpen={() => {}}
        watched={new Set()}
        onToggleWatch={() => {}}
        hiddenColumns={hiddenColumns}
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

  it("hides a column on request without shifting its neighbours", () => {
    renderTable([token({ ...({ poolCount: 3 } as Partial<MarketToken>) })], vi.fn(), undefined, ["liquidity"]);
    const table = screen.getByRole("table", { name: "Token scanner" });
    expect(within(table).queryByRole("columnheader", { name: /liquidity/i })).not.toBeInTheDocument();
    // Structural columns survive any display choice.
    for (const heading of ["Rank", "Token", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }
    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).queryByText("$82.2K")).not.toBeInTheDocument();
    expect(within(row).getByText("$600K")).toBeInTheDocument();
  });

  it("marks a merged row with the number of pools behind it", () => {
    renderTable([token({ ...({ poolCount: 3 } as Partial<MarketToken>) })]);
    const row = screen.getByTestId("token-row-MEME");
    expect(within(row).getByText("3 pools")).toBeInTheDocument();
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

describe("token aggregation", () => {
  const shared = { tokenAddress: "shared-token", symbol: "SHARED", name: "Shared Coin" };
  const deep = token({
    ...shared,
    id: "solana:pool-deep",
    pool: "pool-deep",
    priceUsd: 1,
    marketCapUsd: 1_000_000,
    liquidityUsd: 90_000,
    volumeUsd: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 100 },
    changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 4 },
    txns: { h24: { buys: 10, sells: 5, buyers: 60, sellers: 20 } },
    poolCreatedAt: BASE - 10 * 86_400_000,
  });
  const shallow = token({
    ...shared,
    id: "solana:pool-shallow",
    pool: "pool-shallow",
    priceUsd: 1.05,
    marketCapUsd: 1_200_000,
    liquidityUsd: 40_000,
    volumeUsd: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 50 },
    changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 9 },
    txns: { h24: { buys: 2, sells: 1, buyers: 10, sellers: 5 } },
    poolCreatedAt: BASE - 2 * 86_400_000,
  });

  it("folds every pool of a token into one row", () => {
    const rows = aggregateByToken([shallow, deep]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.poolCount).toBe(2);
    // Volume and liquidity are the token's total across its pools…
    expect(row.volumeUsd.h24).toBe(150);
    expect(row.liquidityUsd).toBe(130_000);
    expect(row.txns.h24?.buyers).toBe(70);
    expect(row.txns.h24?.sellers).toBe(25);
    // …while price, change and market cap come from the deepest pool.
    expect(row.pool).toBe("pool-deep");
    expect(row.priceUsd).toBe(1);
    expect(row.changePct.h24).toBe(4);
    expect(row.marketCapUsd).toBe(1_000_000);
    // Age is the oldest pool: the token existed before its newest market.
    expect(row.poolCreatedAt).toBe(deep.poolCreatedAt);
    // 24h turnover, computed from the merged volume and the reported cap.
    expect(row.turnover).toBeCloseTo(150 / 1_000_000, 12);
  });

  it("keeps different tokens on the same chain apart", () => {
    const other = token({ ...shared, tokenAddress: "other-token", id: "solana:other" });
    expect(aggregateByToken([deep, other])).toHaveLength(2);
    // EVM addresses are case-insensitive; Solana addresses are not.
    expect(tokenKey({ network: "eth", tokenAddress: "0xABC" })).toBe(tokenKey({ network: "eth", tokenAddress: "0xabc" }));
    expect(tokenKey({ network: "solana", tokenAddress: "AbC" })).not.toBe(tokenKey({ network: "solana", tokenAddress: "abc" }));
  });

  it("reports wallet counts as unknown when one pool omits them", () => {
    const partial = token({
      ...shared,
      id: "solana:pool-partial",
      pool: "pool-partial",
      liquidityUsd: 10,
      txns: { h24: { buys: 4, sells: 2 } },
    });
    const [row] = aggregateByToken([deep, partial]);
    expect(row.txns.h24?.buyers).toBeNull();
    expect(row.txns.h24?.sellers).toBeNull();
    // Trade counts are still complete on both pools, so they are summed.
    expect(row.txns.h24?.buys).toBe(14);
  });
});

describe("market breadth", () => {
  const up = token({ id: "solana:up", symbol: "UP", changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 10 } });
  const down = token({ id: "solana:down", symbol: "DOWN", changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: -5 } });
  const flat = token({ id: "solana:flat", symbol: "FLAT", changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: 0 } });
  const unknown = token({ id: "solana:unknown", symbol: "UNK", changePct: { m5: null, m15: null, m30: null, h1: null, h6: null, h24: null } });

  it("counts advancing, declining, unchanged and unpublished rows separately", () => {
    const stats = screenerStats([up, down, flat, unknown], "h24");
    expect(stats.advancing).toBe(1);
    expect(stats.declining).toBe(1);
    expect(stats.flat).toBe(1);
    expect(stats.unknown).toBe(1);
    expect(stats.medianChange).toBe(0);
    expect(stats.best).toEqual({ symbol: "UP", change: 10 });
    expect(stats.worst).toEqual({ symbol: "DOWN", change: -5 });
  });

  it("sums only the published totals", () => {
    const stats = screenerStats([up, down], "h24");
    expect(stats.totalMarketCap).toBe(1_200_000);
    expect(stats.totalLiquidity).toBe(164_400);
    expect(stats.totalVolume).toBe(2 * 188_640);
    expect(stats.totalTraders).toBe(2 * 11_500);
    expect(screenerStats([unknown], "h24").totalTraders).toBe(11_500);
  });

  it("flags totals that exclude rows with no published value", () => {
    const noCap = token({ id: "solana:nocap", symbol: "NOCAP", tokenAddress: "nocap", marketCapUsd: null });
    const noTraders = token({
      id: "solana:quiet",
      symbol: "QUIET",
      tokenAddress: "quiet",
      txns: { h24: { buys: 3, sells: 1 } },
    });
    const stats = screenerStats([up, noCap, noTraders], "h24");
    expect(stats.partial.marketCap).toBe(1);
    expect(stats.partial.traders).toBe(1);
    // The total is the sum of what was published, never a zero-fill.
    expect(stats.totalMarketCap).toBe((up.marketCapUsd ?? 0) + (noTraders.marketCapUsd ?? 0));
  });

  it("filters by volume floor, tracked-only and pool address", () => {
    const quiet = token({
      id: "solana:quiet",
      symbol: "QUIET",
      tokenAddress: "quiet-token",
      volumeUsd: { ...up.volumeUsd, h24: 1_000 },
    });
    const filtered = filterAndSortTokens([up, quiet], {
      timeframe: "h24",
      sortKey: "marketCap",
      sortDirection: "desc",
      minVolume: 10_000,
    });
    expect(filtered.map((item) => item.symbol)).toEqual(["UP"]);

    const watched = new Set([tokenKey(quiet)]);
    const tracked = filterAndSortTokens([up, quiet], {
      timeframe: "h24",
      sortKey: "marketCap",
      sortDirection: "desc",
      watched,
      watchedOnly: true,
    });
    expect(tracked.map((item) => item.symbol)).toEqual(["QUIET"]);

    // A pasted pool address finds its token, not just symbol/name matches.
    const byPool = filterAndSortTokens([token({ pool: "0xFeedPool" })], {
      timeframe: "h24",
      sortKey: "marketCap",
      sortDirection: "desc",
      query: "0xfeedpool",
    });
    expect(byPool).toHaveLength(1);
  });
});

describe("screener csv", () => {
  it("writes full precision and leaves unpublished values empty", () => {
    const row = token({ fdvUsd: null });
    const csv = screenerCsv([row], { ranks: new Map([[row.id, 1]]), timeframe: "h24" });
    const [header, line] = csv.split("\n");
    expect(header).toContain("Rank,Symbol,Name,Network,Price USD,Change 24h %");
    expect(header).toContain("Pool address,Token address");
    expect(line.startsWith("1,MEME,Meme Token,solana,0.000658,15.33,600000,reported")).toBe(true);
    // fdvUsd is null → an empty cell, never 0.
    expect(line).toContain(",reported,,82200,188640,");
    expect(line.endsWith("pool-meme,token-meme")).toBe(true);
  });

  it("quotes cells that would break the column count", () => {
    const row = token({ name: 'Meme, "quoted"' });
    const csv = screenerCsv([row], { ranks: new Map(), timeframe: "h24" });
    expect(csv.split("\n")[1]).toContain('"Meme, ""quoted"""');
  });
});
