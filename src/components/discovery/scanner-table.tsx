"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import { TokenCard, TokenRow } from "./token-row";
import { Tooltip } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import type { ScannerTimeframe } from "@/lib/constants";
import type { SortDirection, SortKey } from "@/stores/preferences";
import { cn } from "@/lib/utils";

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}${active ? `, currently ${direction}ending` : ""}`}
      className={cn(
        "inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wide transition-colors",
        active ? "text-fg" : "text-faint hover:text-muted",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <Icon className="h-2.5 w-2.5" />
    </button>
  );
}

export function ScannerTable({
  tokens,
  timeframe,
  sortKey,
  sortDirection,
  onSort,
  onOpen,
  watched,
  onToggleWatch,
}: {
  tokens: MarketToken[];
  timeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  onOpen: (token: MarketToken) => void;
  watched: Set<string>;
  onToggleWatch: (token: MarketToken) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto panel-scroll md:block">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0" aria-label="Token scanner">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-border text-2xs text-faint">
              <th className="border-b border-border py-1.5 pl-2.5 pr-2 text-left font-medium">Token / pair</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Price</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                <SortHeader label="Change" sortKey="change" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">Age</th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                <SortHeader label="Mkt cap" sortKey="marketCap" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                <SortHeader label="Liquidity" sortKey="liquidity" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                <SortHeader label="Volume" sortKey="volume" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium">Txns</th>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Security
                  <Tooltip content="Provider-reported LP lock only. Mint/freeze authority and holder concentration are unavailable — unknown, never 'safe'.">
                    <Info className="h-2.5 w-2.5 cursor-help text-faint" />
                  </Tooltip>
                </span>
              </th>
              <th className="border-b border-border px-2.5 py-1.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                timeframe={timeframe}
                onOpen={onOpen}
                watched={watched.has(`${token.network}:${token.tokenAddress}`)}
                onToggleWatch={onToggleWatch}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        {tokens.map((token) => (
          <TokenCard
            key={token.id}
            token={token}
            timeframe={timeframe}
            onOpen={onOpen}
            watched={watched.has(`${token.network}:${token.tokenAddress}`)}
            onToggleWatch={onToggleWatch}
          />
        ))}
      </div>
    </>
  );
}
