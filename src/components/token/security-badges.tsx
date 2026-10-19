import { LockKeyhole, ShieldQuestion, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { SecurityInfo } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

export function SecurityBadges({ security, className }: { security: SecurityInfo; className?: string }) {
  const lp = security.lpLockedPct;
  const lpKnown = lp != null;
  const lpHealthy = lpKnown && lp >= 95;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Tooltip
        content={
          lpKnown
            ? `Liquidity reported as ${lp.toFixed(1)}% locked by GeckoTerminal. This is provider metadata, not an independent audit.`
            : "Liquidity lock status is not reported for this pool."
        }
      >
        <Badge tone={lpKnown ? (lpHealthy ? "green" : lp >= 50 ? "warn" : "red") : "ghost"} className="gap-0.5">
          <LockKeyhole className="h-2.5 w-2.5" />
          LP {lpKnown ? `${lp.toFixed(0)}%` : "?"}
        </Badge>
      </Tooltip>
      <Tooltip content="Mint and freeze authority checks require a chain indexer/RPC that is not connected. Shown as unknown — not as safe.">
        <Badge tone="ghost" className="gap-0.5">
          <ShieldQuestion className="h-2.5 w-2.5" />
          Mint ?
        </Badge>
      </Tooltip>
      <Tooltip content="Holder concentration is not supplied by GeckoTerminal or DEX Screener. No holder data is fabricated.">
        <Badge tone="ghost" className="gap-0.5 hidden xl:inline-flex">
          <Users className="h-2.5 w-2.5" />
          Top10 ?
        </Badge>
      </Tooltip>
    </div>
  );
}
