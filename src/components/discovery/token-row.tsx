"use client";

import Link from "next/link";
import { ExternalLink, Star } from "lucide-react";
import { NetworkBadge } from "@/components/ui/network-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { TokenAvatar } from "@/components/token/token-avatar";
import { SecurityBadges } from "@/components/token/security-badges";
import { SocialLinks } from "@/components/token/social-links";
import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { aggregateTransactions } from "@/lib/market-view";
import { formatAge, formatPercent, formatTimestamp } from "@/lib/formatting";
import type { MarketToken } from "@/lib/market-data/types";
import type { ScannerTimeframe } from "@/lib/constants";
import { NETWORKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const COUNT_FORMAT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 25_900 → "25.9K"; counts in a 104px cell must stay one line. */
function compactCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

export function transactionRatio(token: MarketToken, timeframe: ScannerTimeframe) {
  const txns = aggregateTransactions(token, timeframe);
  if (!txns) return null;
  const total = txns.buys + txns.sells;
  return total === 0 ? null : { ...txns, total, buyPct: (txns.buys / total) * 100 };
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
      <Tooltip content={`Buy/sell counts are unavailable for this pool on the ${timeframe} window.`}>
        <span className="num text-[11px] text-faint">—</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={`${ratio.buys.toLocaleString()} buys · ${ratio.sells.toLocaleString()} sells in the ${timeframe} window (GeckoTerminal). Not an order book.`}
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
        className="h-6 w-[58px] rounded-[3px] bg-info text-[11px] font-semibold leading-none text-white transition-colors hover:bg-[#1f57ff]"
        aria-label={`Buy ${token.symbol} with the ${token.quote} paper account`}
      >
        Buy
      </button>
    </Tooltip>
  );
}

export function TokenRow({
  token,
  timeframe,
  onOpen,
  watched,
  onToggleWatch,
}: {
  token: MarketToken;
  timeframe: ScannerTimeframe;
  onOpen: (token: MarketToken) => void;
  watched: boolean;
  onToggleWatch: (token: MarketToken) => void;
}) {
  const { formatPrice, formatMoney } = useDisplayCurrency();
  const cell = "border-b border-[#1f1f1f] align-middle";
  const numeric = cn(cell, "whitespace-nowrap px-2 text-right");

  return (
    <tr
      onClick={() => onOpen(token)}
      className="group h-10 cursor-pointer transition-colors hover:bg-[#161616]"
      data-testid={`token-row-${token.symbol}`}
    >
      <td className={cn(cell, "pl-3 pr-3")}>
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
      <td className={cn(numeric, "text-[12px] font-medium text-fg")}>{formatPrice(token.priceUsd)}</td>
      <td className={cn(numeric, "text-[12px]")}>
        <ChangeValue value={token.changePct[timeframe]} />
      </td>
      <td
        className={cn(numeric, "text-[11px] text-muted")}
        title={token.poolCreatedAt ? `Pool created ${formatTimestamp(token.poolCreatedAt)}` : undefined}
      >
        {formatAge(token.poolCreatedAt)}
      </td>
      <td className={cn(numeric, "text-[12px] text-fg")}>
        <Tooltip
          content={
            token.marketCapIsFdv
              ? "Fully-diluted valuation: circulating supply is unavailable from the provider."
              : "Market cap reported by the provider."
          }
        >
          <span className="num">
            {formatMoney(token.marketCapUsd, { compact: true })}
            {token.marketCapIsFdv ? <span className="text-faint">*</span> : null}
          </span>
        </Tooltip>
      </td>
      <td className={cn(numeric, "text-[12px] text-fg")}>{formatMoney(token.liquidityUsd, { compact: true })}</td>
      <td className={cn(numeric, "text-[12px] text-fg")}>
        <Tooltip content={`${timeframe.toUpperCase()} traded volume across this pool (GeckoTerminal).`}>
          <span className="num">{formatMoney(token.volumeUsd[timeframe], { compact: true })}</span>
        </Tooltip>
      </td>
      <td className={cn(cell, "px-2")}>
        <TxnCell token={token} timeframe={timeframe} />
      </td>
      <td className={cn(cell, "whitespace-nowrap px-2")}>
        <SecurityBadges security={token.security} compact />
      </td>
      <td className={cn(cell, "py-2 pl-2 pr-3 text-right")}>
        <RowAction token={token} onOpen={onOpen} />
      </td>
    </tr>
  );
}

export function TokenCard({
  token,
  timeframe,
  onOpen,
  watched,
  onToggleWatch,
}: {
  token: MarketToken;
  timeframe: ScannerTimeframe;
  onOpen: (token: MarketToken) => void;
  watched: boolean;
  onToggleWatch: (token: MarketToken) => void;
}) {
  const { formatPrice, formatMoney } = useDisplayCurrency();
  return (
    <article className="border-b border-[#1f1f1f] px-3 py-2.5">
      <div className="flex items-start gap-2">
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
            <span className="text-faint">· {timeframe.toUpperCase()}</span>
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
          <dt className="text-faint">{timeframe.toUpperCase()} volume</dt>
          <dd className="num mt-0.5 text-[11px] text-fg">{formatMoney(token.volumeUsd[timeframe], { compact: true })}</dd>
        </div>
      </dl>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="w-28">
          <TxnCell token={token} timeframe={timeframe} />
        </div>
        {token.dexId ? <span className="truncate text-[10px] text-faint">{token.dexId}</span> : null}
        <SecurityBadges security={token.security} compact />
      </div>
    </article>
  );
}
