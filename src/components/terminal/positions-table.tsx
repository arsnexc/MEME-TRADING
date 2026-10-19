"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { TokenAvatar } from "@/components/token/token-avatar";
import { computeUnrealized } from "@/lib/trading/engine";
import type { Position, TokenRef } from "@/lib/trading/types";
import { formatPercent, formatQuote, formatQuotePrice, formatRelativeTime, formatTokenAmount, pnlClass } from "@/lib/formatting";
import { cn, truncateMiddle } from "@/lib/utils";

export interface PositionPrice {
  priceUsd: number | null;
  quoteUsd: number | null;
  source: "live" | "snapshot" | "last-seen";
  at: number | null;
}

export type PriceForPosition = (position: Position) => PositionPrice;

export function PositionsTable({
  positions,
  currentToken,
  priceFor,
  feeRateBps,
  hydrated,
  onSell,
}: {
  positions: Position[];
  currentToken: TokenRef | null;
  priceFor: PriceForPosition;
  feeRateBps: number;
  hydrated: boolean;
  onSell: (position: Position, fraction: number) => Promise<void>;
}) {
  const [selling, setSelling] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <div className="flex items-center gap-2 p-4 text-2xs text-faint">
        <Spinner /> Restoring paper portfolio…
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No open paper positions"
        description={
          currentToken
            ? `Use the execution panel to buy ${currentToken.symbol} with the ${currentToken.network === "solana" ? "SOL" : "ETH"} paper account. Fills, fees and cost basis will appear here.`
            : "Buy a token from discovery to open a simulated position."
        }
        compact
      />
    );
  }

  const sorted = [...positions].sort((a, b) => {
    if (currentToken) {
      const aCurrent = a.token.address === currentToken.address && a.token.network === currentToken.network;
      const bCurrent = b.token.address === currentToken.address && b.token.network === currentToken.network;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  const totals = sorted.reduce(
    (acc, position) => {
      const price = priceFor(position);
      const mark = price.priceUsd && price.quoteUsd ? price.priceUsd / price.quoteUsd : position.lastPriceQuote;
      if (!mark) return acc;
      const pnl = computeUnrealized(position, mark, feeRateBps);
      acc[position.quote].unrealized += pnl.netPnl;
      acc[position.quote].realized += position.realizedPnl;
      acc[position.quote].value += pnl.marketValue;
      return acc;
    },
    {
      SOL: { unrealized: 0, realized: 0, value: 0 },
      ETH: { unrealized: 0, realized: 0, value: 0 },
    },
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-2xs">
        <span className="text-muted">{sorted.length} open position{sorted.length === 1 ? "" : "s"}</span>
        {(["SOL", "ETH"] as const).map((quote) =>
          totals[quote].value > 0 || totals[quote].unrealized !== 0 ? (
            <span key={quote} className="num text-faint">
              {quote} value {formatQuote(totals[quote].value, quote)} ·{" "}
              <span className={pnlClass(totals[quote].unrealized)}>
                uPnL {formatQuote(totals[quote].unrealized, quote)}
              </span>{" "}
              · realized <span className={pnlClass(totals[quote].realized)}>{formatQuote(totals[quote].realized, quote)}</span>
            </span>
          ) : null,
        )}
        <Tooltip content={`Unrealized PnL subtracts the current ${(feeRateBps / 100).toFixed(2)}% simulated exit fee. Cost basis excludes entry fees; entry fees are tracked separately in the Fees column.`}>
          <span className="ml-auto inline-flex cursor-help items-center gap-1 text-faint">
            <Info className="h-2.5 w-2.5" /> net of est. exit fee
          </span>
        </Tooltip>
      </div>
      <div className="overflow-x-auto panel-scroll">
        <table className="w-full min-w-[980px] border-separate border-spacing-0" aria-label="Open paper positions">
          <thead className="bg-panel">
            <tr className="text-2xs uppercase tracking-wide text-faint">
              {["Token", "Entry", "Current", "Size", "Remaining", "Realized", "Unrealized", "Fees", "Return", "Opened", "Actions"].map(
                (heading) => (
                  <th
                    key={heading}
                    className={cn(
                      "border-b border-border px-2 py-1.5 font-medium",
                      heading === "Token" ? "pl-3 text-left" : heading === "Actions" ? "pr-3 text-right" : "text-right",
                      (heading === "Remaining" || heading === "Entry") && "text-right",
                    )}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => {
              const price = priceFor(position);
              const mark =
                price.priceUsd && price.quoteUsd ? price.priceUsd / price.quoteUsd : position.lastPriceQuote;
              const pnl = computeUnrealized(position, mark, feeRateBps);
              const stale = price.source === "last-seen";
              const isCurrent =
                currentToken?.address === position.token.address && currentToken?.network === position.token.network;
              return (
                <tr key={position.id} className={cn("border-b border-border/60 hover:bg-panel-2/50", isCurrent && "bg-accent/[0.04]")}>
                  <td className="py-1.5 pl-3 pr-2">
                    <Link
                      href={`/terminal?${new URLSearchParams({ network: position.token.network, pool: position.token.pool, token: position.token.address }).toString()}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <TokenAvatar src={position.token.imageUrl} symbol={position.token.symbol} size={20} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-fg">{position.token.symbol}</span>
                          <NetworkBadge network={position.token.network} />
                          {isCurrent ? <Badge tone="accent">viewing</Badge> : null}
                        </span>
                        <span className="block max-w-[150px] truncate text-2xs text-faint">
                          {position.token.name} · {truncateMiddle(position.token.address, 4, 4)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-2 py-1.5 text-right text-xs text-muted">{formatQuotePrice(position.avgEntryPrice)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="num block text-xs text-fg">{formatQuotePrice(mark)}</span>
                    <span className={cn("block text-2xs", stale ? "text-warn" : "text-faint")}>
                      {stale ? `last seen ${formatRelativeTime(price.at ?? position.lastPriceAt)}` : "live"}
                    </span>
                  </td>
                  <td className="num px-2 py-1.5 text-right text-xs">
                    {formatQuote(pnl.marketValue, position.quote)}
                  </td>
                  <td className="num px-2 py-1.5 text-right text-xs text-muted">
                    <span className="block">{formatTokenAmount(position.quantity, 6)}</span>
                    <span className="block text-2xs text-faint">{position.token.symbol}</span>
                  </td>
                  <td className={cn("num px-2 py-1.5 text-right text-xs", pnlClass(position.realizedPnl))}>
                    {position.realizedPnl === 0 ? "—" : formatQuote(position.realizedPnl, position.quote)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Tooltip content={`Market value ${formatQuote(pnl.marketValue, position.quote)} − cost basis ${formatQuote(position.costBasis, position.quote)} − estimated exit fee ${formatQuote(pnl.exitFee, position.quote)}`}>
                      <span className={cn("num block cursor-help text-xs", pnlClass(pnl.netPnl))}>
                        {formatQuote(pnl.netPnl, position.quote, 5)}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="num px-2 py-1.5 text-right text-2xs text-muted">{formatQuote(position.feesPaid, position.quote, 5)}</td>
                  <td className={cn("num px-2 py-1.5 text-right text-xs", pnlClass(pnl.pct))}>{formatPercent(pnl.pct)}</td>
                  <td className="px-2 py-1.5 text-right text-2xs text-faint">
                    <span className="block">{formatRelativeTime(position.openedAt)}</span>
                    <span className="block">avg {formatQuotePrice(position.avgEntryPrice)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      {[0.25, 0.5, 1].map((fraction) => (
                        <Tooltip
                          key={fraction}
                          content={
                            stale
                              ? "No fresh provider price for this token. Open its terminal to refresh before selling."
                              : `Sell ${fraction === 1 ? "100" : fraction * 100}% at the current simulated market price`
                          }
                        >
                          <span tabIndex={0}>
                            <button
                              type="button"
                              disabled={stale || selling === position.id}
                              onClick={async () => {
                                setSelling(position.id);
                                try {
                                  await onSell(position, fraction);
                                } finally {
                                  setSelling(null);
                                }
                              }}
                              className={cn(
                                "h-6 rounded-[2px] border px-1.5 text-2xs font-medium transition-colors",
                                fraction === 1
                                  ? "border-sell/40 bg-sell/10 text-sell hover:bg-sell/20"
                                  : "border-border bg-panel-2 text-muted hover:text-fg",
                                (stale || selling === position.id) && "opacity-40",
                              )}
                            >
                              {fraction === 1 ? "100%" : `${fraction * 100}%`}
                            </button>
                          </span>
                        </Tooltip>
                      ))}
                      {selling === position.id ? <Spinner className="ml-1 text-muted" /> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-2xs text-faint">
        Weighted-average cost basis. Entry fees are expensed separately; unrealized PnL subtracts an estimated exit fee.
        Values are shown in each position&apos;s account currency (SOL or ETH). Partial sells preserve remaining basis and
        quantity.
      </p>
    </div>
  );
}
