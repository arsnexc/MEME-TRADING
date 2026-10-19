"use client";

import { useMemo, useState } from "react";
import { Megaphone, ShieldAlert, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PositionsTable, type PriceForPosition } from "./positions-table";
import { OrdersTable } from "./orders-table";
import { EarlyBuyersTable, MarketTradesTable, NoVerifiedData, TopTradersTable } from "./market-trades";
import { TokenCallouts } from "./callouts";
import type { MarketTrade, TradesResponse } from "@/lib/market-data/types";
import type { LimitOrder, Position, TokenRef } from "@/lib/trading/types";
import { useCalloutStore } from "@/stores/callouts";
import { cn } from "@/lib/utils";

type BottomTab =
  | "trades"
  | "positions"
  | "orders"
  | "holders"
  | "top-traders"
  | "early-buyers"
  | "dev-tokens"
  | "callouts";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "trades", label: "Trades" },
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "holders", label: "Holders" },
  { id: "top-traders", label: "Top Traders" },
  { id: "early-buyers", label: "Early Buyers" },
  { id: "dev-tokens", label: "Dev Tokens" },
  { id: "callouts", label: "Callouts" },
];

export function BottomPanel({
  token,
  network,
  trades,
  tradesLoading,
  tradesError,
  onRetryTrades,
  tradesWindow,
  positions,
  priceFor,
  feeRateBps,
  hydrated,
  orders,
  onSell,
  onCancelOrder,
}: {
  token: TokenRef;
  network: TokenRef["network"];
  trades: MarketTrade[];
  tradesLoading: boolean;
  tradesError: string | null;
  onRetryTrades: () => void;
  tradesWindow: TradesResponse["window"] | null;
  positions: Position[];
  priceFor: PriceForPosition;
  feeRateBps: number;
  hydrated: boolean;
  orders: LimitOrder[];
  onSell: (position: Position, fraction: number) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<BottomTab>("positions");
  const callouts = useCalloutStore((state) => state.callouts);
  const tokenCalloutCount = callouts.filter(
    (callout) => callout.token.network === token.network && callout.token.address === token.address,
  ).length;
  const openOrders = orders.filter((order) => order.status === "open").length;

  const counts: Partial<Record<BottomTab, number>> = useMemo(
    () => ({
      trades: trades.length,
      positions: positions.length,
      orders: openOrders,
      "top-traders": trades.length,
      "early-buyers": trades.length,
      callouts: tokenCalloutCount,
    }),
    [trades.length, positions.length, openOrders, tokenCalloutCount],
  );

  return (
    <section className="flex min-h-[280px] flex-col bg-panel/20" aria-label="Token analytics terminal">
      <div
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-2 panel-scroll"
        role="tablist"
        aria-label="Token analytics tabs"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="bottom-tab-panel"
              onClick={() => setTab(item.id)}
              className={cn(
                "relative flex h-8 shrink-0 items-center gap-1 px-2 text-2xs font-medium transition-colors",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
              {typeof count === "number" && count > 0 ? (
                <span className={cn("num text-2xs", active ? "text-muted" : "text-faint")}>{count}</span>
              ) : null}
              {item.id === "positions" && positions.length > 0 ? (
                <span className="h-1 w-1 rounded-full bg-buy" aria-hidden="true" />
              ) : null}
              {active ? <span className="absolute inset-x-1.5 bottom-0 h-[1.5px] bg-accent" /> : null}
            </button>
          );
        })}
        <span className="ml-auto hidden shrink-0 pr-1 text-2xs text-faint lg:inline">
          Columns are simulated account values unless labelled otherwise
        </span>
      </div>

      <div
        id="bottom-tab-panel"
        role="tabpanel"
        className="min-h-[240px] flex-1 overflow-y-auto panel-scroll"
      >
        {tab === "positions" ? (
          <PositionsTable
            positions={positions}
            currentToken={token}
            priceFor={priceFor}
            feeRateBps={feeRateBps}
            hydrated={hydrated}
            onSell={onSell}
          />
        ) : null}

        {tab === "trades" ? (
          <MarketTradesTable
            trades={trades}
            loading={tradesLoading}
            error={tradesError}
            onRetry={onRetryTrades}
            network={network}
            windowInfo={tradesWindow}
          />
        ) : null}

        {tab === "orders" ? <OrdersTable hydrated={hydrated} orders={orders} onCancel={onCancelOrder} /> : null}

        {tab === "holders" ? (
          <EmptyState
            icon={ShieldAlert}
            title="Holder concentration is unavailable"
            description={
              <>
                Neither GeckoTerminal nor DEX Screener exposes holder distribution, top-holder concentration or bundle
                analysis to this build. Those columns remain unknown instead of showing estimates. A dedicated
                Solana/EVM indexer with an API key would be required.
              </>
            }
            compact
          />
        ) : null}

        {tab === "top-traders" ? <TopTradersTable trades={trades} network={network} /> : null}

        {tab === "early-buyers" ? <EarlyBuyersTable trades={trades} symbol={token.symbol} /> : null}

        {tab === "dev-tokens" ? (
          <NoVerifiedData
            title="Verified creator data unavailable"
            description="Creator identity and associated dev-token launches need a verified indexer or on-chain program registry. No creator wallets are guessed or fabricated here."
            sourceHint="Requires a provider such as Helius, Birdeye or an on-chain launchpad registry."
          />
        ) : null}

        {tab === "callouts" ? (
          <div>
            <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-2xs text-faint">
              <Megaphone className="h-3 w-3" /> Private notes for {token.symbol}, stored locally
              <span className="ml-auto inline-flex items-center gap-1">
                <Users className="h-2.5 w-2.5" /> Not published
              </span>
            </div>
            <TokenCallouts token={token} />
            <p className="border-t border-border px-3 py-1.5 text-2xs text-faint">
              Add a callout from the execution column. No social integration is connected, so nothing is broadcast.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
