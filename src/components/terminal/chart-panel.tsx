"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  PriceScaleMode,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type HistogramData,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import {
  Crosshair,
  Eraser,
  MousePointer2,
  Pencil,
  RefreshCw,
  Ruler,
  Settings2,
  SlidersHorizontal,
  SquareDashed,
  Minus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import {
  CHART_TIMEFRAMES,
  type ChartTimeframe,
  type DisplayCurrency,
  type NetworkId,
} from "@/lib/constants";
import type { Candle, QuotePrices } from "@/lib/market-data/types";
import type { Trade } from "@/lib/trading/types";
import { formatCompact, formatNumber, formatPrice, formatUsdCompact, priceDecimalsFor, expandExponential } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type Tool = "cursor" | "hline" | "measure";

function chartPrice(value: number, currency: DisplayCurrency): string {
  if (currency === "USD") return formatPrice(value);
  return `${expandExponential(Number(value.toFixed(Math.min(18, priceDecimalsFor(value))))) } ${currency}`;
}

function formatChartAxis(value: number, currency: DisplayCurrency): string {
  if (currency === "USD") {
    if (Math.abs(value) >= 1000) return `$${formatCompact(value)}`;
    return `$${formatNumber(value, value >= 1 ? 2 : 6)}`;
  }
  return `${formatCompact(value)} ${currency}`;
}

