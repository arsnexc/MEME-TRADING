"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Info,
  Megaphone,
  Radio,
  RefreshCw,
  SearchX,
  WifiOff,
} from "lucide-react";
import { ScannerFilters } from "./scanner-filters";
import { ScannerTable } from "./scanner-table";
import { Pagination } from "./pagination";
import { SavedCallouts } from "./saved-callouts";
import { terminalHref } from "./token-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { RetryCountdown } from "@/components/ui/retry-countdown";
import { useNow } from "@/hooks/use-now";
import { usePollingQuery } from "@/hooks/use-polling-query";
import {
  DISCOVERY_TABS,
  type DiscoveryTab,
  type ScannerTimeframe,
} from "@/lib/constants";
import { fetchMarketsClient } from "@/lib/market-data/client";
import type { MarketToken } from "@/lib/market-data/types";
import { filterAndSortTokens, paginate, type NetworkFilter } from "@/lib/market-view";
import { formatRelativeTime } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { usePreferencesStore } from "@/stores/preferences";
import { useWatchlistStore } from "@/stores/watchlist";
import { useCalloutStore } from "@/stores/callouts";
import { toast } from "@/stores/toast";

const PAGE_SIZE = 25;

const TAB_HINTS: Partial<Record<DiscoveryTab, string>> = {
  top: "Trending pools re-ranked by 24h volume. The public API does not expose an all-market ranking.",
  trending: "Pools GeckoTerminal is tracking as hot on each network right now.",
  radar: "Brand-new pools, newest first. Extreme risk and usually no price history.",
  callouts: "Private notes saved in this browser only.",
  streamers: "No verified streamer feed is connected in this build.",
};

