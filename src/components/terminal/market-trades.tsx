"use client";

import { useMemo } from "react";
import { ArrowUpRight, ExternalLink, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { NETWORKS, type NetworkId } from "@/lib/constants";
import type { MarketTrade } from "@/lib/market-data/types";
import { formatNumber, formatRelativeTime, formatTokenAmount } from "@/lib/formatting";
import { cn, truncateMiddle } from "@/lib/utils";

export function MarketTradesTable({
  trades,
  loading,
  error,
  onRetry,
  network,
  windowInfo,
}: {
  trades: MarketTrade[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  network: NetworkId;
  windowInfo: { count: number; from: number | null; to: number | null } | null;
}) {
  const { formatPrice, formatMoney } = useDisplayCurrency();

  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-2xs text-faint">
        <Spinner /> Loading recent on-chain trades…
      </div>
    );
  }

  if (error && trades.length === 0) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Recent trades unavailable"
        description={error}
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry trades
          </Button>
        }
        compact
      />
    );
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No recent trades returned"
        description="GeckoTerminal had no trades for this pool in its recent window. Nothing is generated to fill the table."
        compact
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-2xs text-faint">
        <span>
          Latest <span className="text-muted">{Math.min(trades.length, windowInfo?.count ?? trades.length)}</span> provider
          trades
        </span>
        {windowInfo?.from ? (
          <span>
            window {formatRelativeTime(windowInfo.from)} → {formatRelativeTime(windowInfo.to ?? Date.now())}
          </span>
        ) : null}
        <span className="ml-auto">Signer addresses only · no identities inferred</span>
      </div>
      <div className="overflow-x-auto panel-scroll">
        <table className="w-full min-w-[760px] border-separate border-spacing-0" aria-label="Recent market trades">
          <thead className="bg-panel">
            <tr className="text-2xs uppercase tracking-wide text-faint">
              {["Time", "Side", "Price", "Token amount", "Value", "Signer", "Tx"].map((h) => (
                <th key={h} className={cn("border-b border-border px-2 py-1.5 font-medium", h === "Time" ? "pl-3 text-left" : h === "Side" || h === "Tx" ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 60).map((trade) => (
              <tr key={trade.id} className="border-b border-border/60 hover:bg-panel-2/50">
                <td className="num px-3 py-1 text-2xs text-muted" title={new Date(trade.at).toISOString()}>
                  {new Date(trade.at).toLocaleTimeString("en-GB", { hour12: false })}
                </td>
                <td className="px-2 py-1">
                  <Badge tone={trade.side === "buy" ? "green" : "red"}>{trade.side}</Badge>
                </td>
                <td className="num px-2 py-1 text-right text-xs">{formatPrice(trade.priceUsd)}</td>
                <td className="num px-2 py-1 text-right text-xs text-muted">{formatTokenAmount(trade.baseAmount, 4)}</td>
                <td className="num px-2 py-1 text-right text-xs">{formatMoney(trade.valueUsd)}</td>
                <td className="px-2 py-1 text-2xs text-faint">
                  <span className="inline-flex items-center gap-1">
                    <span className="num">{truncateMiddle(trade.wallet, 4, 4)}</span>
                    <CopyButton value={trade.wallet} label="Copy signer address" />
                  </span>
                </td>
                <td className="px-2 py-1">
                  {trade.txHash ? (
                    <a
                      href={NETWORKS[network].txUrl(trade.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-2xs text-faint hover:text-fg"
                      aria-label="Open transaction in explorer"
                    >
                      {truncateMiddle(trade.txHash, 4, 4)}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="text-2xs text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopTradersTable({ trades, network }: { trades: MarketTrade[]; network: NetworkId }) {
  const { formatMoney } = useDisplayCurrency();
  const traders = useMemo(() => {
    const map = new Map<string, { wallet: string; volume: number; buy: number; sell: number; count: number; lastAt: number }>();
    for (const trade of trades) {
      if (!trade.wallet) continue;
      const entry = map.get(trade.wallet) ?? { wallet: trade.wallet, volume: 0, buy: 0, sell: 0, count: 0, lastAt: 0 };
      entry.volume += trade.valueUsd;
      entry.count += 1;
      entry.lastAt = Math.max(entry.lastAt, trade.at);
      if (trade.side === "buy") entry.buy += trade.valueUsd;
      else entry.sell += trade.valueUsd;
      map.set(trade.wallet, entry);
    }
    return [...map.values()].sort((a, b) => b.volume - a.volume).slice(0, 15);
  }, [trades]);

  if (traders.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No trader window available"
        description="Top traders are derived only from the fetched provider trade window. No identities or all-time rankings are fabricated."
        compact
      />
    );
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-1.5 text-2xs text-faint">
        Partial ranking · last {trades.length} provider trades · wallets are on-chain signer addresses only
      </div>
      <div className="overflow-x-auto panel-scroll">
        <table className="w-full min-w-[560px] border-separate border-spacing-0" aria-label="Top traders in fetched window">
          <thead className="bg-panel">
            <tr className="text-2xs uppercase tracking-wide text-faint">
              <th className="border-b border-border py-1.5 pl-3 text-left font-medium">#</th>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium">Signer</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Volume</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Buy</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Sell</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Trades</th>
            </tr>
          </thead>
          <tbody>
            {traders.map((trader, index) => (
              <tr key={trader.wallet} className="border-b border-border/60 hover:bg-panel-2/50">
                <td className="num px-3 py-1 text-2xs text-faint">{index + 1}</td>
                <td className="px-2 py-1 text-2xs">
                  <span className="inline-flex items-center gap-1">
                    <span className="num text-muted">{truncateMiddle(trader.wallet, 6, 5)}</span>
                    <CopyButton value={trader.wallet} label="Copy signer address" />
                  </span>
                </td>
                <td className="num px-2 py-1 text-right text-xs">{formatMoney(trader.volume)}</td>
                <td className="num px-2 py-1 text-right text-2xs text-buy">{formatMoney(trader.buy)}</td>
                <td className="num px-2 py-1 text-right text-2xs text-sell">{formatMoney(trader.sell)}</td>
                <td className="num px-2 py-1 text-right text-2xs text-muted">{trader.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-3 py-1.5 text-2xs text-faint">
        Ranking covers only the {NETWORKS[network].label} pool window returned by the provider — not all wallets or all
        history. No PnL is attributed to wallets.
      </div>
    </div>
  );
}

export function EarlyBuyersTable({ trades, symbol }: { trades: MarketTrade[]; symbol: string }) {
  const { formatPrice, formatMoney } = useDisplayCurrency();
  const early = useMemo(() => {
    const seen = new Set<string>();
    const out: MarketTrade[] = [];
    for (const trade of [...trades].sort((a, b) => a.at - b.at)) {
      if (trade.side !== "buy" || !trade.wallet || seen.has(trade.wallet)) continue;
      seen.add(trade.wallet);
      out.push(trade);
      if (out.length >= 15) break;
    }
    return out;
  }, [trades]);

  if (early.length === 0) {
    return (
      <EmptyState
        icon={ArrowUpRight}
        title="No early buyers in the fetched window"
        description="Early buyers are derived from buys in the last provider trade window only. The terminal does not fabricate wallet identities or historical rankings."
        compact
      />
    );
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-1.5 text-2xs text-faint">
        First observed buys within the last {trades.length} provider trades · not all-time early buyers
      </div>
      <div className="overflow-x-auto panel-scroll">
        <table className="w-full min-w-[620px] border-separate border-spacing-0" aria-label="Early buyers in fetched window">
          <thead className="bg-panel">
            <tr className="text-2xs uppercase tracking-wide text-faint">
              <th className="border-b border-border py-1.5 pl-3 text-left font-medium">First buy</th>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium">Signer</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Amount</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Value</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Price</th>
              <th className="border-b border-border px-3 py-1.5 text-left font-medium">Tx</th>
            </tr>
          </thead>
          <tbody>
            {early.map((trade) => (
              <tr key={trade.id} className="border-b border-border/60 hover:bg-panel-2/50">
                <td className="num px-3 py-1 text-2xs text-muted">{formatRelativeTime(trade.at)}</td>
                <td className="px-2 py-1 text-2xs">
                  <span className="inline-flex items-center gap-1">
                    <span className="num text-muted">{truncateMiddle(trade.wallet, 6, 5)}</span>
                    <CopyButton value={trade.wallet} label="Copy signer address" />
                  </span>
                </td>
                <td className="num px-2 py-1 text-right text-2xs">
                  {formatNumber(trade.baseAmount, 2)} {symbol}
                </td>
                <td className="num px-2 py-1 text-right text-2xs">{formatMoney(trade.valueUsd)}</td>
                <td className="num px-2 py-1 text-right text-2xs text-muted">{formatPrice(trade.priceUsd)}</td>
                <td className="px-3 py-1 text-2xs text-faint">{truncateMiddle(trade.txHash, 4, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NoVerifiedData({
  title,
  description,
  sourceHint,
}: {
  title: string;
  description: string;
  sourceHint?: string;
}) {
  return (
    <EmptyState
      icon={Users}
      title={title}
      description={
        <>
          {description}
          {sourceHint ? <span className="mt-1 block text-faint">{sourceHint}</span> : null}
        </>
      }
      compact
    />
  );
}

export function WalletSummary({ trades }: { trades: MarketTrade[] }) {
  const unique = new Set(trades.map((t) => t.wallet)).size;
  return (
    <Tooltip content="Unique signers in the fetched window. Not a complete token-holder count.">
      <Badge tone="neutral">{unique} unique signers</Badge>
    </Tooltip>
  );
}
