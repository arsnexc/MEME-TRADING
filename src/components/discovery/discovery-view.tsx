"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Database,
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
import { StartHere } from "@/components/layout/start-here";
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
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-2.5 pb-2 pt-2.5 sm:px-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight">Discover</h1>
            <Badge tone="warn">PAPER EXECUTION</Badge>
            <span className="hidden items-center gap-1 text-2xs text-faint sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-buy live-dot" /> live market data
            </span>
          </div>
          <p className="mt-0.5 text-2xs text-muted">
            On-chain pool scanner across Solana, Ethereum and Base. Orders are simulated in dedicated SOL and ETH
            paper accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tooltip content={transportNote}>
            <Badge tone="neutral" className="gap-1">
              <Database className="h-2.5 w-2.5" />
              GeckoTerminal · DEX Screener
            </Badge>
          </Tooltip>
          {marketQuery.transport === "direct" ? (
            <Tooltip content={transportNote}>
              <Badge tone="warn">direct</Badge>
            </Tooltip>
          ) : null}
          {marketQuery.data?.stale ? (
            <Tooltip content="At least one network list was served from the server cache after a failed refresh. Rows may be older than the poll interval.">
              <Badge tone="warn">cached snapshot</Badge>
            </Tooltip>
          ) : null}
          <span className="num text-2xs text-faint">
            {marketQuery.lastUpdated ? `Updated ${formatRelativeTime(marketQuery.lastUpdated, now)}` : "Loading market data…"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => marketQuery.refresh()}
            aria-label="Refresh market data"
            disabled={marketQuery.fetching}
          >
            {marketQuery.fetching ? <Spinner /> : <RefreshCw className="h-3 w-3" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <StartHere />

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2.5 panel-scroll" role="tablist" aria-label="Discovery sections">
        {DISCOVERY_TABS.map((item) => {
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
                "relative flex h-8 shrink-0 items-center gap-1 px-2 text-xs font-medium transition-colors",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-[2px] border border-accent/40 bg-accent/10 px-1 py-px text-[8px] font-bold tracking-wide text-[#f5f5f5]">
                  {item.badge}
                </span>
              ) : null}
              {item.value === "callouts" && hydrated ? (
                <CalloutCount />
              ) : null}
              {active ? <span className="absolute inset-x-1.5 bottom-0 h-[1.5px] bg-accent" /> : null}
            </button>
          );
        })}
        <span className="ml-auto hidden shrink-0 items-center gap-1 pr-1 text-2xs text-faint lg:flex">
          <Info className="h-2.5 w-2.5" />
          {TAB_HINTS[tab]}
        </span>
      </div>

      <div id="discovery-panel" role="tabpanel" className="flex min-h-0 flex-1 flex-col">
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
                  "flex items-center gap-2 border-b px-3 py-1.5 text-2xs",
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
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-2xs text-muted">
                  <Spinner /> Loading live pools…
                </div>
                <TableSkeleton rows={10} cols={7} />
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
                <div className="hidden border-t border-border px-3 py-1.5 text-2xs text-faint md:block">
                  Mcap marked <span className="text-muted">FDV*</span> uses fully-diluted valuation (circulating supply
                  unavailable). “Top” is the curated trending set re-ranked by 24h volume. Security: LP lock is
                  provider-reported; authorities and holder concentration are unknown. Not an audit.
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
