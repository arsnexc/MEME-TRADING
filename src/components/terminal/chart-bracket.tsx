"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { MoveVertical, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { levelPct, toChartValue, toQuotePrice, toggleLevel, validateLevel, type BracketLevel } from "@/lib/trading/chart-bracket";
import { formatPercent, formatQuotePrice } from "@/lib/formatting";
import { cn } from "@/lib/utils";

export interface ChartBracketData {
  entryQuote: number;
  takeProfitQuote: number | null;
  stopLossQuote: number | null;
  quote: string;
  symbol: string;
  /** Net PnL in the quote currency, after the estimated exit fee. */
  netPnlQuote: number;
  /** Same PnL converted with the reference quote price, when available. */
  usdPnl: number | null;
}

interface Point {
  y: number;
}

interface DragState {
  level: BracketLevel;
  price: number;
}

/**
 * On-chart take-profit / stop-loss bracket.
 *
 * Draws the entry, take-profit and stop-loss as horizontal lines with a control
 * pill anchored to the entry (PnL, USD value, close) exactly like the reference
 * terminal. TP/SL chips switch a level on at a sensible default or off again,
 * and the TP/SL handles can be dragged vertically to set an exact price.
 *
 * Everything is pointer-driven and local: no data is invented, and an invalid
 * drag (TP below entry, SL above it) is rejected instead of stored.
 */
