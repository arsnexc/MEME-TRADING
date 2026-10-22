"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Star, Users } from "lucide-react";
import { NetworkBadge } from "@/components/ui/network-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { TokenAvatar } from "@/components/token/token-avatar";
import { SocialLinks } from "@/components/token/social-links";
import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { aggregateTransactions, traderCount, type ScreenerRow } from "@/lib/market-view";
import { formatAge, formatPercent, formatTimestamp } from "@/lib/formatting";
import type { MarketToken } from "@/lib/market-data/types";
import { NETWORKS, scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SCREENER_TABLE_COLUMNS, type ScreenerColumnKey } from "./columns";

const COUNT_FORMAT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const RANK_WIDTH = SCREENER_TABLE_COLUMNS[0].width;

/** 25_900 → "25.9K"; counts in a 96px cell must stay one line. */
function compactCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

/** The merged row carries how many pools it represents; single-pool tokens do not. */
function poolCountOf(token: MarketToken): number {
  return (token as Partial<ScreenerRow>).poolCount ?? 1;
}

export function transactionRatio(token: MarketToken, timeframe: ScannerTimeframe) {
  const txns = aggregateTransactions(token, timeframe);
  if (!txns) return null;
  const total = txns.buys + txns.sells;
  return total === 0 ? null : { ...txns, total, buyPct: (txns.buys / total) * 100 };
}