export function ChartPanel({
  symbol,
  network,
  pool,
  candles,
  timeframe,
  onTimeframeChange,
  loading,
  fetching,
  error,
  onRetry,
  quotePrices,
  currency,
  paperTrades,
  lastUpdated,
  stale,
}: {
  symbol: string;
  network: NetworkId;
  pool: string;
  candles: Candle[];
  timeframe: ChartTimeframe;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  onRetry: () => void;
  quotePrices: QuotePrices;
  currency: DisplayCurrency;
  paperTrades: Trade[];
  lastUpdated: number | null;
  stale: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const measureLinesRef = useRef<IPriceLine[]>([]);
  const lastFitRef = useRef<string>("");

  const [tool, setTool] = useState<Tool>("cursor");
  const [crosshairVisible, setCrosshairVisible] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [hover, setHover] = useState<{ open: number; high: number; low: number; close: number; volume: number } | null>(null);
  const [measure, setMeasure] = useState<{ start: number; end: number | null; startTime: Time | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const quoteUsd = currency !== "USD" ? quotePrices[currency]?.usd ?? null : 1;
  const effectiveCurrency: DisplayCurrency = currency !== "USD" && !quoteUsd ? "USD" : currency;
  const factor = effectiveCurrency === "USD" ? 1 : 1 / (quoteUsd as number);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const clickHandlerRef = useRef<(param: MouseEventParams<Time>) => void>(() => {});
  const crosshairHandlerRef = useRef<(param: MouseEventParams<Time>) => void>(() => {});

  const removeMeasureLines = useCallback(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of measureLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // Already detached.
      }
    }
    measureLinesRef.current = [];
  }, []);

  const clearDrawings = useCallback(() => {
    const series = candleSeriesRef.current;
    if (series) {
      for (const line of priceLinesRef.current) {
        try {
          series.removePriceLine(line);
        } catch {
          // Already detached.
        }
      }
    }
    priceLinesRef.current = [];
    removeMeasureLines();
    setMeasure(null);
    setTool("cursor");
  }, [removeMeasureLines]);

  // Create the chart once and clean it up on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e17" },
        textColor: "#8993a7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#141a28" },
        horzLines: { color: "#141a28" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#394363", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e2538" },
        horzLine: { color: "#394363", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e2538" },
      },
      rightPriceScale: { borderColor: "#1e2538", scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: {
        borderColor: "#1e2538",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 6,
      },
      localization: {
        priceFormatter: (price: number) => formatChartAxis(price, effectiveCurrency),
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00e676",
      downColor: "#ff1744",
      borderVisible: false,
      wickUpColor: "#00e676",
      wickDownColor: "#ff1744",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    const onClick = (param: MouseEventParams<Time>) => clickHandlerRef.current(param);
    const onCrosshair = (param: MouseEventParams<Time>) => crosshairHandlerRef.current(param);
    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onCrosshair);
      markersRef.current?.detach();
      priceLinesRef.current = [];
      measureLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
    };
    // The chart instance is created once; option changes are applied in separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: { priceFormatter: (price: number) => formatChartAxis(price, effectiveCurrency) },
    });
    clearDrawings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCurrency]);

  // Apply visual settings.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      crosshair: { mode: crosshairVisible ? CrosshairMode.Normal : CrosshairMode.Hidden },
      grid: {
        vertLines: { color: showGrid ? "#141a28" : "transparent" },
        horzLines: { color: showGrid ? "#141a28" : "transparent" },
      },
    });
    chart.priceScale("right").applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [crosshairVisible, showGrid, logScale, showVolume]);

  // Chart data (converted to the selected display currency).
  useEffect(() => {
    const series = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !volume || !chart) return;

    const data: CandlestickData<Time>[] = candles.map((candle) => ({
      time: candle.time as Time,
      open: candle.open * factor,
      high: candle.high * factor,
      low: candle.low * factor,
      close: candle.close * factor,
    }));
    series.setData(data);
    volume.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(0, 230, 118, 0.22)" : "rgba(255, 23, 68, 0.22)",
      })),
    );

    const last = data[data.length - 1];
    if (last) {
      const precision = priceDecimalsFor(last.close);
      series.applyOptions({
        priceFormat: { type: "price", precision, minMove: Number(`1e-${precision}`) },
      });
    }

    const fitKey = `${symbol}:${network}:${pool}:${timeframe}:${effectiveCurrency}`;
    if (fitKey !== lastFitRef.current && data.length > 0) {
      chart.timeScale().fitContent();
      lastFitRef.current = fitKey;
    }
  }, [candles, factor, timeframe, symbol, network, pool, effectiveCurrency]);

  // Simulated execution markers (local paper trades only, never external wallets).
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    if (candles.length === 0) {
      markers.setMarkers([]);
      return;
    }
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    const local: SeriesMarker<Time>[] = paperTrades
      .filter((trade) => trade.token.network === network)
      .map((trade) => ({ trade, time: Math.floor(trade.at / 1000) }))
      .filter(({ time }) => time >= first && time <= last)
      .slice(0, 60)
      .map(({ trade, time }): SeriesMarker<Time> => ({
        time: time as Time,
        position: trade.side === "buy" ? "belowBar" : "aboveBar",
        color: trade.side === "buy" ? "#00e676" : "#ff1744",
        shape: trade.side === "buy" ? "arrowUp" : "arrowDown",
        text: trade.side === "buy" ? "B" : "S",
        size: 1,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    markers.setMarkers(local);
  }, [paperTrades, candles, network]);

  // Crosshair legend.
  crosshairHandlerRef.current = (param) => {
    const series = candleSeriesRef.current;
    if (!param.time || !param.point || !series) {
      setHover(null);
      return;
    }
    const candle = param.seriesData.get(series) as CandlestickData<Time> | undefined;
    if (!candle) {
      setHover(null);
      return;
    }
    const volumeSeries = volumeSeriesRef.current;
    const volume = volumeSeries
      ? (param.seriesData.get(volumeSeries) as HistogramData<Time> | undefined)
      : undefined;
    setHover({
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: volume?.value ?? 0,
    });
  };

  // Click tools: horizontal line + measure.
  clickHandlerRef.current = (param) => {
    const series = candleSeriesRef.current;
    if (!param.point || !series) return;
    const price = series.coordinateToPrice(param.point.y);
    if (price == null || !Number.isFinite(price)) return;

    if (toolRef.current === "hline") {
      const line = series.createPriceLine({
        price,
        color: "#596bff",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "H",
      });
      priceLinesRef.current.push(line);
      setTool("cursor");
      return;
    }

    if (toolRef.current === "measure") {
      if (!measure || measure.end != null) {
        removeMeasureLines();
        const line = series.createPriceLine({
          price,
          color: "#596bff",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "M1",
        });
        measureLinesRef.current.push(line);
        setMeasure({ start: price, end: null, startTime: param.time ?? null });
      } else {
        const line = series.createPriceLine({
          price,
          color: "#8993a7",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "M2",
        });
        measureLinesRef.current.push(line);
        setMeasure({ ...measure, end: price });
        setTool("cursor");
      }
    }
  };

  const lastCandle = candles[candles.length - 1];
  const legend = hover ?? (lastCandle
    ? {
        open: lastCandle.open * factor,
        high: lastCandle.high * factor,
        low: lastCandle.low * factor,
        close: lastCandle.close * factor,
        volume: lastCandle.volume,
      }
    : null);

  const measurePct =
    measure?.end != null && measure.start !== 0 ? ((measure.end - measure.start) / measure.start) * 100 : null;

  const toolbarButtons = (
    <>
      <ToolButton label="Pointer (pan & crosshair)" active={tool === "cursor"} onClick={() => setTool("cursor")} icon={MousePointer2} />
      <ToolButton
        label={crosshairVisible ? "Hide crosshair" : "Show crosshair"}
        active={false}
        onClick={() => setCrosshairVisible((visible) => !visible)}
        icon={Crosshair}
      />
      <div className="my-1 h-px w-5 bg-border" />
      <ToolButton
        label={tool === "hline" ? "Click the chart to place a horizontal line" : "Horizontal line"}
        active={tool === "hline"}
        onClick={() => setTool(tool === "hline" ? "cursor" : "hline")}
        icon={Minus}
      />
      <ToolButton
        label={tool === "measure" ? "Click two points to measure" : "Measure move"}
        active={tool === "measure"}
        onClick={() => setTool(tool === "measure" ? "cursor" : "measure")}
        icon={Ruler}
      />
      <ToolButton label="Drawing tools are not implemented in this build" disabled icon={Pencil} onClick={() => {}} />
      <ToolButton label="Clear all drawings and measurements" onClick={clearDrawings} icon={Eraser} />
    </>
  );

  return (
    <section className="flex min-h-[320px] flex-col border-b border-border bg-bg" aria-label={`${symbol} price chart`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Segmented
          label="Chart timeframe"
          value={timeframe}
          onChange={(value) => onTimeframeChange(value as ChartTimeframe)}
          options={CHART_TIMEFRAMES.map((item) => ({ value: item.value, label: item.label }))}
        />
        <div className="hidden items-center gap-2 border-l border-border pl-2 text-2xs sm:flex">
          <span className="text-muted">Candles</span>
          <span className="text-faint">{effectiveCurrency}</span>
          {legend ? (
            <span className="num flex flex-wrap items-center gap-1.5 text-2xs text-faint">
              <span>O <span className="text-muted">{chartPrice(legend.open, effectiveCurrency)}</span></span>
              <span>H <span className="text-buy">{chartPrice(legend.high, effectiveCurrency)}</span></span>
              <span>L <span className="text-sell">{chartPrice(legend.low, effectiveCurrency)}</span></span>
              <span>C <span className="text-fg">{chartPrice(legend.close, effectiveCurrency)}</span></span>
              <span>V <span className="text-muted">{formatUsdCompact(legend.volume)}</span></span>
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {fetching && !loading ? <Spinner className="text-faint" /> : null}
          <span className={cn("hidden text-2xs sm:inline", stale ? "text-warn" : "text-faint")}>
            {error ? "chart error" : stale ? "stale data" : lastUpdated ? "GeckoTerminal OHLCV" : "loading"}
          </span>
          <div className="flex items-center gap-0.5 sm:hidden">
            <ToolButton label="Horizontal line" active={tool === "hline"} onClick={() => setTool(tool === "hline" ? "cursor" : "hline")} icon={Minus} />
            <ToolButton label="Measure" active={tool === "measure"} onClick={() => setTool(tool === "measure" ? "cursor" : "measure")} icon={Ruler} />
          </div>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Chart settings"
                className="rounded-[2px] p-1 text-faint transition-colors hover:bg-panel-2 hover:text-fg"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Chart settings</p>
              <div className="mt-2 space-y-2">
                <SettingRow label="Grid lines" checked={showGrid} onChange={setShowGrid} />
                <SettingRow label="Volume histogram" checked={showVolume} onChange={setShowVolume} />
                <SettingRow label="Logarithmic price scale" checked={logScale} onChange={setLogScale} />
                <SettingRow label="Crosshair" checked={crosshairVisible} onChange={setCrosshairVisible} />
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <Button size="xs" variant="outline" onClick={() => chartRef.current?.timeScale().fitContent()}>
                  <RefreshCw className="h-2.5 w-2.5" /> Reset zoom
                </Button>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-faint">
                Drawings live in this chart session only. Volume is always shown in USD.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-9 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel/40 py-1.5 sm:flex">
          {toolbarButtons}
        </div>
        <div className="relative min-h-[260px] flex-1">
          <div ref={containerRef} className="absolute inset-0" data-testid="price-chart" />

          {legend ? (
            <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-[2px] border border-border bg-bg/80 px-1.5 py-0.5 text-2xs text-faint backdrop-blur-sm">
              <span className="text-muted">{symbol}</span> · {timeframe} · {effectiveCurrency}
              {stale ? <span className="ml-1 text-warn">stale</span> : null}
            </div>
          ) : null}

          {measure && measure.end != null && measurePct != null ? (
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2 rounded-sm border border-accent/40 bg-[#0d121d]/95 px-2 py-1 text-2xs shadow-lg">
              <SlidersHorizontal className="h-3 w-3 text-accent" />
              <span className="num text-fg">
                {measure.end >= measure.start ? "+" : "−"}
                {Math.abs(measurePct).toFixed(2)}%
              </span>
              <span className="num text-muted">
                Δ {chartPrice(Math.abs(measure.end - measure.start), effectiveCurrency)}
              </span>
              <button
                type="button"
                aria-label="Clear measurement"
                onClick={() => {
                  removeMeasureLines();
                  setMeasure(null);
                }}
                className="text-faint hover:text-fg"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          {measure && measure.end == null ? (
            <div className="absolute left-2 top-9 z-10 rounded-sm border border-accent/30 bg-[#0d121d]/90 px-1.5 py-0.5 text-2xs text-muted">
              Click a second point to measure
            </div>
          ) : null}

          {loading && candles.length === 0 ? (
            <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-bg p-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="flex-1 w-full" />
              <div className="flex items-center gap-2 text-2xs text-faint">
                <Spinner /> Loading OHLCV candles…
              </div>
            </div>
          ) : null}

          {!loading && error && candles.length === 0 ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-bg/95 px-4 text-center">
              <SquareDashed className="h-4 w-4 text-faint" />
              <p className="text-xs font-medium text-fg">Chart data unavailable</p>
              <p className="max-w-md text-2xs leading-relaxed text-muted">{error}</p>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="h-3 w-3" /> Retry chart
              </Button>
            </div>
          ) : null}

          {!loading && !error && candles.length === 0 ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-bg/95 px-4 text-center">
              <SquareDashed className="h-4 w-4 text-faint" />
              <p className="text-xs font-medium text-fg">No OHLCV data for this pool</p>
              <p className="text-2xs text-muted">The provider has no candles for this timeframe. History is not fabricated.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-1 text-2xs text-faint">
        <span>
          OHLCV: GeckoTerminal · no synthetic candles · polled every 20s ·{" "}
          {lastUpdated ? `updated ${new Date(lastUpdated).toLocaleTimeString("en-GB", { hour12: false })}` : "pending"}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-buy" /> buy fill
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sell" /> sell fill
          </span>
          <span className="hidden sm:inline">· markers are your simulated executions</span>
        </span>
      </div>
    </section>
  );
}

function ToolButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof MousePointer2;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label}>
      <span tabIndex={disabled ? 0 : undefined} className={cn("inline-flex", disabled && "cursor-not-allowed")}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          aria-disabled={disabled}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[2px] transition-colors",
            active ? "bg-accent/15 text-[#9aa6ff]" : "text-faint hover:bg-panel-2 hover:text-fg",
            disabled && "pointer-events-none opacity-35",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </span>
    </Tooltip>
  );
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-2xs text-muted">{label}</span>
      <Switch label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
