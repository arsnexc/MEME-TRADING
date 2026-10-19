"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, Info, RotateCcw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/metric";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkBadge } from "@/components/ui/network-badge";
import { TokenAvatar } from "@/components/token/token-avatar";
import { OrdersTable } from "@/components/terminal/orders-table";
import { PositionsTable, type PositionPrice } from "@/components/terminal/positions-table";
import { useTokenPrices, trackedKey } from "@/hooks/use-token-prices";
import { useNow } from "@/hooks/use-now";
import { computeUnrealized } from "@/lib/trading/engine";
import { snapshotOf } from "@/lib/trading/sanitize";
import type { Position } from "@/lib/trading/types";
import { QUOTE_CURRENCIES, type QuoteCurrency } from "@/lib/constants";
import {
  formatPercent,
  formatQuote,
  formatQuotePrice,
  formatRelativeTime,
  formatTokenAmount,
  pnlClass,
} from "@/lib/formatting";
import { terminalHrefFor } from "@/lib/terminal-href";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { useMarketStore } from "@/stores/market";
import { usePaperStore } from "@/stores/paper-trading";
import { toast } from "@/stores/toast";

const ACCOUNT_LABEL: Record<QuoteCurrency, string> = {
  SOL: "Solana paper account",
  ETH: "Ethereum paper account",
};

type AccountTotals = {
  free: number;
  value: number;
  unrealized: number;
  realized: number;
  fees: number;
  initial: number;
  usdValue: number | null;
};

