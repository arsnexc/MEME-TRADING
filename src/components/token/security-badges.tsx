import { LockKeyhole, ShieldQuestion, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { SecurityInfo } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

function lpTooltip(lpKnown: boolean, lp: number | null) {
  return lpKnown && lp != null
    ? `Liquidity reported as ${lp.toFixed(1)}% locked by GeckoTerminal. Provider metadata, not an independent audit.`
    : "Liquidity lock status is not reported for this pool.";
}

const MINT_NOTE =
  "Mint and freeze authority checks require a chain indexer/RPC that is not connected. Unknown — not safe.";
const HOLDERS_NOTE =
  "Holder concentration is not supplied by GeckoTerminal or DEX Screener. No holder data is fabricated.";

/**
 * Provider security flags. Read-only and honest: an unknown check renders as a
 * faint question mark, never as a pass. `compact` swaps the text badges for the
 * icon-only cluster used by the screener table.
 */
export function SecurityBadges({
  security,
  className,
  compact = false,
}: {
  security: SecurityInfo;
  className?: string;
  compact?: boolean;
}) {
  const lp = security.lpLockedPct;
  const lpKnown = lp != null;
  const lpHealthy = lpKnown && lp >= 95;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)} aria-label="Provider security flags">
        <Tooltip content={lpTooltip(lpKnown, lp)}>
          <span
            tabIndex={0}
            role="img"
            aria-label={lpKnown ? `Liquidity lock: ${lp?.toFixed(0)} percent reported` : "Liquidity lock: unknown"}
            className="inline-flex rounded-[2px] outline-none transition-opacity hover:opacity-80"
          >
            <LockKeyhole
              className={cn(
                "h-[13px] w-[13px]",
                lpKnown ? (lpHealthy ? "text-buy" : lp >= 50 ? "text-warn" : "text-sell") : "text-faint/80",
              )}
            />
          </span>
        </Tooltip>
        <Tooltip content={MINT_NOTE}>
          <span tabIndex={0} role="img" aria-label="Mint and freeze authority: unknown" className="inline-flex outline-none">
            <ShieldQuestion className="h-[13px] w-[13px] text-faint/80" />
          </span>
        </Tooltip>
        <Tooltip content={HOLDERS_NOTE}>
          <span
            tabIndex={0}
            role="img"
            aria-label="Holder concentration: unknown"
            className="hidden outline-none xl:inline-flex"
          >
            <Users className="h-[13px] w-[13px] text-faint/80" />
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Tooltip content={lpTooltip(lpKnown, lp)}>
        <Badge tone={lpKnown ? (lpHealthy ? "green" : lp >= 50 ? "warn" : "red") : "ghost"} className="gap-0.5">
          <LockKeyhole className="h-2.5 w-2.5" />
          LP {lpKnown ? `${lp.toFixed(0)}%` : "?"}
        </Badge>
      </Tooltip>
      <Tooltip content={MINT_NOTE}>
        <Badge tone="ghost" className="gap-0.5">
          <ShieldQuestion className="h-2.5 w-2.5" />
          Mint ?
        </Badge>
      </Tooltip>
      <Tooltip content={HOLDERS_NOTE}>
        <Badge tone="ghost" className="hidden gap-0.5 xl:inline-flex">
          <Users className="h-2.5 w-2.5" />
          Top10 ?
        </Badge>
      </Tooltip>
    </div>
  );
}
