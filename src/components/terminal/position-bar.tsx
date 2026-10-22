"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { formatHeld, positionProgress } from "@/lib/trading/position-progress";
import type { Position } from "@/lib/trading/types";
import { formatPercent, formatQuote, formatQuotePrice, formatTokenAmount } from "@/lib/formatting";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

/**
 * Bottom-anchored position bar (the reference terminal's trade manager).
 *
 * It answers, in one strip: what am I holding, where did I enter, where is the
 * price now, where are my exits, how long have I held it and what is it worth.
 * The progress line is drawn from the stop level to the take-profit level; when
 * a level is missing the bar says so instead of inventing one.
 */
export function PositionBar({
  position,
  priceQuote,
  quoteUsd,
  feeRateBps,
  onSell,
  onAdd,
  onEditExits,
}: {
  position: Position;
  priceQuote: number | null;
  quoteUsd: number | null;
  feeRateBps: number;
  onSell: () => void;
  onAdd: () => void;
  onEditExits: () => void;
}) {
  const now = useNow(1_000);
  const [confirmingSell, setConfirmingSell] = useState(false);

  const mark = priceQuote ?? position.lastPriceQuote;
  const progress = positionProgress(position, mark, feeRateBps);
  const profitable = progress.netPnlQuote >= 0;
  const usdPnl = quoteUsd != null ? progress.netPnlQuote * quoteUsd : null;
  const entry = position.avgEntryPrice;
  const changePct = entry > 0 ? ((mark - entry) / entry) * 100 : 0;

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-border-strong bg-[#171717]"
      aria-label={`Open ${position.token.symbol} position`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-panel-3 text-[8px] font-bold uppercase text-fg">
            {position.token.symbol.slice(0, 2)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[11px] font-semibold text-fg">
              {position.token.symbol}/{position.quote}
            </p>
            <p className="text-[10px] text-faint">
              <span className="num">{formatTokenAmount(position.quantity, 4)}</span> held · {formatHeld(now - position.openedAt)}
            </p>
          </div>
        </div>

        <div className="hidden items-baseline gap-3 border-l border-border pl-3 sm:flex">
          <div className="leading-tight">
            <p className="text-[9px] uppercase tracking-wide text-faint">Entry</p>
            <p className="num text-[11px] text-muted">{formatQuotePrice(entry)}</p>
          </div>
          <div className="leading-tight">
            <p className="text-[9px] uppercase tracking-wide text-faint">Mark</p>
            <p className="num text-[11px] text-fg">{formatQuotePrice(mark)}</p>
          </div>
          <div className="leading-tight">
            <p className="text-[9px] uppercase tracking-wide text-faint">Size</p>
            <p className="num text-[11px] text-muted">{formatQuote(position.costBasis, position.quote, 3)}</p>
          </div>
        </div>

        <div className="order-3 min-w-[180px] flex-1 px-1 sm:order-none">
          <div className="relative h-6" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-border" />
            <div
              className={cn("absolute left-0 top-1/2 h-[2px] -translate-y-1/2", profitable ? "bg-buy/70" : "bg-sell/70")}
              style={{ width: `${progress.currentPct}%` }}
            />
            {progress.stopLossPct != null ? (
              <span
                className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 bg-sell"
                style={{ left: `${progress.stopLossPct}%` }}
                title={`Stop loss ${formatQuotePrice(position.stopLossPrice ?? 0)}`}
              />
            ) : null}
            <span
              className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-muted"
              style={{ left: `${progress.entryPct}%` }}
              title={`Entry ${formatQuotePrice(entry)}`}
            />
            {progress.takeProfitPct != null ? (
              <span
                className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 bg-buy"
                style={{ left: `${progress.takeProfitPct}%` }}
                title={`Take profit ${formatQuotePrice(position.takeProfitPrice ?? 0)}`}
              />
            ) : null}
            <span
              className={cn(
                "absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black",
                profitable ? "bg-buy" : "bg-sell",
              )}
              style={{ left: `${progress.currentPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] leading-none text-faint">
            <span className="num text-sell">
              {position.stopLossPrice ? `SL ${formatQuotePrice(position.stopLossPrice)}` : "SL not set"}
            </span>
            <span className="num">
              {progress.towardTarget != null ? `${Math.round(progress.towardTarget * 100)}% to TP` : "no TP set"}
            </span>
            <span className="num text-buy">
              {position.takeProfitPrice ? `TP ${formatQuotePrice(position.takeProfitPrice)}` : "TP not set"}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-right leading-tight">
            <p className={cn("num text-[12px] font-semibold", profitable ? "text-buy" : "text-sell")}>
              {profitQuote(progress.netPnlQuote, position.quote)}
              {usdPnl != null ? <span className="ml-1 text-[10px] font-normal text-faint">≈ {formatUsd(usdPnl)}</span> : null}
            </p>
            <p className="text-[9px] text-faint">
              <span className={cn("num", profitable ? "text-buy" : "text-sell")}>{formatPercent(progress.pnlPct, { sign: true })}</span>{" "}
              · mark {formatPercent(changePct, { sign: true })}
            </p>
          </div>

          <Tooltip content="Edit take-profit and stop-loss levels for this position.">
            <button
              type="button"
              onClick={onEditExits}
              aria-label="Edit take-profit and stop-loss"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-panel-2 text-faint transition-colors hover:text-fg"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </Tooltip>

          <button
            type="button"
            onClick={() => {
              if (!confirmingSell) {
                setConfirmingSell(true);
                window.setTimeout(() => setConfirmingSell(false), 3_000);
                return;
              }
              setConfirmingSell(false);
              onSell();
            }}
            className="flex h-7 min-w-[64px] items-center justify-center rounded-sm bg-sell/85 px-2 text-[11px] font-semibold text-white transition-colors hover:bg-sell"
          >
            {confirmingSell ? "Confirm" : "SELL"}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="flex h-7 min-w-[64px] items-center justify-center rounded-sm bg-info/90 px-2 text-[11px] font-semibold text-white transition-colors hover:bg-info"
          >
            BUY
          </button>
        </div>
      </div>
    </div>
  );
}

function profitQuote(value: number, quote: string): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatQuote(value, quote, 4)}`;
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "−" : "";
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `${prefix}$${abs.toFixed(2)}`;
  return `${prefix}$${abs.toFixed(4)}`;
}
