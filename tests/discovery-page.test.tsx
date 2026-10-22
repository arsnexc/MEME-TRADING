import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MarketToken } from "@/lib/market-data/types";

/**
 * The discover page as a whole: the ranked header, the filter strip and the
 * table all read from one mocked provider snapshot. The provider is never
 * contacted — every number below comes from the fixture.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("@/lib/market-data/client", () => ({
  fetchMarketsClient: vi.fn(),
}));

import { fetchMarketsClient } from "@/lib/market-data/client";
import { DiscoveryView } from "@/components/discovery/discovery-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useHydrationStore } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { usePreferencesStore } from "@/stores/preferences";
import { useWatchlistStore } from "@/stores/watchlist";

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

const BIG = token({ id: "eth:big", network: "eth", quote: "ETH", pool: "big", tokenAddress: "big", symbol: "BIG", name: "Big Coin", marketCapUsd: 9_000_000 });
const SMALL = token();

beforeEach(() => {
  push.mockReset();
  useHydrationStore.setState({ hydrated: true });
  useMarketStore.setState({ quotePrices: { SOL: { usd: 100, at: BASE }, ETH: { usd: 3_000, at: BASE }, fetchedAt: BASE }, snapshots: {}, quoteHistory: {} } as never);
  useWatchlistStore.setState({ entries: [] } as never);
  usePreferencesStore.setState({ sortKey: "marketCap", sortDirection: "desc", scannerTimeframe: "h24" });
  vi.mocked(fetchMarketsClient).mockResolvedValue({
    data: {
      tokens: [SMALL, BIG],
      tab: "top",
      fetchedAt: BASE,
      quotePrices: { SOL: { usd: 100, at: BASE }, ETH: { usd: 3_000, at: BASE }, fetchedAt: BASE },
      stale: false,
      warnings: [],
    },
    receivedAt: BASE,
    transport: "proxy",
  });
});

describe("discovery page", () => {
  it("renders the Top 100 header with the real pool count and the ranked table", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);

    expect(screen.getByRole("heading", { level: 1, name: "Top 100 Meme Coins" })).toBeInTheDocument();
    // Ranks come from market cap, so BIG is #1 even though it is listed second.
    await waitFor(() => expect(screen.getByTestId("token-row-MEME")).toBeInTheDocument());
    expect(screen.getByText(/2 coins ranked · 2 pools scanned/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("token-row-BIG")).getByLabelText("Rank 1")).toBeInTheDocument();
    expect(within(screen.getByTestId("token-row-MEME")).getByLabelText("Rank 2")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Token scanner" });
    for (const heading of ["Rank", "Token", "Price", "Change %", "Market cap", "Volume", "Liquidity", "Traders", "Age", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }
  });

  it("filters to one network without renumbering the ranks", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);
    await waitFor(() => expect(screen.getByTestId("token-row-BIG")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Solana" }));

    await waitFor(() => expect(screen.queryByTestId("token-row-BIG")).not.toBeInTheDocument());
    expect(screen.getByTestId("token-row-MEME")).toBeInTheDocument();
    // The Solana pool keeps universe rank 2 instead of becoming #1.
    expect(within(screen.getByTestId("token-row-MEME")).getByLabelText("Rank 2")).toBeInTheDocument();
  });

  it("shows market breadth computed from the loaded rows", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);
    await waitFor(() => expect(screen.getByTestId("token-row-BIG")).toBeInTheDocument());

    const breadth = screen.getByRole("group", { name: "Market breadth" });
    expect(within(breadth).getByText("Breadth")).toBeInTheDocument();
    expect(within(breadth).getByText(/median 24h/i)).toBeInTheDocument();
    // Both fixture tokens are up 15.33% on the 24h window.
    expect(within(breadth).getByRole("img", { name: "2 advancing, 0 declining" })).toBeInTheDocument();
    expect(within(breadth).getByText(/top mover/i)).toBeInTheDocument();
  });

  it("hides a column from the display menu and keeps the rest aligned", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);
    await waitFor(() => expect(screen.getByTestId("token-row-BIG")).toBeInTheDocument());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Screener display options" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Screener display options" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Liquidity" }));

    const table = screen.getByRole("table", { name: "Token scanner" });
    expect(within(table).queryByRole("columnheader", { name: /liquidity/i })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /market cap/i })).toBeInTheDocument();
  });

  it("offers a tracked-only filter that explains an empty result", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);
    await waitFor(() => expect(screen.getByTestId("token-row-BIG")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Filters$/ }));
    fireEvent.click(screen.getByRole("button", { name: /tracked only/i }));
    expect(await screen.findByText("No coins match these filters")).toBeInTheDocument();
    expect(screen.queryByTestId("token-row-BIG")).not.toBeInTheDocument();
  });

  it("opens the terminal ticket from the Buy action", async () => {
    render(<TooltipProvider>{<DiscoveryView />}</TooltipProvider>);
    await waitFor(() => expect(screen.getByTestId("token-row-MEME")).toBeInTheDocument());

    // The table and the mobile card both render in jsdom; click the table row's action.
    const buy = screen.getAllByRole("button", { name: "Buy MEME with the SOL paper account" });
    fireEvent.click(buy[0]);
    expect(push).toHaveBeenCalledWith(
      "/terminal?network=solana&pool=pool-meme&token=token-meme",
    );
  });
});
