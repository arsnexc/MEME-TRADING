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
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Minus,
  MousePointer2,
  Percent,
  RefreshCw,
  Ruler,
  Settings2,
  Shapes,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  TrendingUp,
  Type,
  X,
  ZoomIn,
  ZoomOut,
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
import { TIMEFRAME_SECONDS, mergeLiveTick } from "@/lib/market-data/live-candle";
import type { Candle, QuotePrices } from "@/lib/market-data/types";
import type { Trade } from "@/lib/trading/types";
import { formatCompact, formatNumber, formatPrice, priceDecimalsFor, expandExponential } from "@/lib/formatting";
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
  livePrice,
  livePriceAt,
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
  /** Latest provider price in USD. Drives the forming candle between polls. */
  livePrice: number | null;
  livePriceAt: number | null;
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
        background: { type: ColorType.Solid, color: "#0d0d0d" },
        textColor: "#9b9b9b",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3a3a3a", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#242424" },
        horzLine: { color: "#3a3a3a", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#242424" },
      },
      rightPriceScale: { borderColor: "#262626", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: {
        borderColor: "#262626",
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
      upColor: "#0ecb81",
      downColor: "#f23645",
      borderVisible: false,
      wickUpColor: "#0ecb81",
      wickDownColor: "#f23645",
      // Dashed current-price line, like the reference terminal.
      priceLineVisible: true,
      priceLineColor: "#0ecb81",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
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
        vertLines: { color: showGrid ? "#1a1a1a" : "transparent" },
        horzLines: { color: showGrid ? "#1a1a1a" : "transparent" },
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
        color: candle.close >= candle.open ? "rgba(14, 203, 129, 0.20)" : "rgba(242, 54, 69, 0.20)",
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

  // Live tick: fold the newest provider price into the forming candle.
  //
  // The historical bars above come from GeckoTerminal. This effect only ever
  // touches the bar that is still open (or opens the next bar with the previous
  // close). It never invents history, and the next poll replaces it with the
  // provider's own candle.
  useEffect(() => {
    const series = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!series || !volume) return;
    if (livePrice == null || !Number.isFinite(livePrice) || livePrice <= 0) return;
    // A price older than two minutes is not a live tick any more.
    if (livePriceAt != null && Date.now() - livePriceAt > 120_000) return;
    const last = candles[candles.length - 1];
    if (!last) return;

    const bar = mergeLiveTick({
      last,
      price: livePrice * factor,
      tickMs: livePriceAt ?? Date.now(),
      intervalSeconds: TIMEFRAME_SECONDS[timeframe],
    });
    if (!bar) return;

    series.update({
      time: bar.time as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
    if (bar.openedNewBar) {
      volume.update({
        time: bar.time as Time,
        value: 0,
        color: bar.close >= bar.open ? "rgba(14, 203, 129, 0.20)" : "rgba(242, 54, 69, 0.20)",
      });
    }
  }, [livePrice, livePriceAt, candles, factor, timeframe]);

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
        color: trade.side === "buy" ? "#0ecb81" : "#f23645",
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
        color: "#d4d4d4",
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
          color: "#d4d4d4",
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
          color: "#a3a3a3",
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

  const timeframeStrip = (
    <Segmented
      label="Chart timeframe"
      value={timeframe}
      onChange={(value) => onTimeframeChange(value as ChartTimeframe)}
      options={CHART_TIMEFRAMES.map((item) => ({ value: item.value, label: item.label }))}
      className="border-transparent bg-transparent p-0"
    />
  );

  const railButtons = (
    <>
      <RailButton label="Pointer (pan and crosshair)" active={tool === "cursor"} onClick={() => setTool("cursor")} icon={MousePointer2} />
      <RailButton
        label={crosshairVisible ? "Hide crosshair" : "Show crosshair"}
        onClick={() => setCrosshairVisible((visible) => !visible)}
        icon={crosshairVisible ? Crosshair : EyeOff}
      />
      <RailButton label="Trend line — not in this build" disabled icon={TrendingUp} onClick={() => {}} />
      <RailButton label="Fibonacci retracement — not in this build" disabled icon={Percent} onClick={() => {}} />
      <RailButton label="Text tool — not in this build" disabled icon={Type} onClick={() => {}} />
      <RailButton label="Patterns — not in this build" disabled icon={Shapes} onClick={() => {}} />
      <div className="my-0.5 h-px w-5 bg-border" />
      <RailButton
        label={tool === "hline" ? "Click the chart to place a horizontal line" : "Horizontal line"}
        active={tool === "hline"}
        onClick={() => setTool(tool === "hline" ? "cursor" : "hline")}
        icon={Minus}
      />
      <RailButton
        label={tool === "measure" ? "Click two points to measure" : "Measure move"}
        active={tool === "measure"}
        onClick={() => setTool(tool === "measure" ? "cursor" : "measure")}
        icon={Ruler}
      />
      <div className="my-0.5 h-px w-5 bg-border" />
      <RailButton
        label="Zoom in"
        onClick={() => {
          const scale = chartRef.current?.timeScale();
          if (!scale) return;
          const options = scale.options();
          scale.applyOptions({ barSpacing: Math.min((options.barSpacing ?? 6) * 1.35, 60) });
        }}
        icon={ZoomIn}
      />
      <RailButton
        label="Zoom out"
        onClick={() => {
          const scale = chartRef.current?.timeScale();
          if (!scale) return;
          const options = scale.options();
          scale.applyOptions({ barSpacing: Math.max((options.barSpacing ?? 6) / 1.35, 1) });
        }}
        icon={ZoomOut}
      />
      <RailButton label="Magnet — not in this build" disabled icon={Magnet} onClick={() => {}} />
      <RailButton label="Lock drawings — not in this build" disabled icon={Lock} onClick={() => {}} />
      <RailButton label={crosshairVisible ? "Crosshair visible" : "Crosshair hidden"} onClick={() => setCrosshairVisible((v) => !v)} icon={Eye} />
      <div className="mt-auto" />
      <RailButton label="Clear all drawings and measurements" onClick={clearDrawings} icon={Trash2} />
    </>
  );

  return (
    <section className="relative flex min-h-[320px] flex-1 flex-col bg-bg" aria-label={`${symbol} price chart`}>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-9 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-[#111111] py-1 sm:flex">
          {railButtons}
        </div>

        <div className="relative min-h-[260px] flex-1">
          <div ref={containerRef} className="absolute inset-0" data-testid="price-chart" />

          {legend ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-gradient-to-b from-black/70 to-transparent px-2 py-1 text-[11px]">
              <span className="font-semibold text-fg">{symbol}</span>
              <span className="text-faint">· {timeframe.toUpperCase()} · {network.toUpperCase()}</span>
              <span className="num flex flex-wrap items-baseline gap-1.5 text-faint">
                <span>O <span className="text-muted">{chartPrice(legend.open, effectiveCurrency)}</span></span>
                <span>H <span className="text-buy">{chartPrice(legend.high, effectiveCurrency)}</span></span>
                <span>L <span className="text-sell">{chartPrice(legend.low, effectiveCurrency)}</span></span>
                <span>C <span className="text-fg">{chartPrice(legend.close, effectiveCurrency)}</span></span>
              </span>
              {stale ? <span className="text-warn">stale</span> : null}
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center">
            <div className="text-center opacity-[0.05]">
              <p className="text-3xl font-bold tracking-tight text-fg">{symbol}</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-fg">
                {network} · {timeframe}
              </p>
            </div>
          </div>

          {measure && measure.end != null && measurePct != null ? (
            <div className="absolute right-2 top-8 z-10 flex items-center gap-2 rounded-sm border border-border-strong bg-[#111111]/95 px-2 py-1 text-2xs">
              <SlidersHorizontal className="h-3 w-3 text-fg" />
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
            <div className="absolute left-2 top-8 z-10 rounded-sm border border-border-strong bg-[#111111]/90 px-1.5 py-0.5 text-2xs text-muted">
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

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-[#111111] px-1.5 text-2xs text-faint">
        {timeframeStrip}
        <span className="hidden lg:inline">OHLCV GeckoTerminal · last bar updates on every tick</span>
        <div className="ml-auto flex items-center gap-2">
          {fetching && !loading ? <Spinner className="text-faint" /> : null}
          {livePrice != null && !stale && !error ? (
            <span className="inline-flex items-center gap-1 text-2xs text-faint" title="The forming candle updates on every price tick">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-buy opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-buy" />
              </span>
              live
            </span>
          ) : null}
          <span className={cn("num hidden sm:inline", stale ? "text-warn" : "text-faint")}>
            {lastUpdated ? new Date(lastUpdated).toLocaleTimeString("en-GB", { hour12: false }) : "—"}
          </span>
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
    </section>
  );
}

function RailButton({
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
            "flex h-7 w-7 items-center justify-center rounded-[2px] transition-colors",
            active ? "bg-panel-3 text-fg" : "text-faint hover:bg-panel-2 hover:text-fg",
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