/** Market-cap position in the loaded universe. Independent of sort and filters. */
function RankCell({ rank }: { rank: number | null | undefined }) {
  if (rank == null) return <span className="num text-[11px] text-faint">—</span>;
  return (
    <span
      className={cn("num text-[11px] tabular-nums", rank <= 3 ? "text-fg" : "text-muted")}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

/**
 * Price cell with a one-frame tick flash.
 *
 * The flash is driven by a real change between two polls — it never animates
 * when the number is identical, and it does not remount the row (which would
 * break the terminal-style stability the rest of the app keeps).
 */
function usePriceFlash(price: number | null) {
  const previous = useRef<number | null>(price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = price;
    if (before == null || price == null || before === price) return;
    setFlash(price > before ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(timer);
  }, [price]);

  return flash;
}

/** Wallet participants in the window. Not a holder count — see the header note. */
function TradersCell({ token, timeframe }: { token: MarketToken; timeframe: ScannerTimeframe }) {
  const count = traderCount(token, timeframe);
  const pools = poolCountOf(token);
  const poolNote =
    pools > 1 ? ` Summed across the ${pools} pools of this token in the loaded page.` : "";

  if (count == null) {
    return (
      <Tooltip
        content={`Buyer and seller wallet counts are unavailable for this token on the ${scannerTimeframeLabel(timeframe)} window.`}
      >
        <span className="num text-[11px] text-faint">—</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={`${count.toLocaleString()} wallets traded in the ${scannerTimeframeLabel(timeframe)} window (buyers + sellers). A wallet that did both is counted twice.${poolNote} Not a holder count.`}
    >
      <span className="num text-[11px] text-fg">{compactCount(count)}</span>
    </Tooltip>
  );
}

export function ChangeValue({ value }: { value: number | null }) {
  if (value == null) return <span className="num text-faint">—</span>;
  return (
    <span
      className={cn(
        "num font-medium",
        value > 0 ? "text-buy" : value < 0 ? "text-sell" : "text-muted",
      )}
    >
      {formatPercent(value, { sign: true })}
    </span>
  );
}

/**
 * Change value with a magnitude bar underneath.
 *
 * The bar is scaled to ±25% so a 3% move and a 300% move are told apart at a
 * glance; anything past 25% is clamped rather than allowed to overflow the
 * cell. Colour comes from the sign only — the bar is not a second colour code.
 */
function ChangeCell({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <Tooltip content="The provider published no change figure for this window on this token.">
        <span className="num text-[11px] text-faint">—</span>
      </Tooltip>
    );
  }
  const width = Math.min(Math.abs(value), 25) / 25 * 100;
  return (
    <span className="inline-flex flex-col items-end gap-[3px]">
      <ChangeValue value={value} />
      <span aria-hidden="true" className="h-[2px] w-[46px] overflow-hidden rounded-[1px] bg-panel-3">
        <span
          className={cn("block h-full", value > 0 ? "bg-buy/70" : value < 0 ? "bg-sell/70" : "bg-border-strong")}
          style={{ width: `${value === 0 ? 100 : width}%` }}
        />
      </span>
    </span>
  );
}

export function terminalHref(token: MarketToken): string {
  return `/terminal?${new URLSearchParams({
    network: token.network,
    pool: token.pool,
    token: token.tokenAddress,
  }).toString()}`;
}

/**
 * Two-line token cell: ticker + chain badge on top, project name and quiet
 * utility icons underneath. The icons are always laid out but only fade in on
 * hover, so rows stay calm and nothing shifts when the pointer arrives.
 */
export function TokenIdentity({
  token,
  href,
  compact = false,
}: {
  token: MarketToken;
  href?: string;
  compact?: boolean;
}) {
  const symbolClass = cn(
    "truncate font-semibold leading-none text-fg transition-colors group-hover:text-white",
    compact ? "text-[13px]" : "text-[12.5px]",
  );
  const pools = poolCountOf(token);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TokenAvatar src={token.imageUrl} symbol={token.symbol} size={compact ? 28 : 24} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {href ? (
            <Link href={href} onClick={(event) => event.stopPropagation()} className={symbolClass}>
              {token.symbol}
            </Link>
          ) : (
            <span className={symbolClass}>{token.symbol}</span>
          )}
          <NetworkBadge network={token.network} className="px-1 py-0.5 text-[9px]" />
          {token.dexId ? (
            <span className="hidden truncate text-[10px] text-faint xl:inline">{token.dexId}</span>
          ) : null}
        </div>
        <div className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[10px] leading-none">
          <span className="max-w-[190px] truncate text-muted">{token.name}</span>
          {pools > 1 ? (
            <Tooltip
              content={`${pools} pools of this token are folded into one row: volume, liquidity and trade counts are summed, and price/change follow the deepest pool.`}
            >
              <span className="shrink-0 rounded-[2px] border border-border px-1 py-px text-[9px] text-faint">
                {pools} pools
              </span>
            </Tooltip>
          ) : null}
          <span className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
            <CopyButton value={token.tokenAddress} label="Copy contract address" />
            <Tooltip content={`${NETWORKS[token.network].explorerName}: ${token.tokenAddress}`}>
              <a
                href={NETWORKS[token.network].tokenUrl(token.tokenAddress)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex text-faint transition-colors hover:text-fg"
                aria-label="Open contract on block explorer"
              >
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </Tooltip>
            <SocialLinks socials={token.socials} websites={token.websites} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Buy/sell split: counts on one line, a 3px two-tone bar underneath. */
export function TxnCell({ token, timeframe }: { token: MarketToken; timeframe: ScannerTimeframe }) {
  const ratio = transactionRatio(token, timeframe);
  if (!ratio) {
    return (
      <Tooltip content={`Buy/sell counts are unavailable for this pool on the ${scannerTimeframeLabel(timeframe)} window.`}>
        <span className="num text-[11px] text-faint">—</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={`${ratio.buys.toLocaleString()} buys · ${ratio.sells.toLocaleString()} sells in the ${scannerTimeframeLabel(timeframe)} window (GeckoTerminal). Not an order book.`}
    >
      <div className="w-full">
        <div className="flex items-baseline justify-between gap-1 text-[10px] leading-none">
          <span className="num text-buy">{compactCount(ratio.buys)}</span>
          <span className="num text-sell">{compactCount(ratio.sells)}</span>
        </div>
        <div className="mt-1 flex h-[3px] w-full gap-px overflow-hidden rounded-[1px] bg-panel-3">
          <span className="h-full bg-buy/90" style={{ width: `${ratio.buyPct}%` }} />
          <span className="h-full bg-sell/90" style={{ width: `${100 - ratio.buyPct}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}

function RowAction({ token, onOpen }: { token: MarketToken; onOpen: (token: MarketToken) => void }) {
  return (
    <Tooltip content={`Open ${token.symbol} and buy with the ${token.quote} paper account`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(token);
        }}
        className="h-6 w-[54px] rounded-[3px] bg-info text-[11px] font-semibold leading-none text-white transition-colors hover:bg-[#1f57ff]"
        aria-label={`Buy ${token.symbol} with the ${token.quote} paper account`}
      >
        Buy
      </button>
    </Tooltip>
  );
}

const CELL = "border-b border-[#1f1f1f] align-middle whitespace-nowrap";
const NUMERIC = cn(CELL, "px-2 text-right");

export function TokenRow({
  token,
  rank,
  timeframe,
  onOpen,
  watched,
  onToggleWatch,
  columns,
}: {
  token: MarketToken;
  /** Market-cap rank in the loaded universe; stays fixed while sorting. */
  rank?: number | null;
  timeframe: ScannerTimeframe;
  onOpen: (token: MarketToken) => void;
  watched: boolean;
  onToggleWatch: (token: MarketToken) => void;
  /** Visible column set. Defaults to every column for standalone use. */
  columns?: Set<ScreenerColumnKey>;
}) {
  const { formatPrice, formatMoney } = useDisplayCurrency();
  const visible = columns ?? new Set<ScreenerColumnKey>(SCREENER_TABLE_COLUMNS.map((column) => column.key));
  const flash = usePriceFlash(token.priceUsd);
  const pools = poolCountOf(token);
  const turnover = (token as Partial<ScreenerRow>).turnover ?? null;

  /**
   * Keyboard parity with a desktop screener: Enter opens the row, arrow keys
   * walk down the table without leaving it. Focus is moved with the DOM, not
   * React state, so the row never remounts and the table stays stable.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(token);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>("tr[data-screener-row]") ?? [],
    );
    const index = rows.indexOf(event.currentTarget);
    rows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  };

  return (
    <tr
      data-screener-row
      tabIndex={0}
      aria-label={`${token.symbol} row`}
      onClick={() => onOpen(token)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group h-10 cursor-pointer outline-none transition-colors hover:bg-[#161616] focus-visible:bg-[#161616]",
        flash === "up" && "bg-buy/[0.06]",
        flash === "down" && "bg-sell/[0.06]",
      )}
      data-testid={`token-row-${token.symbol}`}
    >
      {visible.has("rank") ? (
        <td className={cn(CELL, "sticky left-0 z-10 bg-bg pl-3 pr-1 text-right group-hover:bg-[#161616]")}>
          <RankCell rank={rank} />
        </td>
      ) : null}
      {visible.has("token") ? (
        <td
          className={cn(
            CELL,
            "sticky z-10 bg-bg pl-2 pr-3 shadow-[inset_-1px_0_0_#262626] group-hover:bg-[#161616]",
          )}
          style={{ left: RANK_WIDTH }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              aria-label={watched ? `Remove ${token.symbol} from trackers` : `Add ${token.symbol} to trackers`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleWatch(token);
              }}
              className={cn(
                "-ml-0.5 shrink-0 rounded-[2px] p-0.5 transition-all",
                watched
                  ? "text-fg"
                  : "text-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg",
              )}
            >
              <Star className={cn("h-3 w-3", watched && "fill-fg")} />
            </button>
            <div className="min-w-0 flex-1">
              <TokenIdentity token={token} href={terminalHref(token)} />
            </div>
          </div>
        </td>
      ) : null}
      {visible.has("price") ? (
        <td className={cn(NUMERIC, "num text-[12px] font-medium text-fg")}>{formatPrice(token.priceUsd)}</td>
      ) : null}
      {visible.has("change") ? (
        <td className={cn(NUMERIC, "text-[12px]")}>
          <ChangeCell value={token.changePct[timeframe]} />
        </td>
      ) : null}
      {visible.has("marketCap") ? (
        <td className={cn(NUMERIC, "num text-[12px] text-fg")}>
          <Tooltip
            content={
              <>
                {token.marketCapIsFdv
                  ? "Fully-diluted valuation: circulating supply is unavailable from the provider."
                  : "Market cap reported by the provider."}
                {turnover == null ? null : (
                  <>
                    {" "}
                    24h turnover {formatPercent(turnover * 100, { decimals: 1 })} of market cap.
                  </>
                )}
                {pools > 1 ? ` Market cap is per token, not per pool.` : null}
              </>
            }
          >
            <span>
              {formatMoney(token.marketCapUsd, { compact: true })}
              {token.marketCapIsFdv ? <span className="text-faint">*</span> : null}
            </span>
          </Tooltip>
        </td>
      ) : null}
      {visible.has("volume") ? (
        <td className={cn(NUMERIC, "num text-[12px] text-fg")}>
          <Tooltip
            content={`${scannerTimeframeLabel(timeframe)} traded volume${pools > 1 ? ` summed over ${pools} pools` : " across this pool"} (GeckoTerminal).`}
          >
            <span>{formatMoney(token.volumeUsd[timeframe], { compact: true })}</span>
          </Tooltip>
        </td>
      ) : null}
      {visible.has("liquidity") ? (
        <td className={cn(NUMERIC, "num text-[12px] text-fg")}>
          <Tooltip
            content={
              pools > 1
                ? `Liquidity summed over ${pools} pools. Depth, not volume.`
                : "Pool reserve depth reported by the provider. Depth, not volume."
            }
          >
            <span>{formatMoney(token.liquidityUsd, { compact: true })}</span>
          </Tooltip>
        </td>
      ) : null}
      {visible.has("traders") ? (
        <td className={NUMERIC}>
          <TradersCell token={token} timeframe={timeframe} />
        </td>
      ) : null}
      {visible.has("age") ? (
        <td
          className={cn(NUMERIC, "text-[11px] text-muted")}
          title={token.poolCreatedAt ? `Oldest pool of this token created ${formatTimestamp(token.poolCreatedAt)}` : undefined}
        >
          {formatAge(token.poolCreatedAt)}
        </td>
      ) : null}
      {visible.has("action") ? (
        <td className={cn(CELL, "py-2 pl-2 pr-3 text-right")}>
          <RowAction token={token} onOpen={onOpen} />
        </td>
      ) : null}
    </tr>
  );
}

export function TokenCard({
  token,
  rank,
  timeframe,
  onOpen,
  watched,
  onToggleWatch,
}: {
  token: MarketToken;
  rank?: number | null;
  timeframe: ScannerTimeframe;
  onOpen: (token: MarketToken) => void;
  watched: boolean;
  onToggleWatch: (token: MarketToken) => void;
}) {
  const { formatPrice, formatMoney } = useDisplayCurrency();
  const pools = poolCountOf(token);
  return (
    <article className="border-b border-[#1f1f1f] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="num mt-1 w-6 shrink-0 text-right text-[11px] tabular-nums text-faint">
          <RankCell rank={rank} />
        </span>
        <div className="min-w-0 flex-1">
          <TokenIdentity token={token} href={terminalHref(token)} compact />
        </div>
        <button
          type="button"
          aria-label={watched ? "Remove from trackers" : "Add to trackers"}
          onClick={() => onToggleWatch(token)}
          className={cn("-mt-0.5 rounded-sm p-1", watched ? "text-fg" : "text-faint")}
        >
          <Star className={cn("h-3.5 w-3.5", watched && "fill-fg")} />
        </button>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="num text-sm font-semibold text-fg">{formatPrice(token.priceUsd)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <ChangeValue value={token.changePct[timeframe]} />
            <span className="text-faint">· {scannerTimeframeLabel(timeframe)}</span>
            <span className="text-faint">· {formatAge(token.poolCreatedAt)} old</span>
          </div>
        </div>
        <RowAction token={token} onOpen={onOpen} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-3 border-t border-[#1f1f1f] pt-2 text-[10px]">
        <div>
          <dt className="text-faint">Mkt cap</dt>
          <dd className="num mt-0.5 text-[11px] text-fg">{formatMoney(token.marketCapUsd, { compact: true })}</dd>
        </div>
        <div>
          <dt className="text-faint">Liquidity</dt>
          <dd className="num mt-0.5 text-[11px] text-fg">{formatMoney(token.liquidityUsd, { compact: true })}</dd>
        </div>
        <div>
          <dt className="text-faint">{scannerTimeframeLabel(timeframe)} volume</dt>
          <dd className="num mt-0.5 text-[11px] text-fg">{formatMoney(token.volumeUsd[timeframe], { compact: true })}</dd>
        </div>
      </dl>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="w-28">
          <TxnCell token={token} timeframe={timeframe} />
        </div>
        <span className="flex items-center gap-1 text-[10px] text-faint">
          <Users className="h-3 w-3" aria-hidden="true" />
          <TradersCell token={token} timeframe={timeframe} /> traders
        </span>
        {pools > 1 ? <span className="text-[10px] text-faint">{pools} pools</span> : null}
        {token.dexId ? <span className="truncate text-[10px] text-faint">{token.dexId}</span> : null}
      </div>
    </article>
  );
}
