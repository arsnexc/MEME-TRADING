"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ExternalLink, MoreHorizontal, Star } from "lucide-react";
import { NetworkBadge } from "@/components/ui/network-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import { TokenAvatar } from "@/components/token/token-avatar";
import { SecurityBadges } from "@/components/token/security-badges";
import { SocialLinks } from "@/components/token/social-links";
import { Tooltip } from "@/components/ui/tooltip";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { aggregateTransactions } from "@/lib/market-view";
import { formatAge } from "@/lib/formatting";
import type { MarketToken } from "@/lib/market-data/types";
import type { ScannerTimeframe } from "@/lib/constants";
import { NETWORKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function transactionRatio(token: MarketToken, timeframe: ScannerTimeframe) {
  const txns = aggregateTransactions(token, timeframe);
  if (!txns) return null;
  const total = txns.buys + txns.sells;
  return total === 0 ? null : { ...txns, total, buyPct: (txns.buys / total) * 100 };
}

export function ChangeValue({ value }: { value: number | null }) {
  if (value == null) return <span className="num text-faint">—</span>;
  const positive = value >= 0;
  return (
    <span className={cn("num inline-flex items-center gap-0.5", positive ? "text-buy" : "text-sell")}>
      {positive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(value).toFixed(2)}%
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

export function TokenIdentity({
  token,
  compact = false,
  href,
}: {
  token: MarketToken;
  compact?: boolean;
  href?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TokenAvatar src={token.imageUrl} symbol={token.symbol} size={compact ? 22 : 26} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {href ? (
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              className="truncate text-xs font-semibold leading-tight text-fg hover:text-[#b9c2ff] focus-visible:outline-none"
            >
              {token.symbol}
            </Link>
          ) : (
            <span className="truncate text-xs font-semibold leading-tight text-fg">{token.symbol}</span>
          )}
          <NetworkBadge network={token.network} />
          {token.dexId ? (
            <span className="hidden truncate text-2xs text-faint lg:inline">{token.dexId}</span>
          ) : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-faint">
          <span className="max-w-[130px] truncate text-muted">{token.name}</span>
          <CopyButton value={token.tokenAddress} label="Copy contract address" />
          <Tooltip content={`${NETWORKS[token.network].explorerName}: ${token.tokenAddress}`}>
            <a
              href={NETWORKS[token.network].tokenUrl(token.tokenAddress)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="text-faint transition-colors hover:text-fg"
              aria-label="Open contract on block explorer"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </Tooltip>
          <SocialLinks socials={token.socials} websites={token.websites} />
        </div>
      </div>
    </div>
  );
}

export function TxnCell({ token, timeframe }: { token: MarketToken; timeframe: ScannerTimeframe }) {
  const ratio = transactionRatio(token, timeframe);
  if (!ratio) {
    return (
      <Tooltip content={`Buy/sell counts are unavailable for this pool on the ${timeframe} window.`}>
        <span className="num text-faint">—</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={`${ratio.buys.toLocaleString()} buys · ${ratio.sells.toLocaleString()} sells in the ${timeframe} window (GeckoTerminal).`}
    >
      <div className="w-[84px]">
        <div className="flex items-center justify-between gap-1 text-2xs">
          <span className="num text-buy">{ratio.buys.toLocaleString()}</span>
          <span className="num text-sell">{ratio.sells.toLocaleString()}</span>
        </div>
        <div className="mt-1 flex h-[3px] w-full overflow-hidden rounded-full bg-panel-3">
          <span className="h-full bg-buy/80" style={{ width: `${ratio.buyPct}%` }} />
          <span className="h-full bg-sell/80" style={{ width: `${100 - ratio.buyPct}%` }} />
        </div>
      </div>
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
  const quote = token.quote;

  return (
    <tr
      onClick={() => onOpen(token)}
      className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-panel-2/70"
      data-testid={`token-row-${token.symbol}`}
    >
      <td className="py-1.5 pl-2.5 pr-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={watched ? `Remove ${token.symbol} from trackers` : `Add ${token.symbol} to trackers`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatch(token);
            }}
            className={cn(
              "rounded-[2px] p-0.5 transition-colors",
              watched ? "text-warn" : "text-faint opacity-0 hover:text-fg group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <Star className={cn("h-3 w-3", watched && "fill-warn")} />
          </button>
          <div className="min-w-0 flex-1">
            <TokenIdentity token={token} href={terminalHref(token)} />
          </div>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="num text-xs text-fg">{formatPrice(token.priceUsd)}</div>
        <div className="num mt-0.5 text-2xs text-faint">
          {token.fdvUsd && token.priceUsd && token.fdvUsd > 0
            ? `FDV ${formatMoney(token.fdvUsd, { compact: true })}`
            : `—`}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <ChangeValue value={token.changePct[timeframe]} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="num text-xs text-fg">{formatAge(token.poolCreatedAt)}</div>
        <div className="text-2xs text-faint">pool age</div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="num text-xs text-fg">{formatMoney(token.marketCapUsd, { compact: true })}</div>
        <div className="text-2xs text-faint">{token.marketCapIsFdv ? "FDV*" : "mkt cap"}</div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="num text-xs text-fg">{formatMoney(token.liquidityUsd, { compact: true })}</div>
        <div className="text-2xs text-faint">liquidity</div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="num text-xs text-fg">{formatMoney(token.volumeUsd[timeframe], { compact: true })}</div>
        <div className="text-2xs text-faint">{timeframe} volume</div>
      </td>
      <td className="px-2 py-1.5">
        <TxnCell token={token} timeframe={timeframe} />
      </td>
      <td className="px-2 py-1.5">
        <SecurityBadges security={token.security} />
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(token);
            }}
            className={cn(
              "h-6 rounded-[2px] border px-2 text-2xs font-semibold transition-colors",
              quote === "SOL"
                ? "border-[#9945FF]/40 bg-[#9945FF]/10 text-[#c9a6ff] hover:bg-[#9945FF]/20"
                : "border-[#627EEA]/40 bg-[#627EEA]/10 text-[#aab8ff] hover:bg-[#627EEA]/20",
            )}
            aria-label={`Open ${token.symbol} paper trading terminal using the ${quote} account`}
          >
            Buy {quote}
          </button>
          <MoreHorizontal className="h-3 w-3 text-faint" />
        </div>
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
  const ratio = transactionRatio(token, timeframe);
  return (
    <article className="border-b border-border px-2.5 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TokenIdentity token={token} href={terminalHref(token)} />
        </div>
        <button
          type="button"
          aria-label={watched ? "Remove from trackers" : "Add to trackers"}
          onClick={() => onToggleWatch(token)}
          className={cn("rounded-sm p-1", watched ? "text-warn" : "text-faint")}
        >
          <Star className={cn("h-3.5 w-3.5", watched && "fill-warn")} />
        </button>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="num text-sm font-semibold">{formatPrice(token.priceUsd)}</div>
          <div className="mt-0.5 text-2xs">
            <ChangeValue value={token.changePct[timeframe]} /> <span className="text-faint">· {timeframe}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpen(token)}
          className="h-7 rounded-[2px] border border-buy/30 bg-buy/10 px-3 text-2xs font-semibold text-buy"
        >
          Trade {token.quote}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-2xs">
        <div>
          <dt className="text-faint">Mkt cap</dt>
          <dd className="num mt-0.5 text-fg">{formatMoney(token.marketCapUsd, { compact: true })}</dd>
        </div>
        <div>
          <dt className="text-faint">Liquidity</dt>
          <dd className="num mt-0.5 text-fg">{formatMoney(token.liquidityUsd, { compact: true })}</dd>
        </div>
        <div>
          <dt className="text-faint">{timeframe} vol</dt>
          <dd className="num mt-0.5 text-fg">{formatMoney(token.volumeUsd[timeframe], { compact: true })}</dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center justify-between gap-3">
        {ratio ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="num text-2xs text-buy">{ratio.buys} buy</span>
            <div className="flex h-[3px] flex-1 overflow-hidden rounded-full bg-panel-3">
              <span className="bg-buy/80" style={{ width: `${ratio.buyPct}%` }} />
              <span className="bg-sell/80" style={{ width: `${100 - ratio.buyPct}%` }} />
            </div>
            <span className="num text-2xs text-sell">{ratio.sells} sell</span>
          </div>
        ) : (
          <span className="text-2xs text-faint">Txns unavailable</span>
        )}
        <Badge tone="ghost" className="hidden sm:inline-flex">
          {token.dexId ?? "dex"}
        </Badge>
      </div>
      <div className="mt-2">
        <SecurityBadges security={token.security} />
      </div>
    </article>
  );
}
