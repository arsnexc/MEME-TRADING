"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { formatPercent } from "@/lib/formatting";
import { scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ScreenerStats } from "@/lib/market-view";

const LABEL = "text-[9.5px] font-medium uppercase tracking-[0.09em] text-faint";
const VALUE = "num mt-0.5 text-[12px] leading-none text-fg";

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Market breadth for the rows in the current view.
 *
 * Every figure is a sum or median over the loaded snapshot — no estimate is
 * extrapolated to "the whole market", because the screener only sees the pools
 * its two providers return. Rows with an unpublished change window are counted
 * separately instead of being treated as flat.
 */
export function MarketBreadth({
  stats,
  timeframe,
}: {
  stats: ScreenerStats;
  timeframe: ScannerTimeframe;
}) {
  const { formatMoney } = useDisplayCurrency();
  const window = scannerTimeframeLabel(timeframe);
  const decided = stats.advancing + stats.declining;
  const upShare = decided === 0 ? 0 : (stats.advancing / decided) * 100;
  const partialNote = (missing: number, noun: string) =>
    missing > 0
      ? ` ${missing} of the ${stats.count} tokens publish no ${noun}, so this total excludes them.`
      : "";
  const unknownNote =
    stats.unknown > 0
      ? ` ${stats.unknown} ${stats.unknown === 1 ? "token has" : "tokens have"} no published ${window} change and ${stats.unknown === 1 ? "is" : "are"} excluded from the split.`
      : "";

  return (
    <div
      className="flex items-stretch gap-0 overflow-x-auto border-b border-border bg-[#0f0f0f] px-3 panel-scroll"
      aria-label="Market breadth"
      role="group"
    >
      <div className="flex shrink-0 items-center gap-2.5 py-1.5 pr-4">
        <div className="min-w-[86px]">
          <p className={LABEL}>Breadth</p>
          <p className={cn(VALUE, "flex items-baseline gap-1")}>
            <span className="text-buy">{stats.advancing}</span>
            <span className="text-faint">/</span>
            <span className="text-sell">{stats.declining}</span>
            <span className="ml-0.5 text-[10px] font-normal text-faint">up/down</span>
          </p>
        </div>
        <Tooltip content={`${stats.advancing} advancing, ${stats.declining} declining, ${stats.flat} unchanged.${unknownNote}`}>
          <div
            className="flex h-[5px] w-[92px] shrink-0 overflow-hidden rounded-[1px] bg-panel-3"
            aria-label={`${stats.advancing} advancing, ${stats.declining} declining`}
            role="img"
          >
            <span className="h-full bg-buy/90" style={{ width: `${upShare}%` }} />
            <span className="h-full bg-sell/90" style={{ width: `${100 - upShare}%` }} />
          </div>
        </Tooltip>
      </div>

      <Stat
        label={`Median ${window}`}
        tooltip={`Median ${window} price change across the ${stats.count} tokens in view. A median is used instead of an average so one 900% mover cannot describe the whole list.`}
        value={
          stats.medianChange == null ? (
            <span className="text-faint">—</span>
          ) : (
            <span className={stats.medianChange > 0 ? "text-buy" : stats.medianChange < 0 ? "text-sell" : "text-muted"}>
              {formatPercent(stats.medianChange, { sign: true })}
            </span>
          )
        }
      />

      <Stat
        label="Market cap"
        tooltip={`Sum of the reported market caps of the ${stats.count} tokens in view. Tokens without a published market cap are excluded rather than counted as zero.`}
        value={
          <>
            {formatMoney(stats.totalMarketCap, { compact: true })}
            {stats.partial.marketCap > 0 ? <Dagger /> : null}
          </>
        }
        note={partialNote(stats.partial.marketCap, "market cap")}
      />
      <Stat
        label={`Volume ${window}`}
        tooltip={`Sum of the ${window} volume of every token in view, across all of its pools in this snapshot.`}
        value={
          <>
            {formatMoney(stats.totalVolume, { compact: true })}
            {stats.partial.volume > 0 ? <Dagger /> : null}
          </>
        }
        note={partialNote(stats.partial.volume, `${window} volume`)}
      />
      <Stat
        label="Liquidity"
        tooltip="Sum of the reported pool liquidity of the tokens in view."
        value={
          <>
            {formatMoney(stats.totalLiquidity, { compact: true })}
            {stats.partial.liquidity > 0 ? <Dagger /> : null}
          </>
        }
        note={partialNote(stats.partial.liquidity, "liquidity")}
      />
      <Stat
        label={`Traders ${window}`}
        tooltip={`Buyers + sellers summed over every pool in view. Wallet participation, not holders, and a wallet that traded in two pools of the same token is counted twice.${unknownNote}`}
        value={
          stats.totalTraders == null ? (
            <span className="text-faint">—</span>
          ) : (
            <>
              {COMPACT.format(stats.totalTraders)}
              {stats.partial.traders > 0 ? <Dagger /> : null}
            </>
          )
        }
        note={partialNote(stats.partial.traders, "wallet count")}
      />
      <Stat
        label="Pools"
        tooltip="Provider pools folded into these rows. Duplicate pools of the same token are merged, never listed twice."
        value={COMPACT.format(stats.poolCount)}
        className="pr-3"
      />

      {stats.best && stats.worst ? (
        <div className="ml-auto hidden shrink-0 items-center gap-4 py-1.5 pl-4 lg:flex">
          <div>
            <p className={LABEL}>Top mover</p>
            <p className={cn(VALUE, "text-buy")}>
              {stats.best.symbol} {formatPercent(stats.best.change, { sign: true })}
            </p>
          </div>
          <div>
            <p className={LABEL}>Weakest</p>
            <p className={cn(VALUE, "text-sell")}>
              {stats.worst.symbol} {formatPercent(stats.worst.change, { sign: true })}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Marks a total that excludes rows with no published value. */
function Dagger() {
  return (
    <span aria-hidden="true" className="ml-0.5 align-super text-[8px] text-faint">
      †
    </span>
  );
}

function Stat({
  label,
  value,
  tooltip,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tooltip: string;
  note?: string;
  className?: string;
}) {
  return (
    <Tooltip content={note ? `${tooltip}${note}` : tooltip}>
      <div className={cn("min-w-[86px] shrink-0 border-l border-[#1f1f1f] px-3 py-1.5", className)}>
        <p className={LABEL}>{label}</p>
        <p className={VALUE}>{value}</p>
      </div>
    </Tooltip>
  );
}
