"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  paperPositions,
  hasTradeWindow,
  trades,
  onRefreshPrice,
}: {
  token: TokenRef;
  market: MarketToken;
  quotePrices: QuotePrices;
  priceLastUpdated: number | null;
  paperPositions: ReturnType<typeof usePaperStore.getState>["positions"];
  hasTradeWindow: boolean;
  trades: MarketTrade[];
  onRefreshPrice: () => void;
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
  const referencePrice =
    market.priceUsd != null && quoteUsd ? market.priceUsd / quoteUsd : null;
  const priceAge = priceLastUpdated ? now - priceLastUpdated : null;
  const priceFresh = priceAge != null && priceAge < 60_000;
  const displayAge = priceLastUpdated ? formatRelativeTime(priceLastUpdated, now) : "unknown";

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amountInput, setAmountInput] = useState("");
  const [limitPriceInput, setLimitPriceInput] = useState("");
  const [priorityFeeInput, setPriorityFeeInput] = useState("");
  const [feePercentInput, setFeePercentInput] = useState((feeRateBps / 100).toString());
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string; detail?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setFeePercentInput((feeRateBps / 100).toString());
  }, [feeRateBps]);

  const amount = parseAmountInput(amountInput, { maxDecimals: side === "buy" ? 9 : 9 });
  const limitPrice = parseAmountInput(limitPriceInput, { maxDecimals: 12 });
  const priorityFee = priorityFeeInput.trim() === "" ? 0 : Number(priorityFeeInput);
  const priorityFeeValid = Number.isFinite(priorityFee) && priorityFee >= 0;

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
    if (!quoteUsd || !priceLastUpdated) return null;
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

    if (!market.priceUsd) return null;
    if (side === "buy") {
      const result = computeBuyPlan({
        token,
        quote,
        amountQuote: amount.value,
        priceUsd: market.priceUsd,
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
      priceUsd: market.priceUsd,
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
    market.priceUsd,
    position,
    priorityFee,
    priorityFeeValid,
    priceLastUpdated,
  ]);

  const buyNotional = side === "buy" && amount.ok && amount.value != null ? amount.value : 0;
  const buyFee = (buyNotional * feeRateBps) / 10_000;
  const buyTotal =
    buyNotional + buyFee + (orderType === "advanced" && priorityFeeValid ? priorityFee : 0);

  const validation = (() => {
    if (!hydrated) return "Restoring paper account…";
    if (!quoteUsd) return "Quote reference price unavailable. Trading is paused.";
    if (!market.priceUsd) return "No usable market price for this pool.";
    if (!priceLastUpdated) return "Waiting for a price update.";
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
  };

  const execute = async () => {
    if (submittingRef.current || validation) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 180));
    try {
      const store = usePaperStore.getState();
      if (!market.priceUsd || !quoteUsd) {
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
          priceUsd: market.priceUsd,
          quoteUsd,
          priorityFeeQuote: orderType === "advanced" ? priorityFee : 0,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error.message });
          toast({ title: "Simulated buy rejected", description: result.error.message, variant: "error" });
          return;
        }
        const plan = result.value.plan as BuyPlan;
        setMessage({
          kind: "success",
          text: `Filled: bought ${formatTokenAmount(result.value.trade.quantity, 4)} ${token.symbol}`,
          detail: `${formatQuote(plan.notional, quote)} notional · fee ${formatQuote(plan.fee, quote, 5)} · total ${formatQuote(plan.totalDebit, quote, 5)} · avg fill ${formatQuotePrice(plan.fillPrice)} ${quote} · simulated ${new Date(plan.at).toLocaleTimeString("en-GB", { hour12: false })}`,
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
          priceUsd: market.priceUsd,
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

  return (
    <aside className="flex min-h-0 flex-col border-border bg-panel/30 xl:border-l" aria-label="Paper order execution">
      <div className="border-b border-border px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Trade · paper</p>
          <Tooltip content="Orders are simulated locally. No wallet is connected and no transaction is signed or broadcast.">
            <Badge tone="warn" className="gap-1">
              <Lock className="h-2.5 w-2.5" /> simulated
            </Badge>
          </Tooltip>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={side === "buy"}
            onClick={() => {
              setSide("buy");
              setAmountInput("");
              setMessage(null);
            }}
            className={cn(
              "h-8 rounded-sm border text-xs font-semibold transition-colors",
              side === "buy"
                ? "border-buy/40 bg-buy/15 text-buy"
                : "border-border bg-panel-2 text-muted hover:text-fg",
            )}
          >
            Buy
          </button>
          <button
            type="button"
            aria-pressed={side === "sell"}
            onClick={() => {
              setSide("sell");
              setAmountInput("");
              setMessage(null);
            }}
            className={cn(
              "h-8 rounded-sm border text-xs font-semibold transition-colors",
              side === "sell"
                ? "border-sell/40 bg-sell/15 text-sell"
                : "border-border bg-panel-2 text-muted hover:text-fg",
            )}
          >
            Sell
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Segmented
            size="xs"
            label="Order type"
            value={orderType}
            onChange={(value) => {
              setOrderType(value as OrderType);
              setMessage(null);
            }}
            options={[
              { value: "market", label: "Market" },
              { value: "limit", label: "Limit" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
          <span className="ml-auto inline-flex items-center gap-1 text-2xs text-faint">
            <Wallet className="h-2.5 w-2.5" />
            {hydrated ? `${formatQuote(balance, quote)} available` : "restoring…"}
          </span>
        </div>
      </div>

      <div className="border-b border-border px-2.5 py-1.5">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-faint">5m volume</span>
          <span className="num text-fg">{market.volumeUsd.m5 == null ? "—" : formatMoneyShort(market.volumeUsd.m5)}</span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <Stat
            label="Buy vol"
            value={metricsAvailable ? formatMoneyShort(windowStats.buy) : "—"}
            tone="buy"
            hint={metricsAvailable ? "Derived from fetched trades in the last 5 minutes." : "Trade window unavailable from the provider."}
          />
          <Stat
            label="Sell vol"
            value={metricsAvailable ? formatMoneyShort(windowStats.sell) : "—"}
            tone="sell"
            hint={metricsAvailable ? "Derived from fetched trades in the last 5 minutes." : "Trade window unavailable from the provider."}
          />
          <Stat
            label="Net"
            value={metricsAvailable ? formatMoneyShort(windowStats.net) : "—"}
            tone={windowStats.net != null && windowStats.net < 0 ? "sell" : "buy"}
            hint={metricsAvailable ? "Buy volume − sell volume in the fetched 5-minute trade window." : "Trade window unavailable from the provider."}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-2xs text-faint">
          <span>
            {market.txns.m5 ? `${market.txns.m5.buys} buys · ${market.txns.m5.sells} sells (provider)` : "5m transaction counts unavailable"}
          </span>
          <button type="button" onClick={onRefreshPrice} className="inline-flex items-center gap-1 hover:text-fg">
            <RefreshCw className="h-2.5 w-2.5" /> {priceAge != null ? displayAge : "sync"}
          </button>
        </div>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="order-amount" className="text-2xs text-muted">
              {side === "buy" ? `Amount (${quote})` : `Quantity (${token.symbol})`}
            </label>
            <span className="text-2xs text-faint">
              {side === "buy"
                ? `notional before ${(feeRateBps / 100).toFixed(2)}% fee`
                : position
                  ? `position ${formatTokenAmount(position.quantity, 6)} ${token.symbol}`
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
              placeholder={side === "buy" ? "0.0" : "0.0"}
              className={cn("h-9 pr-14 text-sm", amount.error && "border-sell/50")}
              aria-describedby="order-amount-help"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-faint">
              {side === "buy" ? quote : token.symbol}
            </span>
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
              className="h-5 rounded-[2px] border border-accent/30 bg-accent/10 px-1.5 text-2xs text-[#9aa6ff] disabled:opacity-30"
            >
              MAX
            </button>
            {amount.error ? <span className="text-2xs text-sell">{amount.error}</span> : null}
          </div>
        </div>

        {orderType === "limit" ? (
          <div>
            <label htmlFor="limit-price" className="text-2xs text-muted">
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
            <p className="mt-1 text-2xs text-faint">
              Triggers when the paper price is {side === "buy" ? "at or below" : "at or above"} the limit. Fills at the
              limit price; slippage is not applied to limit fills.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs text-muted">Slippage</span>
          <Segmented
            size="xs"
            label="Slippage assumption"
            value={String(slippageBps)}
            onChange={(value) => setSlippageBps(Number(value))}
            options={SLIPPAGE_PRESETS.map((bps) => ({ value: String(bps), label: `${bps / 100}%` }))}
          />
        </div>

        {orderType === "advanced" ? (
          <div className="space-y-2 rounded-sm border border-border bg-panel-2/60 p-2">
            <div className="flex items-center gap-1 text-2xs text-muted">
              <Info className="h-2.5 w-2.5" /> Advanced simulation controls
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-2xs text-faint">
                Execution fee %
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
                Priority fee ({quote})
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
            <p className="text-2xs leading-relaxed text-faint">
              Fee range 0–5%. Priority fee is added to the simulated buy debit and recorded as a fee; it is not a real
              network payment. Sells only model the execution fee.
            </p>
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

        <div className="rounded-sm border border-border bg-[#0d121d] p-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium text-muted">Order preview</span>
            <span className="text-2xs text-faint">
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
          <div className="mt-1.5 flex items-center gap-1 border-t border-border pt-1.5 text-2xs text-faint">
            <span className={cn("h-1 w-1 rounded-full", priceFresh ? "bg-buy" : "bg-warn")} />
            Price {priceFresh ? `fresh · ${displayAge}` : `stale · ${displayAge}`} · {formatQuote(balance, quote)} available
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
              message.kind === "info" && "border-accent/30 bg-accent/5 text-[#9aa6ff]",
            )}
          >
            <div className="flex items-center gap-1 font-medium">
              {message.kind === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {message.text}
            </div>
            {message.detail ? <p className="mt-0.5 leading-relaxed text-muted">{message.detail}</p> : null}
          </div>
        ) : null}

        <Button
          variant={side === "buy" ? "buy" : "sell"}
          size="lg"
          className="w-full text-xs font-semibold"
          disabled={Boolean(validation) || submitting || !hydrated}
          onClick={() => void execute()}
          aria-busy={submitting}
        >
          {submitting ? <Spinner /> : null}
          {buttonLabel}
        </Button>
        <p className="text-center text-2xs text-faint">
          Simulated order · no wallet · no signature · 50 {quote} starting balance
        </p>
      </div>

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

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "buy" | "sell";
  hint: string;
}) {
  return (
    <Tooltip content={hint}>
      <div className="cursor-help">
        <p className="text-2xs text-faint">{label}</p>
        <p className={cn("num text-xs", value === "—" ? "text-faint" : tone === "buy" ? "text-buy" : "text-sell")}>{value}</p>
      </div>
    </Tooltip>
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
