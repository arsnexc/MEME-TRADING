"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { CalloutComposer } from "./callouts";
import { useNow } from "@/hooks/use-now";
import { SLIPPAGE_PRESETS, computeBuyPlan, computeSellPlan, computeUnrealized } from "@/lib/trading/engine";
import { formatInputValue, parseAmountInput } from "@/lib/trading/validation";
import type { MarketTrade, MarketToken, QuotePrices } from "@/lib/market-data/types";
import type { BuyPlan, LimitOrder, SellPlan, TokenRef } from "@/lib/trading/types";
import {
  formatPercent,
  formatQuote,
  formatQuotePrice,
  formatRelativeTime,
  formatTokenAmount,
  pnlClass,
} from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { toast } from "@/stores/toast";

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "advanced";

const QUICK_BUY = [0.01, 0.1, 1, 10];
const SELL_FRACTIONS = [0.25, 0.5, 0.75, 1];

export function ExecutionPanel({
  token,
  market,
  quotePrices,
  priceLastUpdated,
  livePriceUsd,
  livePriceAt,
  paperPositions,
  hasTradeWindow,
  trades,
  onRefreshPrice,
  addRequest = null,
}: {
  token: TokenRef;
  market: MarketToken;
  quotePrices: QuotePrices;
  priceLastUpdated: number | null;
  /** Freshest tick from the live-price poller; falls back to the market query. */
  livePriceUsd?: number | null;
  livePriceAt?: number | null;
  paperPositions: ReturnType<typeof usePaperStore.getState>["positions"];
  hasTradeWindow: boolean;
  trades: MarketTrade[];
  onRefreshPrice: () => void;
  /** Prefill request from the position bar: switch to Buy with this notional. */
  addRequest?: { id: number; amount: number } | null;
}) {
  const now = useNow(5_000);
  const hydrated = useHydrated();
  const balances = usePaperStore((state) => state.balances);
  const feeRateBps = usePaperStore((state) => state.feeRateBps);
  const slippageBps = usePaperStore((state) => state.slippageBps);
  const setFeeRateBps = usePaperStore((state) => state.setFeeRateBps);
  const setSlippageBps = usePaperStore((state) => state.setSlippageBps);

  const quote = market.quote;
  const balance = balances[quote];
  const position = paperPositions.find(
    (p) => p.token.network === token.network && p.token.address === token.address,
  );
  const quoteUsd = quotePrices[quote]?.usd ?? null;
  // Prefer the fast ticker so a fill is priced at what the chart is showing.
  const referencePriceUsd = livePriceUsd ?? market.priceUsd;
  const referenceAt = livePriceAt ?? priceLastUpdated;
  const referencePrice = referencePriceUsd != null && quoteUsd ? referencePriceUsd / quoteUsd : null;
  const priceAge = referenceAt ? now - referenceAt : null;
  const priceFresh = priceAge != null && priceAge < 60_000;
  const displayAge = referenceAt ? formatRelativeTime(referenceAt, now) : "unknown";

  const panelRef = useRef<HTMLElement | null>(null);
  const [panelTab, setPanelTab] = useState<"order" | "depth">("order");
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amountInput, setAmountInput] = useState("");
  const [limitPriceInput, setLimitPriceInput] = useState("");
  const [priorityFeeInput, setPriorityFeeInput] = useState("");
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [takeProfitPctInput, setTakeProfitPctInput] = useState("");
  const [stopLossPctInput, setStopLossPctInput] = useState("");
  const [feePercentInput, setFeePercentInput] = useState((feeRateBps / 100).toString());
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string; detail?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setFeePercentInput((feeRateBps / 100).toString());
  }, [feeRateBps]);

  // "BUY" on the position bar opens the ticket on the buy side with the same
  // notional pre-filled. Nothing is submitted for the user.
  useEffect(() => {
    if (!addRequest) return;
    setPanelTab("order");
    setSide("buy");
    setOrderType("market");
    setAmountInput(addRequest.amount > 0 ? formatInputValue(addRequest.amount, 9) : "");
    setMessage(null);
    const node = panelRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [addRequest]);

  const amount = parseAmountInput(amountInput, { maxDecimals: side === "buy" ? 9 : 9 });
  const limitPrice = parseAmountInput(limitPriceInput, { maxDecimals: 12 });
  const priorityFee = priorityFeeInput.trim() === "" ? 0 : Number(priorityFeeInput);
  const priorityFeeValid = Number.isFinite(priorityFee) && priorityFee >= 0;

  const protectionAvailable = side === "buy" && orderType !== "limit";
  const takeProfitPct = takeProfitPctInput.trim() === "" ? null : Number(takeProfitPctInput);
  const stopLossPct = stopLossPctInput.trim() === "" ? null : Number(stopLossPctInput);
  const takeProfitValid = takeProfitPct == null || (Number.isFinite(takeProfitPct) && takeProfitPct > 0);
  const stopLossValid = stopLossPct == null || (Number.isFinite(stopLossPct) && stopLossPct > 0 && stopLossPct < 100);
  const hasProtection = protectionAvailable && (takeProfitPct != null || stopLossPct != null);
  const protectionPreview =
    referencePrice && hasProtection
      ? {
          takeProfit: takeProfitValid && takeProfitPct != null ? referencePrice * (1 + takeProfitPct / 100) : null,
          stopLoss: stopLossValid && stopLossPct != null ? referencePrice * (1 - stopLossPct / 100) : null,
        }
      : null;

  const windowStats = useMemo(() => {
    const cutoff = now - 300_000;
    const recent = trades.filter((trade) => trade.at >= cutoff);
    if (!hasTradeWindow || recent.length === 0) {
      return { buy: null as number | null, sell: null as number | null, net: null as number | null, count: 0 };
    }
    let buy = 0;
    let sell = 0;
    for (const trade of recent) {
      if (trade.side === "buy") buy += trade.valueUsd;
      else sell += trade.valueUsd;
    }
    return { buy, sell, net: buy - sell, count: recent.length };
  }, [trades, now, hasTradeWindow]);

  const preview = useMemo(() => {
    if (!amount.ok || amount.value == null) return null;
    if (!quoteUsd || !referenceAt) return null;
    if (orderType === "limit") {
      if (!limitPrice.ok || limitPrice.value == null) return null;
      const syntheticUsd = limitPrice.value * quoteUsd;
      if (side === "buy") {
        const result = computeBuyPlan({
          token,
          quote,
          amountQuote: amount.value,
          priceUsd: syntheticUsd,
          quoteUsd,
          balance: Number.MAX_SAFE_INTEGER,
          feeRateBps,
          slippageBps: 0,
        });
        return result.ok ? { kind: "buy" as const, plan: result.value, limit: limitPrice.value } : null;
      }
      if (!position) return null;
      const result = computeSellPlan({
        token,
        quote,
        positionId: position.id,
        quantity: amount.value,
        priceUsd: syntheticUsd,
        quoteUsd,
        avgEntryPrice: position.avgEntryPrice,
        feeRateBps,
        slippageBps: 0,
      });
      return result.ok ? { kind: "sell" as const, plan: result.value, limit: limitPrice.value } : null;
    }

    if (!referencePriceUsd) return null;
    if (side === "buy") {
      const result = computeBuyPlan({
        token,
        quote,
        amountQuote: amount.value,
        priceUsd: referencePriceUsd,
        quoteUsd,
        balance: Number.MAX_SAFE_INTEGER,
        feeRateBps,
        slippageBps,
        priorityFeeQuote: orderType === "advanced" ? (priorityFeeValid ? priorityFee : 0) : 0,
      });
      return result.ok ? { kind: "buy" as const, plan: result.value, limit: null } : null;
    }
    if (!position) return null;
    const result = computeSellPlan({
      token,
      quote,
      positionId: position.id,
      quantity: amount.value,
      priceUsd: referencePriceUsd,
      quoteUsd,
      avgEntryPrice: position.avgEntryPrice,
      feeRateBps,
      slippageBps,
    });
    return result.ok ? { kind: "sell" as const, plan: result.value, limit: null } : null;
  }, [
    amount,
    limitPrice,
    orderType,
    side,
    quoteUsd,
    quote,
    token,
    feeRateBps,
    slippageBps,
    referencePriceUsd,
    position,
    priorityFee,
    priorityFeeValid,
    referenceAt,
  ]);

  const buyNotional = side === "buy" && amount.ok && amount.value != null ? amount.value : 0;
  const buyFee = (buyNotional * feeRateBps) / 10_000;
  const buyTotal =
    buyNotional + buyFee + (orderType === "advanced" && priorityFeeValid ? priorityFee : 0);

  const validation = (() => {
    if (!hydrated) return "Restoring paper account…";
    if (!quoteUsd) return "Quote reference price unavailable. Trading is paused.";
    if (!referencePriceUsd) return "No usable market price for this pool.";
    if (!referenceAt) return "Waiting for a price update.";
    if (!priceFresh) return `Price is stale (${displayAge}). Refresh before trading.`;
    if (side === "sell" && !position) return "No open position for this token. Buy first or switch to Buy.";
    if (amountInput.trim() === "") return side === "buy" ? "Enter a quote amount." : "Enter a token quantity.";
    if (!amount.ok) return amount.error ?? "Invalid amount.";
    if (orderType === "limit" && limitPriceInput.trim() === "") return "Enter a limit price.";
    if (orderType === "limit" && !limitPrice.ok) return limitPrice.error ?? "Invalid limit price.";
    if (orderType === "advanced") {
      const parsedFee = Number(feePercentInput);
      if (feePercentInput.trim() === "" || !Number.isFinite(parsedFee) || parsedFee < 0 || parsedFee > 5) {
        return "Execution fee must be between 0% and 5%.";
      }
      if (!priorityFeeValid) return "Priority fee must be zero or a positive number.";
    }
    if (side === "buy" && buyTotal > balance + 1e-9) {
      return `Insufficient ${quote} balance. Required ${buyTotal.toFixed(4)} ${quote}, available ${balance.toFixed(4)} ${quote}.`;
    }
    if (side === "sell") {
      if (!position) return "No open position for this token. Buy first or switch to Buy.";
      if (amount.value != null && amount.value > position.quantity + 1e-9) {
        return `Quantity exceeds your remaining ${formatTokenAmount(position.quantity, 6)} ${token.symbol}.`;
      }
    }
    if (protectionAvailable && !takeProfitValid) return "Take profit must be a positive percentage, or left blank.";
    if (protectionAvailable && !stopLossValid) return "Stop loss must be between 0 and 100%, or left blank.";
    return null;
  })();

  const buttonLabel = submitting
    ? "Simulating…"
    : orderType === "limit"
      ? `Place limit ${side}`
      : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`;

  const reset = () => {
    setAmountInput("");
    setLimitPriceInput("");
    setPriorityFeeInput("");
    setTakeProfitPctInput("");
    setStopLossPctInput("");
    setProtectionOpen(false);
  };

  const execute = async () => {
    if (submittingRef.current || validation) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 180));
    try {
      const store = usePaperStore.getState();
      if (!referencePriceUsd || !quoteUsd) {
        setMessage({ kind: "error", text: "No fresh reference price. Order rejected." });
        return;
      }
      if (orderType === "limit") {
        if (!limitPrice.value) return;
        const result = store.placeLimit({
          token,
          side,
          limitPrice: limitPrice.value,
          amount: amount.value!,
          quoteUsd,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error.message });
          toast({ title: "Limit order rejected", description: result.error.message, variant: "error" });
          return;
        }
        const order: LimitOrder = result.value;
        setMessage({
          kind: "success",
          text: `${order.side === "buy" ? "Buy" : "Sell"} limit placed`,
          detail: `${order.side === "buy" ? formatQuote(order.amount, quote) : `${formatTokenAmount(order.amount, 6)} ${token.symbol}`} at ${
            order.side === "buy" ? "≤" : "≥"
          } ${formatQuotePrice(order.limitPrice)} ${quote}. Pending — monitored while the app is open.`,
        });
        toast({ title: "Paper limit order placed", description: `${token.symbol} · ${order.side}`, variant: "success" });
        reset();
        return;
      }

      if (side === "buy") {
        const result = store.buy({
          token,
          amountQuote: amount.value!,
          priceUsd: referencePriceUsd,
          quoteUsd,
          priorityFeeQuote: orderType === "advanced" ? priorityFee : 0,
          takeProfitPct: protectionAvailable && takeProfitValid ? takeProfitPct : null,
          stopLossPct: protectionAvailable && stopLossValid ? stopLossPct : null,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error.message });
          toast({ title: "Simulated buy rejected", description: result.error.message, variant: "error" });
          return;
        }
        const plan = result.value.plan as BuyPlan;
        const protectionNote =
          hasProtection && protectionPreview
            ? ` · ${protectionPreview.takeProfit ? `TP ${formatQuotePrice(protectionPreview.takeProfit)}` : ""}${protectionPreview.takeProfit && protectionPreview.stopLoss ? " · " : ""}${protectionPreview.stopLoss ? `SL ${formatQuotePrice(protectionPreview.stopLoss)}` : ""}`
            : "";
        setMessage({
          kind: "success",
          text: `Filled: bought ${formatTokenAmount(result.value.trade.quantity, 4)} ${token.symbol}`,
          detail: `${formatQuote(plan.notional, quote)} notional · fee ${formatQuote(plan.fee, quote, 5)} · total ${formatQuote(plan.totalDebit, quote, 5)} · avg fill ${formatQuotePrice(plan.fillPrice)} ${quote}${protectionNote} · simulated ${new Date(plan.at).toLocaleTimeString("en-GB", { hour12: false })}`,
        });
        toast({
          title: `Paper buy filled · ${token.symbol}`,
          description: `${formatTokenAmount(result.value.trade.quantity, 4)} ${token.symbol} for ${formatQuote(plan.totalDebit, quote)} (incl. fee)`,
          variant: "success",
        });
        reset();
      } else {
        if (!position) return;
        const result = store.sell({
          positionId: position.id,
          quantity: amount.value!,
          priceUsd: referencePriceUsd,
          quoteUsd,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error.message });
          toast({ title: "Simulated sell rejected", description: result.error.message, variant: "error" });
          return;
        }
        const plan = result.value.plan as SellPlan;
        setMessage({
          kind: "success",
          text: `Filled: sold ${formatTokenAmount(plan.quantity, 4)} ${token.symbol}`,
          detail: `Gross ${formatQuote(plan.gross, quote)} · fee ${formatQuote(plan.fee, quote, 5)} · net ${formatQuote(plan.netProceeds, quote, 5)} · realized ${formatQuote(plan.realizedPnl, quote, 5)} · simulated ${new Date(plan.at).toLocaleTimeString("en-GB", { hour12: false })}`,
        });
        toast({
          title: `Paper sell filled · ${token.symbol}`,
          description: `${formatQuote(plan.netProceeds, quote)} net · realized ${formatQuote(plan.realizedPnl, quote)}`,
          variant: "success",
        });
        reset();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const setSellFraction = (fraction: number) => {
    if (!position) return;
    setAmountInput(formatInputValue(position.quantity * fraction, 6));
  };

  const maxBuy = () => {
    const available = Math.max(0, balance / (1 + feeRateBps / 10_000) - (orderType === "advanced" ? priorityFee : 0));
    setAmountInput(formatInputValue(available, 6));
  };

  const unrealized = position && referencePrice ? computeUnrealized(position, referencePrice, feeRateBps) : null;

  const metricsAvailable = hasTradeWindow;

  const sliderMax =
    side === "buy"
      ? Math.max(0, balance / (1 + feeRateBps / 10_000) - (orderType === "advanced" ? priorityFee : 0))
      : position?.quantity ?? 0;
  const sliderPct = sliderMax > 0 && amount.value != null ? Math.min(100, (amount.value / sliderMax) * 100) : 0;
  const depth = buildDepth(trades, referencePrice, quoteUsd);

  // Each side fills at a different price: buys pay up by the slippage
  // assumption, sells give it up. Showing the same mid on both buttons hid
  // that spread, so the tags carry the price the engine will actually use
  // (and the limit price once a valid one is typed).
  const limitFillPrice = orderType === "limit" && limitPrice.value != null ? limitPrice.value : null;
  const slippageRate = orderType === "limit" ? 0 : slippageBps / 10_000;
  const buyTagPrice =
    limitFillPrice ?? (referencePrice != null ? referencePrice * (1 + slippageRate) : null);
  const sellTagPrice =
    limitFillPrice ?? (referencePrice != null ? referencePrice * (1 - slippageRate) : null);
  const buyTagLabel = buyTagPrice != null ? formatQuotePrice(buyTagPrice) : "—";
  const sellTagLabel = sellTagPrice != null ? formatQuotePrice(sellTagPrice) : "—";
  const isLimit = orderType === "limit";
  const tagHint = isLimit
    ? "at the limit price · slippage not applied"
    : `last ${formatQuotePrice(referencePrice ?? 0)} ${slippageRate > 0 ? `· ${(slippageBps / 100).toFixed(2)}% slippage` : "· no slippage"}`;
  const tradeValue = preview
    ? preview.kind === "buy"
      ? preview.plan.notional
      : preview.plan.gross
    : null;

  return (
    <aside
      ref={panelRef}
      className="flex min-h-0 flex-col border-border bg-[#111111] xl:border-l"
      aria-label="Paper order execution"
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-panel-3 text-[8px] font-bold text-fg">
          {token.symbol.slice(0, 2).toUpperCase()}
        </span>
        <span className="truncate text-xs font-semibold text-fg">{token.symbol}</span>
        <Tooltip content="Orders are simulated locally. No wallet is connected and no transaction is signed or broadcast.">
          <span className="inline-flex items-center gap-1 text-[10px] text-faint">
            <Lock className="h-2.5 w-2.5" /> paper
          </span>
        </Tooltip>
        <div className="ml-auto flex items-center gap-0.5" role="group" aria-label="Order panel view">
          {(["order", "depth"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={panelTab === tab}
              onClick={() => setPanelTab(tab)}
              title={
                tab === "depth"
                  ? "Depth of market. Spot pools publish no order book, so this is a ladder built from the latest public trades."
                  : "Order ticket"
              }
              className={cn(
                "h-7 px-2 text-[11px] font-medium transition-colors",
                panelTab === tab ? "border-b-2 border-fg text-fg" : "border-b-2 border-transparent text-faint hover:text-muted",
              )}
            >
              {tab === "depth" ? "DOM" : "Order"}
            </button>
          ))}
        </div>
      </div>

      {panelTab === "depth" ? (
        <div className="flex-1 overflow-y-auto panel-scroll">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] text-faint">
            <span>Price · {quote}</span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-buy/60" /> bought
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-sell/60" /> sold
              </span>
            </span>
          </div>
          {depth.levels.length === 0 ? (
            <p className="px-2 py-3 text-2xs leading-relaxed text-faint">
              {depth.window === 0
                ? "A DOM ladder needs a live price and recent public trades, and this pool returned one of them empty. Nothing is synthesised."
                : `The last ${depth.window} public trades all sit outside the ±3% band around the live price, so there is nothing to stack. Nothing is synthesised.`}
            </p>
          ) : (
            <div className="px-1 pb-2">
              {depth.levels.map((level, index) => {
                const width = depth.total > 0 ? Math.max(3, (level.valueUsd / depth.total) * 100) : 3;
                const buyShare = level.valueUsd > 0 ? (level.buyUsd / level.valueUsd) * 100 : 50;
                return (
                  <div
                    key={`${level.price}-${index}`}
                    className="relative flex h-5 items-center px-1 text-[11px]"
                    title={`${formatMoneyShort(level.buyUsd)} bought · ${formatMoneyShort(level.sellUsd)} sold · ${level.count} trades`}
                  >
                    {/* One bar per price bucket, split by the side that traded there. */}
                    <span className="absolute inset-y-0 left-0 flex" style={{ width: `${width}%` }}>
                      <span className="h-full bg-buy/20" style={{ width: `${buyShare}%` }} />
                      <span className="h-full bg-sell/20" style={{ width: `${100 - buyShare}%` }} />
                    </span>
                    <span className="num relative z-10 text-fg">{formatQuotePrice(level.price)}</span>
                    <span className="num relative z-10 ml-auto text-muted">{formatMoneyShort(level.valueUsd)}</span>
                  </div>
                );
              })}
              <p className="mt-2 border-t border-border px-1 pt-1.5 text-[10px] leading-relaxed text-faint">
                Aggregated from the last {depth.window} public trades, bucketed by price around the live price. Green
                is volume that changed hands on a buy, red on a sell — this is a trade-flow ladder, not a real order
                book. No resting liquidity is claimed.
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-1.5">
            <button
              type="button"
              aria-pressed={side === "sell"}
              aria-label="Sell"
              title={`Sell at ${sellTagLabel} ${quote} ${tagHint}`}
              onClick={() => {
                setSide("sell");
                setAmountInput("");
                setMessage(null);
              }}
              className={cn(
                "flex h-11 flex-col items-start justify-center rounded-sm border px-2 text-left transition-colors",
                side === "sell"
                  ? "border-sell/60 bg-sell/15"
                  : "border-border bg-panel-2/60 hover:border-sell/40",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sell">Sell</span>
              <span className="num flex items-baseline gap-1 text-xs text-fg">
                {sellTagLabel}
                <span className="text-[9px] font-normal text-faint">{isLimit ? "limit" : "est."}</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={side === "buy"}
              aria-label="Buy"
              title={`Buy at ${buyTagLabel} ${quote} ${tagHint}`}
              onClick={() => {
                setSide("buy");
                setAmountInput("");
                setMessage(null);
              }}
              className={cn(
                "flex h-11 flex-col items-end justify-center rounded-sm border px-2 text-right transition-colors",
                side === "buy"
                  ? "border-info/60 bg-info/15"
                  : "border-border bg-panel-2/60 hover:border-info/40",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-info">Buy</span>
              <span className="num flex items-baseline gap-1 text-xs text-fg">
                {buyTagLabel}
                <span className="text-[9px] font-normal text-faint">{isLimit ? "limit" : "est."}</span>
              </span>
            </button>
          </div>

          <div className="space-y-2 px-2 py-2">
            <div className="flex items-center gap-1" role="group" aria-label="Order type">
              {(["market", "limit", "advanced"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={orderType === type}
                  onClick={() => {
                    setOrderType(type);
                    setMessage(null);
                  }}
                  className={cn(
                    "h-7 px-2 text-[11px] font-medium transition-colors",
                    orderType === type
                      ? "border-b-2 border-fg text-fg"
                      : "border-b-2 border-transparent text-faint hover:text-muted",
                  )}
                >
                  {type === "market" ? "Market" : type === "limit" ? "Limit" : "Advanced"}
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-faint">
                <Wallet className="h-2.5 w-2.5" />
                {hydrated ? `${formatQuote(balance, quote, 4)} cash` : "restoring…"}
              </span>
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              {orderType === "market"
                ? "Fills now at the live price, adjusted by your slippage setting."
                : orderType === "limit"
                  ? "Waits until the market reaches your price. Checked only while this site is open."
                  : "Like a market order, but you choose the fee and priority fee to test different costs."}
            </p>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="order-amount" className="text-[11px] text-muted">
                  {side === "buy" ? `Amount (${quote})` : `Quantity (${token.symbol})`}
                </label>
                <span className="text-[10px] text-faint">
                  {side === "buy"
                    ? `before ${(feeRateBps / 100).toFixed(2)}% fee`
                    : position
                      ? `holding ${formatTokenAmount(position.quantity, 6)}`
                      : "no position"}
                </span>
              </div>
              <div className="relative mt-1">
                <Input
                  id="order-amount"
                  value={amountInput}
                  onChange={(event) => {
                    setAmountInput(event.target.value.replace(/[^\d.]/g, ""));
                    setMessage(null);
                  }}
                  inputMode="decimal"
                  placeholder="0.0"
                  className={cn("h-9 pr-14 text-sm", amount.error && "border-sell/50")}
                  aria-describedby="order-amount-help"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-faint">
                  {side === "buy" ? quote : token.symbol}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(sliderPct)}
                  onChange={(event) => {
                    const pct = Number(event.target.value);
                    if (sliderMax <= 0) return;
                    setAmountInput(formatInputValue((sliderMax * pct) / 100, 9));
                    setMessage(null);
                  }}
                  aria-label={side === "buy" ? "Percent of cash to spend" : "Percent of position to sell"}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-info"
                  style={{ accentColor: side === "buy" ? "#2962ff" : "#f23645" }}
                  disabled={sliderMax <= 0}
                />
                <span className="num w-8 shrink-0 text-right text-[10px] text-muted">{Math.round(sliderPct)}%</span>
              </div>

              <div id="order-amount-help" className="mt-1 flex flex-wrap items-center gap-1">
                {side === "buy"
                  ? QUICK_BUY.map((value) => {
                      const disabled = value + (value * feeRateBps) / 10_000 > balance;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          onClick={() => setAmountInput(value.toString())}
                          className="num h-5 rounded-[2px] border border-border bg-panel-2 px-1.5 text-2xs text-muted transition-colors hover:text-fg disabled:opacity-30"
                        >
                          {value}
                        </button>
                      );
                    })
                  : SELL_FRACTIONS.map((fraction) => (
                      <button
                        key={fraction}
                        type="button"
                        disabled={!position}
                        onClick={() => setSellFraction(fraction)}
                        className="num h-5 rounded-[2px] border border-border bg-panel-2 px-1.5 text-2xs text-muted transition-colors hover:text-fg disabled:opacity-30"
                      >
                        {fraction === 1 ? "100%" : `${fraction * 100}%`}
                      </button>
                    ))}
                <button
                  type="button"
                  onClick={side === "buy" ? maxBuy : () => position && setAmountInput(formatInputValue(position.quantity, 6))}
                  disabled={side === "sell" && !position}
                  className="h-5 rounded-[2px] border border-border-strong bg-panel-3 px-1.5 text-2xs text-fg disabled:opacity-30"
                >
                  MAX
                </button>
                {amount.error ? <span className="text-2xs text-sell">{amount.error}</span> : null}
              </div>
            </div>

            {orderType === "limit" ? (
              <div>
                <label htmlFor="limit-price" className="text-[11px] text-muted">
                  Limit price ({quote} per {token.symbol})
                </label>
                <Input
                  id="limit-price"
                  value={limitPriceInput}
                  onChange={(event) => {
                    setLimitPriceInput(event.target.value.replace(/[^\d.]/g, ""));
                    setMessage(null);
                  }}
                  inputMode="decimal"
                  placeholder={referencePrice ? formatQuotePrice(referencePrice) : "0.0"}
                  className="mt-1 h-8 text-xs"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-faint">
                  Triggers when the paper price is {side === "buy" ? "at or below" : "at or above"} the limit. Fills at
                  the limit price; slippage is not applied to limit fills.
                </p>
              </div>
            ) : null}

            {orderType === "advanced" ? (
              <div className="space-y-2 rounded-sm border border-border bg-panel-2/60 p-2">
                <div className="flex items-center gap-1 text-2xs text-muted">
                  <Info className="h-2.5 w-2.5" /> Simulation controls
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-2xs text-faint">
                    Fee %
                    <Input
                      value={feePercentInput}
                      onChange={(event) => {
                        const next = event.target.value.replace(/[^\d.]/g, "");
                        setFeePercentInput(next);
                        const parsed = Number(next);
                        if (next !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 5) {
                          setFeeRateBps(Math.round(parsed * 100));
                        }
                      }}
                      inputMode="decimal"
                      className="mt-0.5 h-6 text-2xs"
                      aria-label="Simulated execution fee percentage"
                    />
                  </label>
                  <label className="text-2xs text-faint">
                    Priority ({quote})
                    <Input
                      value={priorityFeeInput}
                      onChange={(event) => setPriorityFeeInput(event.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="0"
                      disabled={side === "sell"}
                      className="mt-0.5 h-6 text-2xs"
                      aria-label="Simulated priority fee"
                    />
                  </label>
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  Fee range 0–5%. The priority fee is added to the simulated buy debit and recorded as a fee; it is not a
                  real network payment. Sells only model the execution fee.
                </p>
              </div>
            ) : null}

            {orderType !== "limit" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted">Slippage</span>
                <Segmented
                  size="xs"
                  label="Slippage assumption"
                  value={String(slippageBps)}
                  onChange={(value) => setSlippageBps(Number(value))}
                  options={SLIPPAGE_PRESETS.map((bps) => ({ value: String(bps), label: `${bps / 100}%` }))}
                  className="border-transparent bg-transparent p-0"
                />
              </div>
            ) : null}

            <div className="space-y-0.5 border-y border-border py-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-faint">Trade value</span>
                <span className="num text-muted">
                  {tradeValue != null ? `${formatQuotePrice(tradeValue)} ${quote}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Available</span>
                <span className="num text-muted">
                  {side === "buy"
                    ? `${formatQuote(balance, quote, 4)}`
                    : position
                      ? `${formatTokenAmount(position.quantity, 4)} ${token.symbol}`
                      : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Price</span>
                <span className={cn("num inline-flex items-center gap-1", priceFresh ? "text-muted" : "text-warn")}>
                  <span className={cn("h-1 w-1 rounded-full", priceFresh ? "bg-buy" : "bg-warn")} />
                  {priceFresh ? `fresh · ${displayAge}` : `stale · ${displayAge}`}
                </span>
              </div>
            </div>

            {protectionAvailable ? (
              <div className="rounded-sm border border-border bg-panel-2/40">
                <button
                  type="button"
                  onClick={() => setProtectionOpen((value) => !value)}
                  aria-expanded={protectionOpen}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-[11px]"
                >
                  <span className="inline-flex items-center gap-1 text-muted">
                    <ShieldCheck className="h-3 w-3" /> Exits
                    {hasProtection ? <Badge tone="green">on</Badge> : <span className="text-faint">optional</span>}
                  </span>
                  <span className="text-faint">{protectionOpen ? "−" : "+"}</span>
                </button>
                {protectionOpen ? (
                  <div className="space-y-2 border-t border-border px-2 py-2">
                    <p className="text-[10px] leading-relaxed text-faint">
                      Automatically sells the whole position when the price crosses a level. Levels are set from the
                      estimated fill and can be changed later from the positions table.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-faint" htmlFor="tp-pct">
                        Take profit %
                        <Input
                          id="tp-pct"
                          value={takeProfitPctInput}
                          onChange={(event) => setTakeProfitPctInput(event.target.value.replace(/[^\d.]/g, ""))}
                          inputMode="decimal"
                          placeholder="e.g. 50"
                          className={cn("mt-0.5 h-6 text-2xs", !takeProfitValid && "border-sell/60")}
                        />
                      </label>
                      <label className="text-[10px] text-faint" htmlFor="sl-pct">
                        Stop loss %
                        <Input
                          id="sl-pct"
                          value={stopLossPctInput}
                          onChange={(event) => setStopLossPctInput(event.target.value.replace(/[^\d.]/g, ""))}
                          inputMode="decimal"
                          placeholder="e.g. 20"
                          className={cn("mt-0.5 h-6 text-2xs", !stopLossValid && "border-sell/60")}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[25, 50, 100].map((pct) => (
                        <button
                          key={`tp-${pct}`}
                          type="button"
                          onClick={() => setTakeProfitPctInput(String(pct))}
                          className="h-5 rounded-[2px] border border-buy/30 bg-buy/10 px-1.5 text-2xs text-buy hover:bg-buy/20"
                        >
                          TP +{pct}%
                        </button>
                      ))}
                      {[10, 25, 50].map((pct) => (
                        <button
                          key={`sl-${pct}`}
                          type="button"
                          onClick={() => setStopLossPctInput(String(pct))}
                          className="h-5 rounded-[2px] border border-sell/30 bg-sell/10 px-1.5 text-2xs text-sell hover:bg-sell/20"
                        >
                          SL −{pct}%
                        </button>
                      ))}
                    </div>
                    {protectionPreview && (protectionPreview.takeProfit || protectionPreview.stopLoss) ? (
                      <p className="num text-[10px] text-faint">
                        {protectionPreview.takeProfit ? `TP ≈ ${formatQuotePrice(protectionPreview.takeProfit)} ${quote}` : ""}
                        {protectionPreview.takeProfit && protectionPreview.stopLoss ? " · " : ""}
                        {protectionPreview.stopLoss ? `SL ≈ ${formatQuotePrice(protectionPreview.stopLoss)} ${quote}` : ""}
                        <span> (from the live price, before slippage)</span>
                      </p>
                    ) : null}
                    {!takeProfitValid ? <p className="text-2xs text-sell">Take profit must be a positive percentage.</p> : null}
                    {!stopLossValid ? <p className="text-2xs text-sell">Stop loss must be between 0 and 100%.</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {side === "sell" && position && unrealized ? (
              <div className="rounded-sm border border-border bg-panel-2/50 p-2 text-2xs">
                <div className="flex justify-between text-faint">
                  <span>Position</span>
                  <span className="num text-muted">
                    {formatTokenAmount(position.quantity, 6)} {token.symbol}
                  </span>
                </div>
                <div className="mt-0.5 flex justify-between text-faint">
                  <span>Avg entry</span>
                  <span className="num text-muted">
                    {formatQuotePrice(position.avgEntryPrice)} {quote}
                  </span>
                </div>
                <div className="mt-0.5 flex justify-between text-faint">
                  <span>Unrealized (net)</span>
                  <span className={cn("num", pnlClass(unrealized.netPnl))}>
                    {formatQuote(unrealized.netPnl, quote, 5)} · {formatPercent(unrealized.pct)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="rounded-sm border border-border bg-panel/60 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted">Order preview</span>
                <span className="text-[10px] text-faint">
                  {orderType === "limit" ? "at limit price" : orderType === "advanced" ? "advanced" : "market"}
                </span>
              </div>
              {preview ? (
                <dl className="mt-1.5 space-y-1 text-2xs">
                  <Row
                    label="Reference"
                    value={`${formatQuotePrice(orderType === "limit" ? (preview.limit ?? 0) : preview.plan.referencePrice)} ${quote}`}
                  />
                  <Row
                    label={orderType === "limit" ? "Fill price" : "Est. fill price"}
                    value={`${formatQuotePrice(preview.plan.fillPrice)} ${quote}`}
                  />
                  <Row
                    label={orderType === "limit" ? "Qty at limit" : "Est. quantity"}
                    value={`${formatTokenAmount(preview.plan.quantity, 4)} ${token.symbol}`}
                  />
                  <Row label="Slippage" value={orderType === "limit" ? "not applied" : `${(slippageBps / 100).toFixed(2)}%`} />
                  <Row label="Fee" value={`${formatQuote(preview.plan.fee, quote, 6)} (${(feeRateBps / 100).toFixed(2)}%)`} />
                  {preview.kind === "buy" ? (
                    <>
                      {preview.plan.priorityFee > 0 ? (
                        <Row label="Priority fee" value={formatQuote(preview.plan.priorityFee, quote, 6)} />
                      ) : null}
                      <Row
                        label={orderType === "limit" ? "Total on fill" : "Total debit"}
                        value={formatQuote(preview.plan.totalDebit, quote, 6)}
                        strong
                      />
                      <Row
                        label={orderType === "limit" ? "Balance on fill" : "Balance after"}
                        value={formatQuote(Math.max(0, balance - preview.plan.totalDebit), quote, 6)}
                      />
                    </>
                  ) : (
                    <>
                      <Row label="Gross proceeds" value={formatQuote(preview.plan.gross, quote, 6)} />
                      <Row
                        label={orderType === "limit" ? "Net on fill" : "Net proceeds"}
                        value={formatQuote(preview.plan.netProceeds, quote, 6)}
                        strong
                      />
                      <Row label="Realized PnL" value={formatQuote(preview.plan.realizedPnl, quote, 6)} />
                      <Row
                        label={orderType === "limit" ? "Balance on fill" : "Balance after"}
                        value={formatQuote(balance + preview.plan.netProceeds, quote, 6)}
                      />
                    </>
                  )}
                </dl>
              ) : (
                <p className="mt-1.5 text-2xs leading-relaxed text-faint">
                  Enter {amountInput.trim() === "" ? "an amount" : "a valid amount"}
                  {side === "sell" ? " and have an open position" : ""}
                  {orderType === "limit" ? " and a limit price" : ""} to preview the simulated fill.
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1 border-t border-border pt-1.5 text-[10px] text-faint">
                <RefreshCw className="h-2.5 w-2.5" />
                <button type="button" onClick={onRefreshPrice} className="hover:text-fg">
                  refresh price
                </button>
                <span className="ml-auto">
                  {metricsAvailable ? `5m net ${formatMoneyShort(windowStats.net)}` : "trade window unavailable"}
                </span>
              </div>
            </div>

            {validation ? (
              <p className="flex items-start gap-1 rounded-sm border border-warn/20 bg-warn/5 px-2 py-1 text-2xs text-warn" role="status">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {validation}
              </p>
            ) : null}

            {message ? (
              <div
                role="status"
                className={cn(
                  "rounded-sm border px-2 py-1.5 text-2xs",
                  message.kind === "success" && "border-buy/30 bg-buy/5 text-buy",
                  message.kind === "error" && "border-sell/30 bg-sell/5 text-sell",
                  message.kind === "info" && "border-border-strong bg-panel-2 text-fg",
                )}
              >
                <div className="flex items-center gap-1 font-medium">
                  {message.kind === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {message.text}
                </div>
                {message.detail ? <p className="mt-0.5 leading-relaxed text-muted">{message.detail}</p> : null}
              </div>
            ) : null}

            <button
              type="button"
              disabled={Boolean(validation) || submitting || !hydrated || !takeProfitValid || !stopLossValid}
              onClick={() => void execute()}
              aria-busy={submitting}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
                side === "buy" ? "bg-info" : "bg-sell",
              )}
            >
              {submitting ? <Spinner className="text-white" /> : null}
              {buttonLabel}
            </button>
            <p className="text-center text-[10px] text-faint">
              Simulated order · no wallet · no signature · starts at 50 {quote}
            </p>
          </div>
        </>
      )}

      <CalloutComposer token={token} />
    </aside>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className={cn("num text-right", strong ? "text-fg" : "text-muted")}>{value}</dd>
    </div>
  );
}

function formatMoneyShort(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs === 0) return "$0";
  return `$${value.toPrecision(3)}`;
}

interface DepthLevel {
  price: number;
  valueUsd: number;
  /** Portion of `valueUsd` that came from buys; the rest came from sells. */
  buyUsd: number;
  sellUsd: number;
  count: number;
}

/**
 * Buckets recent public trades by distance from the live price for the DOM tab.
 *
 * Trades arrive priced in USD while the reference price is in the account's
 * quote currency, so both are converted to quote before bucketing — comparing
 * them directly put every level thousands of buckets away and emptied the
 * ladder on every SOL- or ETH-quoted pool.
 */
function buildDepth(
  trades: MarketTrade[],
  reference: number | null,
  quoteUsd: number | null,
): { levels: DepthLevel[]; total: number; window: number } {
  if (!reference || !Number.isFinite(reference) || reference <= 0) return { levels: [], total: 0, window: 0 };
  if (!quoteUsd || !Number.isFinite(quoteUsd) || quoteUsd <= 0) return { levels: [], total: 0, window: 0 };
  const list = trades.filter((trade) => Number.isFinite(trade.priceUsd) && trade.priceUsd > 0).slice(0, 150);
  if (list.length === 0) return { levels: [], total: 0, window: 0 };
  const step = 0.004;
  const buckets = new Map<number, DepthLevel>();
  for (const trade of list) {
    const priceQuote = trade.priceUsd / quoteUsd;
    const offset = Math.round(Math.log(priceQuote / reference) / Math.log(1 + step));
    if (Math.abs(offset) > 8) continue;
    const level =
      buckets.get(offset) ?? {
        price: reference * (1 + step) ** offset,
        valueUsd: 0,
        buyUsd: 0,
        sellUsd: 0,
        count: 0,
      };
    level.valueUsd += trade.valueUsd;
    if (trade.side === "buy") level.buyUsd += trade.valueUsd;
    else level.sellUsd += trade.valueUsd;
    level.count += 1;
    buckets.set(offset, level);
  }
  const levels = [...buckets.entries()].sort((a, b) => b[0] - a[0]).map(([, level]) => level);
  const total = levels.reduce((sum, level) => sum + level.valueUsd, 0);
  return { levels, total, window: list.length };
}
