"use client";

import { useMemo } from "react";
import { QUOTE_CURRENCIES, type QuoteCurrency } from "@/lib/constants";
import { computeUnrealized } from "@/lib/trading/engine";
import { formatPercent, formatQuote } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";

interface AccountTotals {
  cash: number;
  positions: number;
  equity: number;
  unrealized: number;
  realized: number;
  fees: number;
  initial: number;
  open: number;
}

function totalsFor(
  quote: QuoteCurrency,
  state: ReturnType<typeof usePaperStore.getState>,
): AccountTotals {
  const feeRateBps = state.feeRateBps;
  let positions = 0;
  let unrealized = 0;
  let open = 0;
  for (const position of state.positions) {
    if (position.quote !== quote) continue;
    open += 1;
    const mark = position.lastPriceQuote;
    positions += position.quantity * mark;
    unrealized += computeUnrealized(position, mark, feeRateBps).netPnl;
  }
  const cash = state.balances[quote];
  return {
    cash,
    positions,
    equity: cash + positions,
    unrealized,
    realized: state.realizedPnl[quote],
    fees: state.feesPaid[quote],
    initial: state.initialBalances[quote],
    open,
  };
}

function Cell({
  label,
  value,
  tone,
  hint,
  strong,
}: {
  label: string;
  value: string;
  tone?: "buy" | "sell" | "muted";
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-1 px-2" title={hint}>
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      <span
        className={cn(
          "num text-[11px]",
          strong ? "text-fg" : "text-muted",
          tone === "buy" && "text-buy",
          tone === "sell" && "text-sell",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Terminal status bar (the strip under the chart in the reference layout).
 *
 * Numbers come from the paper engine exactly as stored: cash is the free
 * balance, positions are marked at the last provider price saved on the device,
 * and equity is the sum. Nothing here is projected or annualised.
 */
export function AccountBar() {
  const hydrated = useHydrated();
  const state = usePaperStore();

  const groups = useMemo(
    () => QUOTE_CURRENCIES.map((quote) => ({ quote, totals: totalsFor(quote, state) })),
    [state],
  );

  return (
    <div className="border-t border-border bg-[#0b0b0b]" aria-label="Paper account summary">
      <div className="flex items-center gap-0 overflow-x-auto panel-scroll">
        <span className="hidden shrink-0 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint sm:inline">
          Paper account
        </span>
        {groups.map(({ quote, totals }, index) => (
          <div
            key={quote}
            className={cn("flex shrink-0 items-center", index > 0 && "border-l border-border")}
          >
            <span className="px-2 text-[10px] font-bold text-fg">{quote}</span>
            <Cell
              label="Balance"
              value={hydrated ? formatQuote(totals.cash, quote, 4) : "—"}
              strong
              hint={`Free ${quote} cash available to trade. Buying moves cash into a position.`}
            />
            <Cell
              label="Equity"
              value={hydrated ? formatQuote(totals.equity, quote, 4) : "—"}
              strong
              hint="Cash + the current value of open positions. A buy barely changes this — only fees and price moves do."
            />
            <Cell
              label="Realized"
              value={hydrated ? formatQuote(totals.realized, quote, 4) : "—"}
              tone={totals.realized >= 0 ? "buy" : "sell"}
              hint="Profit or loss already booked by closing trades, after fees."
            />
            <Cell
              label="Unrealized"
              value={hydrated ? formatQuote(totals.unrealized, quote, 4) : "—"}
              tone={totals.unrealized >= 0 ? "buy" : "sell"}
              hint="Open profit or loss on positions still held, net of the estimated exit fee."
            />
            <Cell
              label="Positions"
              value={hydrated ? formatQuote(totals.positions, quote, 4) : "—"}
              hint="Market value of open positions at the last provider price."
            />
            <Cell
              label="Open"
              value={hydrated ? String(totals.open) : "—"}
              hint="Number of open positions in this quote account."
            />
            <Cell
              label="Fees"
              value={hydrated ? formatQuote(totals.fees, quote, 4) : "—"}
              hint="Total simulated fees paid from this account."
            />
            {hydrated && totals.initial > 0 ? (
              <Cell
                label="Return"
                value={formatPercent(((totals.equity - totals.initial) / totals.initial) * 100, { sign: true })}
                tone={totals.equity >= totals.initial ? "buy" : "sell"}
                hint={`Started at ${formatQuote(totals.initial, quote, 0)}.`}
              />
            ) : null}
          </div>
        ))}
        <div className="ml-auto hidden shrink-0 items-center gap-1 px-2 text-[10px] text-faint md:flex">
          <span className="h-1 w-1 rounded-full bg-buy" />
          simulated · marked at last provider price
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 px-2 py-0.5 text-[10px] text-faint md:hidden">
        <span>Paper account · simulated only</span>
        <span className="ml-auto">Quotes never convert into each other</span>
      </div>
    </div>
  );
}