export function ChartBracket({
  chartRef,
  seriesRef,
  multiplier,
  data,
  version,
  onSetLevel,
  onClosePosition,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  /** Chart value per quote unit (1 for quote display, quoteUsd for USD display). */
  multiplier: number;
  data: ChartBracketData;
  /** Bump to force a re-measure after a price tick or resize. */
  version: number;
  onSetLevel: (level: BracketLevel, price: number | null) => void;
  onClosePosition: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [entry, setEntry] = useState<Point | null>(null);
  const [tp, setTp] = useState<Point | null>(null);
  const [sl, setSl] = useState<Point | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** A dragged level that is waiting for the trader to confirm or discard it. */
  const [pending, setPending] = useState<DragState | null>(null);
  const [pendingY, setPendingY] = useState<number | null>(null);
  const [rejected, setRejected] = useState<BracketLevel | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const measure = useCallback(() => {
    const series = seriesRef.current;
    const wrap = wrapRef.current;
    if (!series || !wrap) {
      setEntry(null);
      setTp(null);
      setSl(null);
      return;
    }
    const height = wrap.clientHeight;
    const toPoint = (priceQuote: number | null | undefined): Point | null => {
      if (priceQuote == null || !Number.isFinite(priceQuote)) return null;
      const y = series.priceToCoordinate(toChartValue(priceQuote, multiplier));
      if (y == null || !Number.isFinite(y)) return null;
      if (y < -8 || y > height + 8) return { y: Math.max(-8, Math.min(height + 8, y)) };
      return { y };
    };
    setEntry(toPoint(data.entryQuote));
    setTp(toPoint(data.takeProfitQuote));
    setSl(toPoint(data.stopLossQuote));
    setPendingY(pending ? toPoint(pending.price)?.y ?? null : null);
  }, [data.entryQuote, data.stopLossQuote, data.takeProfitQuote, multiplier, pending, seriesRef]);

  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Subscribe once per chart: pan, zoom and resize all re-measure the handles.
  useEffect(() => {
    const chart = chartRef.current;
    const wrap = wrapRef.current;
    if (!chart || !wrap) return;
    const timeScale = chart.timeScale();
    const onRange = () => measureRef.current();
    timeScale.subscribeVisibleLogicalRangeChange(onRange);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onRange) : null;
    observer?.observe(wrap);
    onRange();
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(onRange);
      observer?.disconnect();
    };
  }, [chartRef]);

  useEffect(() => {
    measure();
  }, [measure, version]);

  const priceFromClientY = useCallback(
    (clientY: number): number | null => {
      const series = seriesRef.current;
      const wrap = wrapRef.current;
      if (!series || !wrap) return null;
      const rect = wrap.getBoundingClientRect();
      const price = series.coordinateToPrice(clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return null;
      return toQuotePrice(price, multiplier);
    },
    [multiplier, seriesRef],
  );

  const startDrag = (level: BracketLevel, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const initial = level === "tp" ? data.takeProfitQuote : data.stopLossQuote;
    if (initial == null) return;
    // A fresh drag replaces any unconfirmed edit instead of stacking them.
    setPending(null);
    setRejected(null);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setDrag({ level, price: initial });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const price = priceFromClientY(event.clientY);
    if (price == null) return;
    setDrag({ level: drag.level, price });
  };

  const endDrag = () => {
    if (!drag) return;
    const price = drag.price;
    setDrag(null);
    if (validateLevel(drag.level, price, data.entryQuote)) {
      // A drag never writes straight to the account: it stages the level and
      // waits for Confirm, so a stray drag cannot silently move someone's exit.
      setPending({ level: drag.level, price });
      setRejected(null);
      return;
    }
    setRejected(drag.level);
    window.setTimeout(() => setRejected(null), 2_500);
  };

  const commitPending = useCallback(() => {
    if (!pending) return;
    onSetLevel(pending.level, pending.price);
    setPending(null);
  }, [onSetLevel, pending]);

  const discardPending = useCallback(() => setPending(null), []);

  // Enter confirms a staged level, Escape discards it — the same contract as
  // the on-chart toolbar.
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPending(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        commitPending();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, commitPending]);

  const pnlPositive = data.netPnlQuote >= 0;
  const entryY = entry?.y ?? null;
  const dragPct = drag ? levelPct(drag.price, data.entryQuote) : null;

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-20">
      {/* Take-profit line */}
      {tp ? (
        <div className="absolute inset-x-0" style={{ top: tp.y }}>
          <div className="h-px w-full border-t border-dashed border-buy/70" />
          <div className="pointer-events-auto absolute right-14 -top-2.5 flex items-center gap-1">
            <span className="num rounded-[2px] border border-buy/40 bg-[#121212] px-1 text-[9px] text-buy">
              TP {formatQuotePrice(data.takeProfitQuote ?? 0)}
            </span>
            <button
              type="button"
              aria-label="Drag take profit"
              onPointerDown={(event) => startDrag("tp", event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="flex h-5 w-3 cursor-ns-resize items-center justify-center rounded-[2px] border border-buy/40 bg-[#121212] text-buy"
            >
              <MoveVertical className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Stop-loss line */}
      {sl ? (
        <div className="absolute inset-x-0" style={{ top: sl.y }}>
          <div className="h-px w-full border-t border-dashed border-sell/70" />
          <div className="pointer-events-auto absolute right-14 -top-2.5 flex items-center gap-1">
            <span className="num rounded-[2px] border border-sell/40 bg-[#121212] px-1 text-[9px] text-sell">
              SL {formatQuotePrice(data.stopLossQuote ?? 0)}
            </span>
            <button
              type="button"
              aria-label="Drag stop loss"
              onPointerDown={(event) => startDrag("sl", event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="flex h-5 w-3 cursor-ns-resize items-center justify-center rounded-[2px] border border-sell/40 bg-[#121212] text-sell"
            >
              <MoveVertical className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Staged level: the line is drawn, nothing is written until Confirm */}
      {pending && pendingY != null ? (
        <>
          <div className="absolute inset-x-0" style={{ top: pendingY }}>
            <div
              className={cn(
                "h-px w-full border-t border-dashed",
                pending.level === "tp" ? "border-buy" : "border-sell",
              )}
            />
            <div className="pointer-events-none absolute right-14 -top-2.5">
              <span
                className={cn(
                  "num rounded-[2px] border border-dashed bg-[#121212] px-1 text-[9px]",
                  pending.level === "tp" ? "border-buy/60 text-buy" : "border-sell/60 text-sell",
                )}
              >
                {pending.level.toUpperCase()} {formatQuotePrice(pending.price)} · unconfirmed
              </span>
            </div>
          </div>

          <div
            role="group"
            aria-label={`${pending.level === "tp" ? "Take profit" : "Stop loss"} change pending`}
            className="pointer-events-auto absolute left-2 flex -translate-y-1/2 items-center gap-1 rounded-[2px] border border-border-strong bg-[#111111]/95 px-1 py-0.5 shadow-lg shadow-black/40"
            style={{ top: pendingY }}
          >
            <span className={cn("text-[9px] font-semibold", pending.level === "tp" ? "text-buy" : "text-sell")}>
              {pending.level === "tp" ? "TP" : "SL"}
            </span>
            <span className="num text-[10px] text-fg">{formatQuotePrice(pending.price)}</span>
            <span className="num text-[9px] text-muted">
              {formatPercent(levelPct(pending.price, data.entryQuote) ?? 0, { sign: true })}
            </span>
            <button
              type="button"
              onClick={discardPending}
              aria-label={`Discard ${pending.level === "tp" ? "take profit" : "stop loss"} change`}
              className="h-5 rounded-[2px] px-1.5 text-[9px] text-muted transition-colors hover:bg-panel-3 hover:text-fg"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={commitPending}
              aria-label={`Confirm ${pending.level === "tp" ? "take profit" : "stop loss"} change`}
              className={cn(
                "h-5 rounded-[2px] px-1.5 text-[9px] font-semibold text-black transition-colors",
                pending.level === "tp" ? "bg-buy hover:bg-buy/85" : "bg-sell text-white hover:bg-sell/85",
              )}
            >
              Confirm
            </button>
          </div>
        </>
      ) : null}

      {rejected ? (
        <div className="pointer-events-none absolute inset-x-0 top-9 z-10 flex justify-center">
          <span className="rounded-[2px] border border-warn/50 bg-[#111111]/95 px-1.5 py-0.5 text-[9px] text-warn">
            {rejected === "tp" ? "Take profit must stay above entry" : "Stop loss must stay below entry"} — drag not
            applied
          </span>
        </div>
      ) : null}

      {/* Live preview while dragging a level */}
      {drag && dragPct != null ? (
        <div className="absolute inset-x-0" style={{ top: (drag.level === "tp" ? 8 : 28) }}>
          <span
            className={cn(
              "num mx-auto block w-fit rounded-[2px] border bg-[#121212] px-1.5 py-0.5 text-[10px]",
              drag.level === "tp" ? "border-buy/50 text-buy" : "border-sell/50 text-sell",
            )}
          >
            {drag.level.toUpperCase()} {formatQuotePrice(drag.price)} {data.quote} ·{" "}
            {formatPercent(dragPct, { sign: true })} — release to set
          </span>
        </div>
      ) : null}

      {/* Entry line, kept subtle so the candles stay readable */}
      {entryY != null ? (
        <div className="absolute inset-x-0" style={{ top: entryY }}>
          <div className={cn("h-px w-full", pnlPositive ? "bg-buy/35" : "bg-sell/35")} />
        </div>
      ) : null}

      {/* Control bar, anchored to the entry line like the reference terminal */}
      {entryY != null ? (
        <div
          className="pointer-events-auto absolute right-16 flex -translate-y-1/2 items-center gap-1"
          style={{ top: entryY }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-[2px] border border-border-strong bg-[#121212] text-[9px] text-muted">
            {data.symbol.slice(0, 2).toUpperCase()}
          </span>

          <button
            type="button"
            aria-pressed={data.takeProfitQuote != null}
            onClick={() => {
              setPending(null);
              onSetLevel("tp", toggleLevel("tp", data.takeProfitQuote, data.entryQuote));
            }}
            title={
              data.takeProfitQuote != null
                ? "Take profit is on — click to remove it"
                : "Take profit is off — click to add +50%"
            }
            className={cn(
              "h-5 rounded-[2px] border border-dashed px-1.5 text-[9px] font-semibold leading-none transition-colors",
              data.takeProfitQuote != null
                ? "border-buy/70 bg-buy/10 text-buy"
                : "border-border-strong text-faint hover:text-muted",
            )}
          >
            TP
          </button>
          <button
            type="button"
            aria-pressed={data.stopLossQuote != null}
            onClick={() => {
              setPending(null);
              onSetLevel("sl", toggleLevel("sl", data.stopLossQuote, data.entryQuote));
            }}
            title={
              data.stopLossQuote != null
                ? "Stop loss is on — click to remove it"
                : "Stop loss is off — click to add −20%"
            }
            className={cn(
              "h-5 rounded-[2px] border border-dashed px-1.5 text-[9px] font-semibold leading-none transition-colors",
              data.stopLossQuote != null
                ? "border-warn/70 bg-warn/10 text-warn"
                : "border-border-strong text-faint hover:text-muted",
            )}
          >
            SL
          </button>

          <div className="flex h-6 items-center overflow-hidden rounded-[2px] border border-border-strong bg-[#121212] text-[10px]">
            <span className={cn("num px-1.5 font-semibold", pnlPositive ? "text-buy" : "text-sell")}>
              {`${pnlPositive ? "+" : "−"}${formatQuotePrice(Math.abs(data.netPnlQuote))}`}
            </span>
            <span className="num border-l border-border px-1.5 text-muted">
              {data.usdPnl == null
                ? "— USD"
                : `${data.usdPnl >= 0 ? "+" : "−"}$${Math.abs(data.usdPnl).toFixed(2)} USD`}
            </span>
            <Tooltip content={confirmClose ? "Click again to close the whole position at market." : "Close this position at market."}>
              <button
                type="button"
                aria-label={confirmClose ? "Confirm close position" : "Close position"}
                onClick={() => {
                  if (!confirmClose) {
                    setConfirmClose(true);
                    window.setTimeout(() => setConfirmClose(false), 3_000);
                    return;
                  }
                  setConfirmClose(false);
                  onClosePosition();
                }}
                className={cn(
                  "flex h-6 w-6 items-center justify-center border-l border-border transition-colors",
                  confirmClose ? "bg-sell text-white" : "text-faint hover:bg-panel-2 hover:text-sell",
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
  );
}
