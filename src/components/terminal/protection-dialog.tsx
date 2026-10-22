"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/stores/toast";
import { usePaperStore } from "@/stores/paper-trading";
import { protectionPercent } from "@/lib/trading/engine";
import { formatInputValue, parseAmountInput } from "@/lib/trading/validation";
import type { Position } from "@/lib/trading/types";
import { formatPercent, formatQuotePrice } from "@/lib/formatting";
import { cn } from "@/lib/utils";

const TP_PRESETS = [25, 50, 100, 200];
const SL_PRESETS = [10, 25, 50];

/**
 * Set or clear automatic exits for one position.
 *
 * Levels are stored as absolute quote-currency prices so they survive refreshes
 * and price moves. Percent chips are just a shortcut for the same thing.
 */
export function ProtectionDialog({
  position,
  open,
  onOpenChange,
}: {
  position: Position;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTakeProfit(position.takeProfitPrice ? formatInputValue(position.takeProfitPrice, 12) : "");
    setStopLoss(position.stopLossPrice ? formatInputValue(position.stopLossPrice, 12) : "");
    setError(null);
  }, [open, position.takeProfitPrice, position.stopLossPrice]);

  const tp = parseAmountInput(takeProfit, { maxDecimals: 12 });
  const sl = parseAmountInput(stopLoss, { maxDecimals: 12 });

  const tpPct = takeProfit.trim() === "" ? null : protectionPercent(position.avgEntryPrice, tp.value);
  const slPct = stopLoss.trim() === "" ? null : protectionPercent(position.avgEntryPrice, sl.value);

  const setFromPercent = (kind: "tp" | "sl", pct: number) => {
    const price =
      kind === "tp"
        ? position.avgEntryPrice * (1 + pct / 100)
        : position.avgEntryPrice * (1 - pct / 100);
    if (kind === "tp") setTakeProfit(formatInputValue(price, 12));
    else setStopLoss(formatInputValue(price, 12));
    setError(null);
  };

  const save = () => {
    if (takeProfit.trim() !== "" && !tp.ok) {
      setError(tp.error ?? "Enter a valid take-profit price.");
      return;
    }
    if (stopLoss.trim() !== "" && !sl.ok) {
      setError(sl.error ?? "Enter a valid stop-loss price.");
      return;
    }
    const result = usePaperStore.getState().setProtection(position.id, {
      takeProfitPrice: takeProfit.trim() === "" ? null : tp.value,
      stopLossPrice: stopLoss.trim() === "" ? null : sl.value,
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const hasLevels = takeProfit.trim() !== "" || stopLoss.trim() !== "";
    toast({
      title: hasLevels ? `Protection saved · ${position.token.symbol}` : `Protection removed · ${position.token.symbol}`,
      description: hasLevels
        ? "The position closes automatically when the market price crosses a level."
        : "This position now only closes when you sell it.",
      variant: "info",
    });
    onOpenChange(false);
  };

  const clear = () => {
    const result = usePaperStore.getState().setProtection(position.id, { takeProfitPrice: null, stopLossPrice: null });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast({ title: `Protection removed · ${position.token.symbol}`, variant: "info" });
    onOpenChange(false);
  };

  const atRisk = useMemo(() => {
    if (stopLoss.trim() === "" || !sl.ok) return null;
    return (sl.value! - position.avgEntryPrice) * position.quantity;
  }, [sl.ok, sl.value, stopLoss, position.avgEntryPrice, position.quantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        title={`Auto exit · ${position.token.symbol}`}
        description="Sell this whole position automatically when the price reaches a level. Checked on live price ticks while the app is open. Fills are simulated with your configured fee and slippage."
      >

        <div className="mt-3 rounded-sm border border-border bg-panel-2 px-2.5 py-2 text-2xs">
          <div className="flex items-center justify-between">
            <span className="text-faint">Average entry</span>
            <span className="num text-fg">
              {formatQuotePrice(position.avgEntryPrice)} {position.quote}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-faint">Position size</span>
            <span className="num text-muted">
              {position.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} {position.token.symbol}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <label className="flex items-center justify-between text-2xs font-medium text-muted" htmlFor="tp-price">
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3 text-buy" /> Take profit <span className="text-faint">— sell when price rises to</span>
              </span>
              {takeProfit.trim() === "" ? (
                <span className="text-faint">off</span>
              ) : tpPct != null && Number.isFinite(tpPct) ? (
                <Badge tone={tpPct > 0 ? "green" : "red"}>{formatPercent(tpPct)}</Badge>
              ) : null}
            </label>
            <div className="mt-1 flex items-center gap-1">
              <div className="relative flex-1">
                <input
                  id="tp-price"
                  inputMode="decimal"
                  value={takeProfit}
                  onChange={(event) => {
                    setTakeProfit(event.target.value);
                    setError(null);
                  }}
                  placeholder="Price above entry"
                  className="h-8 w-full rounded-sm border border-border bg-panel-2 pl-2 pr-12 text-xs text-fg outline-none focus:border-border-strong"
                  disabled={!position.quantity}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-faint">
                  {position.quote}
                </span>
              </div>
              {TP_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setFromPercent("tp", pct)}
                  className="h-8 rounded-[2px] border border-border bg-panel-2 px-1.5 text-2xs text-muted transition-colors hover:text-fg"
                >
                  +{pct}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-2xs font-medium text-muted" htmlFor="sl-price">
              <span className="inline-flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-sell" /> Stop loss <span className="text-faint">— sell when price falls to</span>
              </span>
              {stopLoss.trim() === "" ? (
                <span className="text-faint">off</span>
              ) : slPct != null && Number.isFinite(slPct) ? (
                <Badge tone={slPct < 0 ? "red" : "green"}>{formatPercent(slPct)}</Badge>
              ) : null}
            </label>
            <div className="mt-1 flex items-center gap-1">
              <div className="relative flex-1">
                <input
                  id="sl-price"
                  inputMode="decimal"
                  value={stopLoss}
                  onChange={(event) => {
                    setStopLoss(event.target.value);
                    setError(null);
                  }}
                  placeholder="Price below entry"
                  className="h-8 w-full rounded-sm border border-border bg-panel-2 pl-2 pr-12 text-xs text-fg outline-none focus:border-border-strong"
                  disabled={!position.quantity}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-faint">
                  {position.quote}
                </span>
              </div>
              {SL_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setFromPercent("sl", pct)}
                  className="h-8 rounded-[2px] border border-border bg-panel-2 px-1.5 text-2xs text-muted transition-colors hover:text-fg"
                >
                  −{pct}%
                </button>
              ))}
            </div>
          </div>

          {atRisk != null && atRisk < 0 ? (
            <p className="text-2xs text-faint">
              If the stop fills, this position loses about{" "}
              <span className="num text-sell">{Math.abs(atRisk).toFixed(4)} {position.quote}</span> before fees.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-sm border border-sell/30 bg-sell/10 px-2 py-1.5 text-2xs text-sell">{error}</p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clear} className={cn(position.takeProfitPrice == null && position.stopLossPrice == null && "invisible")}>
            Remove protection
          </Button>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Save levels
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