export function PortfolioView() {
  const hydrated = useHydrated();
  const now = useNow(15_000);
  const [tab, setTab] = useState("positions");
  const [resetting, setResetting] = useState(false);

  const balances = usePaperStore((state) => state.balances);
  const initialBalances = usePaperStore((state) => state.initialBalances);
  const positions = usePaperStore((state) => state.positions);
  const trades = usePaperStore((state) => state.trades);
  const orders = usePaperStore((state) => state.orders);
  const realizedPnl = usePaperStore((state) => state.realizedPnl);
  const feesPaid = usePaperStore((state) => state.feesPaid);
  const feeRateBps = usePaperStore((state) => state.feeRateBps);
  const resetAccount = usePaperStore((state) => state.resetAccount);

  const quotePrices = useMarketStore((state) => state.quotePrices);
  const snapshots = useMarketStore((state) => state.snapshots);

  const trackedTokens = useMemo(() => {
    const seen = new Set<string>();
    const list = [];
    for (const position of positions) {
      const key = trackedKey(position.token);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(position.token);
    }
    return list;
  }, [positions]);

  const tracked = useTokenPrices(trackedTokens);
  const prices = tracked.prices;
  const effectiveQuotePrices = tracked.quotePrices ?? quotePrices;

  const priceFor = useCallback(
    (position: Position): PositionPrice => {
      const quoteUsd = effectiveQuotePrices[position.quote]?.usd ?? null;
      const trackedPrice = prices[trackedKey(position.token)];
      if (trackedPrice?.priceUsd && trackedPrice.quoteUsd && trackedPrice.at && now - trackedPrice.at < 75_000) {
        return {
          priceUsd: trackedPrice.priceUsd,
          quoteUsd: trackedPrice.quoteUsd,
          source: "live",
          at: trackedPrice.at,
        };
      }
      const snap = snapshots[`${position.token.network}:${position.token.address}`];
      if (snap?.priceUsd && quoteUsd && now - snap.updatedAt < 300_000) {
        return { priceUsd: snap.priceUsd, quoteUsd, source: "snapshot", at: snap.updatedAt };
      }
      return { priceUsd: null, quoteUsd, source: "last-seen", at: position.lastPriceAt };
    },
    [effectiveQuotePrices, now, prices, snapshots],
  );

  const totals = useMemo(() => {
    const base: Record<QuoteCurrency, AccountTotals> = {
      SOL: {
        free: balances.SOL,
        value: 0,
        unrealized: 0,
        realized: realizedPnl.SOL,
        fees: feesPaid.SOL,
        initial: initialBalances.SOL,
        usdValue: null,
      },
      ETH: {
        free: balances.ETH,
        value: 0,
        unrealized: 0,
        realized: realizedPnl.ETH,
        fees: feesPaid.ETH,
        initial: initialBalances.ETH,
        usdValue: null,
      },
    };
    for (const position of positions) {
      const price = priceFor(position);
      const mark = price.priceUsd && price.quoteUsd ? price.priceUsd / price.quoteUsd : position.lastPriceQuote;
      if (!mark) continue;
      const pnl = computeUnrealized(position, mark, feeRateBps);
      base[position.quote].value += pnl.marketValue;
      base[position.quote].unrealized += pnl.netPnl;
    }
    for (const quote of QUOTE_CURRENCIES) {
      const usd = effectiveQuotePrices[quote]?.usd ?? null;
      base[quote].usdValue = usd ? (base[quote].free + base[quote].value) * usd : null;
    }
    return base;
  }, [balances, effectiveQuotePrices, feeRateBps, feesPaid, initialBalances, positions, priceFor, realizedPnl]);

  const handleSell = useCallback(
    async (position: Position, fraction: number) => {
      const price = priceFor(position);
      if (price.source === "last-seen" || !price.priceUsd || !price.quoteUsd) {
        toast({
          title: "Sell blocked — stale price",
          description: "Open the token terminal and wait for a fresh provider price before selling.",
          variant: "error",
        });
        return;
      }
      const result = usePaperStore.getState().sell({
        positionId: position.id,
        fraction,
        priceUsd: price.priceUsd,
        quoteUsd: price.quoteUsd,
      });
      if (!result.ok) {
        toast({ title: "Simulated sell rejected", description: result.error.message, variant: "error" });
        return;
      }
      toast({
        title: `Sold ${fraction === 1 ? "100" : fraction * 100}% · ${position.token.symbol}`,
        description: `Net proceeds ${formatQuote(result.value.trade.total, position.quote)} · realized ${formatQuote(result.value.trade.realizedPnl ?? 0, position.quote)}`,
        variant: "success",
      });
    },
    [priceFor],
  );

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const result = usePaperStore.getState().cancelLimit(orderId);
    if (!result.ok) {
      toast({ title: "Could not cancel order", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Paper limit order cancelled", variant: "info" });
  }, []);

  const exportAccount = () => {
    const snapshot = snapshotOf(usePaperStore.getState());
    const payload = {
      application: "MEMESCOPE",
      mode: "paper-trading",
      exportedAt: new Date().toISOString(),
      version: 1,
      ...snapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `memescope-paper-account-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Paper account exported", description: "Local JSON snapshot downloaded. No data was uploaded.", variant: "success" });
  };

  const reset = () => {
    resetAccount();
    setResetting(false);
    toast({ title: "Paper account reset", description: "Balances are back to 50 SOL and 50 ETH. Trades and orders were cleared.", variant: "info" });
  };

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-2xs text-faint">
        <Spinner /> Restoring paper account from this browser…
      </div>
    );
  }

  const openOrders = orders.filter((order) => order.status === "open").length;
  const recentTrades = [...trades].sort((a, b) => b.at - a.at).slice(0, 100);
  const lastPriceError = tracked.error;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-fg">
            <Wallet className="h-4 w-4 text-accent" /> Paper portfolio
          </h1>
          <p className="mt-0.5 text-2xs text-muted">
            Two independent simulated accounts. No wallet is connected and no real funds exist in this app.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge tone={openOrders > 0 ? "warn" : "green"}>{openOrders} open order{openOrders === 1 ? "" : "s"}</Badge>
          <Button size="sm" variant="outline" onClick={exportAccount}>
            <ArrowDownToLine className="h-3 w-3" /> Export JSON
          </Button>
          <Dialog open={resetting} onOpenChange={setResetting}>
            <DialogTrigger asChild>
              <Button size="sm" variant="danger">
                <RotateCcw className="h-3 w-3" /> Reset account
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Reset the paper account?"
              description="This deletes the paper balances, positions, trades and limit orders stored in this browser and recreates the 50 SOL / 50 ETH starting accounts. It cannot be undone."
            >
              <div className="rounded-sm border border-warn/25 bg-warn/[0.04] px-2 py-1.5 text-2xs leading-relaxed text-warn">
                Only local paper data is removed. Nothing on-chain is affected — this app never connects to a wallet.
              </div>
              <div className="mt-3 flex justify-end gap-1.5">
                <DialogClose asChild>
                  <Button size="sm" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button size="sm" variant="danger" onClick={reset}>
                  Reset paper account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-border p-2 md:grid-cols-2">
        {QUOTE_CURRENCIES.map((quote) => {
          const account = totals[quote];
          const equity = account.free + account.value;
          const returnPct = account.initial > 0 ? ((equity - account.initial) / account.initial) * 100 : 0;
          const reference = effectiveQuotePrices[quote];
          return (
            <section key={quote} className="rounded-sm border border-border bg-panel p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold",
                      quote === "SOL" ? "bg-[#e5e5e5]/15 text-[#d4d4d4]" : "bg-[#a3a3a3]/15 text-[#d4d4d4]",
                    )}
                  >
                    {quote}
                  </span>
                  <h2 className="text-xs font-medium text-fg">{ACCOUNT_LABEL[quote]}</h2>
                </div>
                <span className="num text-2xs text-faint">
                  {reference ? `1 ${quote} = $${reference.usd.toFixed(2)}` : `${quote}/USD unavailable`}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric
                  label="Total value"
                  value={`${formatQuote(equity, quote)} ${quote}`}
                  sub={`cash + positions${account.usdValue != null ? ` · ≈ $${account.usdValue.toFixed(2)}` : ""}`}
                />
                <Metric
                  label="Cash"
                  value={`${formatQuote(account.free, quote)} ${quote}`}
                  sub="ready to spend"
                />
                <Metric
                  label="In positions"
                  value={`${formatQuote(account.value, quote)} ${quote}`}
                  sub="current market value"
                />
                <Metric
                  label="Open PnL"
                  value={formatQuote(account.unrealized, quote)}
                  tone={account.unrealized >= 0 ? "buy" : "sell"}
                  sub="after est. exit fee"
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-faint">
                <span>
                  Return since start{" "}
                  <span className={cn("num", returnPct >= 0 ? "text-buy" : "text-sell")}>
                    {formatPercent(returnPct, { sign: true })}
                  </span>
                  <span className="text-faint"> (from {formatQuote(account.initial, quote, 0)} {quote})</span>
                </span>
                <span>
                  Realized <span className={cn("num", pnlClass(account.realized))}>{formatQuote(account.realized, quote)} {quote}</span>
                </span>
                <span>
                  Fees paid <span className="num text-muted">{formatQuote(account.fees, quote)} {quote}</span>
                </span>
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-faint">
                Buying moves cash into a position, so <span className="text-muted">cash drops</span> while{" "}
                <span className="text-muted">total value stays about the same</span> — only fees and price moves change
                it. Nothing leaves your account on a buy except the fee.
              </p>
            </section>
          );
        })}
      </div>

      {lastPriceError ? (
        <div className="border-b border-warn/20 bg-warn/[0.04] px-3 py-1 text-2xs text-warn">
          Live position prices could not be refreshed: {lastPriceError}. Marks fall back to the last provider price
          saved on this device; selling requires a fresh price.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-2xs text-faint">
        <Info className="h-2.5 w-2.5" />
        <span>
          Prices checked every 30s while this tab is visible
          {tracked.lastUpdated ? ` · last update ${formatRelativeTime(tracked.lastUpdated, now)}` : ""}.
        </span>
        <span className="ml-auto">Simulated fills only · not financial advice</span>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
        <div className="border-b border-border px-2.5 py-1.5">
          <TabsList aria-label="Portfolio sections">
            <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="history">History ({trades.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="positions">
          {positions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No open paper positions"
              description="Buy a token from discovery or from its terminal to open a simulated position. Balances, fees and PnL are tracked per quote currency."
              action={
                <Link href="/" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
                  Browse tokens <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            />
          ) : (
            <PositionsTable
              positions={positions}
              currentToken={null}
              priceFor={priceFor}
              feeRateBps={feeRateBps}
              hydrated={hydrated}
              onSell={handleSell}
            />
          )}
        </TabsContent>

        <TabsContent value="orders">
          <OrdersTable hydrated={hydrated} orders={orders} onCancel={handleCancelOrder} />
        </TabsContent>

        <TabsContent value="history">
          <TradeHistory trades={recentTrades} />
        </TabsContent>
      </Tabs>

      <div className="border-t border-border px-3 py-1.5 text-2xs text-faint">
        Paper accounts start at 50 {QUOTE_CURRENCIES[0]} and 50 {QUOTE_CURRENCIES[1]}; they never convert into each
        other. Fees default to {formatPercent(feeRateBps / 100, { sign: false })} per side and are expensed, not refunded.{" "}
        <Link href="/" className="text-muted hover:text-fg">
          Back to discovery
        </Link>
      </div>
    </div>
  );
}

function TradeHistory({ trades }: { trades: ReturnType<typeof usePaperStore.getState>["trades"] }) {
  if (trades.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No simulated fills yet"
        description="Executed market fills and filled limit orders appear here with fees and realized PnL. Cancelled or failed orders stay in the Orders tab."
        compact
      />
    );
  }
  return (
    <div className="overflow-x-auto panel-scroll">
      <table className="w-full min-w-[900px] border-separate border-spacing-0" aria-label="Paper trade history">
        <thead className="bg-panel">
          <tr className="text-2xs uppercase tracking-wide text-faint">
            {["Time", "Token", "Side", "Type", "Quantity", "Price", "Notional", "Fee", "Realized", "Total"].map((heading) => (
              <th
                key={heading}
                className={cn(
                  "border-b border-border px-2 py-1.5 font-medium",
                  heading === "Time" ? "pl-3 text-left" : heading === "Token" || heading === "Side" || heading === "Type" ? "text-left" : "text-right",
                )}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="group hover:bg-panel-2/60">
              <td className="border-b border-border/60 py-1 pl-3 pr-2 text-2xs text-muted">
                {formatRelativeTime(trade.at)}
              </td>
              <td className="border-b border-border/60 px-2 py-1">
                <Link href={terminalHrefFor(trade.token)} className="flex min-w-0 items-center gap-1.5 hover:text-fg">
                  <TokenAvatar src={trade.token.imageUrl} symbol={trade.token.symbol} size={18} />
                  <span className="truncate text-xs text-fg">{trade.token.symbol}</span>
                  <NetworkBadge network={trade.token.network} className="hidden sm:inline-flex" />
                </Link>
              </td>
              <td className={cn("border-b border-border/60 px-2 py-1 text-2xs font-semibold uppercase", trade.side === "buy" ? "text-buy" : "text-sell")}>
                {trade.side}
              </td>
              <td className="border-b border-border/60 px-2 py-1 text-2xs text-muted">
                {trade.trigger === "take-profit" ? (
                  <Badge tone="green">take profit</Badge>
                ) : trade.trigger === "stop-loss" ? (
                  <Badge tone="red">stop loss</Badge>
                ) : (
                  trade.orderKind
                )}
              </td>
              <td className="num border-b border-border/60 px-2 py-1 text-right text-2xs text-fg">{formatTokenAmount(trade.quantity)}</td>
              <td className="num border-b border-border/60 px-2 py-1 text-right text-2xs text-fg">
                {formatQuotePrice(trade.priceQuote)} {trade.quote}
              </td>
              <td className="num border-b border-border/60 px-2 py-1 text-right text-2xs text-muted">
                {formatQuote(trade.notional, trade.quote)}
              </td>
              <td className="num border-b border-border/60 px-2 py-1 text-right text-2xs text-muted">
                {formatQuote(trade.fee, trade.quote)}
                {trade.priorityFee > 0 ? <span className="text-faint"> +{formatQuote(trade.priorityFee, trade.quote)}</span> : null}
              </td>
              <td className={cn("num border-b border-border/60 px-2 py-1 text-right text-2xs", trade.realizedPnl == null ? "text-faint" : pnlClass(trade.realizedPnl))}>
                {trade.realizedPnl == null ? "—" : formatQuote(trade.realizedPnl, trade.quote)}
              </td>
              <td className="num border-b border-border/60 py-1 pl-2 pr-3 text-right text-2xs text-fg">
                {formatQuote(trade.total, trade.quote)} {trade.quote}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