export function DiscoveryView() {
  const router = useRouter();
  const now = useNow(15_000);
  const hydrated = useHydrated();
  const [tab, setTab] = useState<DiscoveryTab>("trending");
  const [network, setNetwork] = useState<NetworkFilter>("all");
  const [query, setQuery] = useState("");
  const [minLiquidity, setMinLiquidity] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const timeframe = usePreferencesStore((state) => state.scannerTimeframe);
  const sortKey = usePreferencesStore((state) => state.sortKey);
  const sortDirection = usePreferencesStore((state) => state.sortDirection);
  const setSort = usePreferencesStore((state) => state.setSort);
  const setTimeframe = usePreferencesStore((state) => state.setScannerTimeframe);
  const watchlist = useWatchlistStore((state) => state.entries);
  const toggleWatch = useWatchlistStore((state) => state.toggle);
  const upsertTokens = useMarketStore((state) => state.upsertTokens);
  const setQuotePrices = useMarketStore((state) => state.setQuotePrices);

  const fetchEnabled = tab === "trending" || tab === "top" || tab === "radar";
  const dataTab = fetchEnabled ? tab : "trending";

  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchMarketsClient({
        tab: dataTab,
        networks: network === "all" ? undefined : [network],
        signal,
      }),
    [dataTab, network],
  );

  const marketQuery = usePollingQuery(`markets:${dataTab}:${network}`, fetcher, {
    // 45 s keeps a discovery tab at ~4 GeckoTerminal calls/minute, well inside
    // the shared public budget even with a second tab open.
    intervalMs: 45_000,
    enabled: fetchEnabled,
    persist: true,
  });

  const tokens = useMemo(() => marketQuery.data?.tokens ?? [], [marketQuery.data]);
  const warnings = marketQuery.data?.warnings ?? [];

  useEffect(() => {
    if (!marketQuery.data) return;
    upsertTokens(marketQuery.data.tokens);
    setQuotePrices(marketQuery.data.quotePrices);
  }, [marketQuery.data, setQuotePrices, upsertTokens]);

  useEffect(() => {
    setPage(1);
  }, [tab, network, query, minLiquidity, timeframe, sortKey, sortDirection]);

  const watched = useMemo(
    () => new Set(watchlist.map((entry) => `${entry.network}:${entry.address}`)),
    [watchlist],
  );

  const filtered = useMemo(
    () =>
      filterAndSortTokens(tokens, {
        query,
        timeframe,
        sortKey,
        sortDirection,
        minLiquidity,
        network,
      }),
    [tokens, query, timeframe, sortKey, sortDirection, minLiquidity, network],
  );

  const paginated = paginate(filtered, page, PAGE_SIZE);

  const openToken = (token: MarketToken) => router.push(terminalHref(token));

  const onToggleWatch = (token: MarketToken) => {
    const added = toggleWatch({
      network: token.network,
      pool: token.pool,
      address: token.tokenAddress,
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
    });
    toast({
      title: added ? `${token.symbol} added to Trackers` : `${token.symbol} removed from Trackers`,
      description: added ? "Saved locally in this browser." : undefined,
      variant: "info",
    });
  };

  const transportNote =
    marketQuery.transport === "direct"
      ? "Browser transport: the server proxy was unavailable or rate-limited, so the provider is queried directly. Provider rate limits apply."
      : "Server proxy with caching and request de-duplication.";

  const showDataState = fetchEnabled;

  return (
    <div className="flex flex-1 flex-col bg-bg">
      <header className="border-b border-border px-3 pb-3 pt-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.02em] text-fg">Discover</h1>
              <Badge
                tone="green"
                className="gap-1 border-buy/25 bg-buy/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-buy"
              >
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-buy" />
                Paper execution
              </Badge>
            </div>
            <p className="mt-1 max-w-[660px] text-xs leading-5 text-muted">
              Live on-chain pools across Solana, Ethereum and Base. Orders are simulated in separate SOL and ETH paper
              accounts — no wallet, no signatures.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-faint">
              <a
                href="https://www.geckoterminal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-fg"
              >
                GeckoTerminal
              </a>
              <span aria-hidden="true" className="text-border-strong">·</span>
              <a
                href="https://dexscreener.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-fg"
              >
                DEX Screener
              </a>
            </div>
            {marketQuery.transport === "direct" ? (
              <Tooltip content={transportNote}>
                <Badge tone="warn">direct</Badge>
              </Tooltip>
            ) : null}
            {marketQuery.data?.stale ? (
              <Tooltip content="At least one network list was served from the server cache after a failed refresh. Rows may be older than the poll interval.">
                <Badge tone="warn">cached</Badge>
              </Tooltip>
            ) : null}
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
            <Tooltip content={transportNote}>
              <span className="flex items-center gap-1.5 text-[11px] text-faint" tabIndex={0}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    marketQuery.error ? "bg-sell" : marketQuery.data?.stale ? "bg-warn" : "bg-buy live-dot",
                  )}
                />
                <span className="num">
                  {marketQuery.lastUpdated
                    ? `Updated ${formatRelativeTime(marketQuery.lastUpdated, now)}`
                    : "Loading market data…"}
                </span>
              </span>
            </Tooltip>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-[4px] border-border px-2.5 text-[11px] font-medium text-muted hover:text-fg"
              onClick={() => marketQuery.refresh()}
              aria-label="Refresh market data"
              disabled={marketQuery.fetching}
            >
              {marketQuery.fetching ? <Spinner /> : <RefreshCw className="h-3 w-3" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <div
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-3 panel-scroll"
        role="tablist"
        aria-label="Discovery sections"
      >
        {DISCOVERY_TABS.map((item, index) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="discovery-panel"
              onClick={() => setTab(item.value)}
              title={TAB_HINTS[item.value]}
              className={cn(
                "relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors",
                index === 0 && "pl-0",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-[2px] border border-border-strong bg-panel-2 px-1 py-px text-[8px] font-semibold tracking-[0.06em] text-faint">
                  {item.badge}
                </span>
              ) : null}
              {item.value === "callouts" && hydrated ? <CalloutCount /> : null}
              {active ? (
                <span
                  aria-hidden="true"
                  className={cn("absolute bottom-0 h-[2px] bg-fg", index === 0 ? "left-0 right-3" : "inset-x-3")}
                />
              ) : null}
            </button>
          );
        })}
        <Tooltip content={TAB_HINTS[tab]}>
          <span
            tabIndex={0}
            aria-label="About this list"
            className="ml-auto hidden shrink-0 pr-1 text-faint transition-colors hover:text-muted lg:inline-flex"
          >
            <Info className="h-3 w-3" />
          </span>
        </Tooltip>
      </div>

      <div id="discovery-panel" role="tabpanel" className="flex min-h-0 flex-1 flex-col bg-bg">
        {showDataState ? (
          <>
            <ScannerFilters
              query={query}
              onQueryChange={setQuery}
              timeframe={timeframe}
              onTimeframeChange={(value) => setTimeframe(value as ScannerTimeframe)}
              network={network}
              onNetworkChange={setNetwork}
              minLiquidity={minLiquidity}
              onMinLiquidityChange={setMinLiquidity}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((visible) => !visible)}
            />

            {marketQuery.error ? (
              <div
                className={cn(
                  "flex items-center gap-2 border-b px-3 py-1.5 text-[11px]",
                  marketQuery.errorStatus === 429
                    ? "border-warn/30 bg-warn/5 text-warn"
                    : "border-sell/30 bg-sell/5 text-sell",
                )}
                role="status"
                title={marketQuery.error}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1">
                  {marketQuery.errorStatus === 429
                    ? "Market-data provider rate limit reached."
                    : "Market data request failed."}{" "}
                  <RetryCountdown at={marketQuery.nextRetryAt} />
                  {tokens.length > 0
                    ? " Showing the last successful snapshot."
                    : " No cached snapshot is available yet."}
                </span>
                <Button size="xs" variant="outline" onClick={() => marketQuery.refresh()}>
                  Retry now
                </Button>
              </div>
            ) : null}

            {warnings.length > 0 && tokens.length > 0 ? (
              <details className="group border-b border-border bg-panel/60 px-3 py-1 text-2xs text-muted">
                <summary className="cursor-pointer select-none text-warn">
                  {warnings.length} data-source warning{warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 space-y-0.5 pb-1 pl-3 text-faint">
                  {warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {marketQuery.loading && tokens.length === 0 ? (
              <div className="flex-1">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] text-muted">
                  <Spinner /> Loading live pools…
                </div>
                <TableSkeleton rows={10} cols={9} />
              </div>
            ) : marketQuery.error && tokens.length === 0 ? (
              <EmptyState
                icon={WifiOff}
                title="Market data unavailable"
                description={
                  <>
                    {marketQuery.error}
                    <br />
                    Discovery depends on the GeckoTerminal public API. No placeholder rows are shown. Retry, or use
                    global search (which uses DEX Screener) if that provider is reachable.
                  </>
                }
                action={
                  <Button variant="primary" size="sm" onClick={() => marketQuery.refresh()}>
                    <RefreshCw className="h-3 w-3" /> Retry market data
                  </Button>
                }
                className="flex-1"
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={tokens.length === 0 ? "No pools returned" : "No pools match these filters"}
                description={
                  tokens.length === 0
                    ? "The provider returned an empty list for this tab. This can happen during quiet periods or provider degradation."
                    : "Try a different network, timeframe or minimum liquidity, or clear the text filter. Filters only apply to the loaded provider page."
                }
                action={
                  tokens.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setMinLiquidity(0);
                        setNetwork("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => marketQuery.refresh()}>
                      Refresh
                    </Button>
                  )
                }
                className="flex-1"
              />
            ) : (
              <>
                <ScannerTable
                  tokens={paginated.items}
                  timeframe={timeframe}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={setSort}
                  onOpen={openToken}
                  watched={watched}
                  onToggleWatch={onToggleWatch}
                />
                <div className="hidden border-t border-[#1c1c1c] px-3 py-1.5 text-[10px] leading-4 text-faint md:block">
                  Mcap marked <span className="text-muted">FDV*</span> uses fully-diluted valuation when circulating supply
                  is unavailable. “Top volume” is the curated trending set re-ranked by 24h volume. Security flags are
                  provider metadata (LP lock only), not an audit. Simulated orders only.
                </div>
              </>
            )}
            <Pagination
              page={paginated.page}
              pages={paginated.pages}
              start={paginated.start}
              end={paginated.end}
              total={filtered.length}
              onPage={setPage}
            />
          </>
        ) : null}

        {tab === "callouts" ? <SavedCallouts /> : null}

        {tab === "streamers" ? (
          <EmptyState
            icon={Radio}
            title="No verified streamer feed"
            description={
              <>
                This build has no connected streamer or live-call integration, so no streamer names, viewer counts or
                hosted rooms are displayed. The local Callouts tab holds your own private saved notes instead of
                inventing a social feed.
              </>
            }
            action={
              <Button variant="outline" size="sm" onClick={() => setTab("callouts")}>
                <Megaphone className="h-3 w-3" /> Open local callouts
              </Button>
            }
            className="flex-1"
          />
        ) : null}
      </div>
    </div>
  );
}

function CalloutCount() {
  const count = useCalloutStore((state) => state.callouts.length);
  if (!count) return null;
  return <span className="num text-2xs text-faint">{count}</span>;
}
