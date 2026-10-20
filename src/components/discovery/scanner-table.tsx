"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import { TokenCard, TokenRow } from "./token-row";
import { Tooltip } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import { scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
import type { SortDirection, SortKey } from "@/stores/preferences";
import { cn } from "@/lib/utils";

const HEADER_CELL =
  "h-8 border-b border-border bg-[#0f0f0f] px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint";

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "right",
  suffix,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  suffix?: React.ReactNode;
}) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      className={cn(
        "group/th inline-flex w-full items-center gap-1 transition-colors hover:text-muted",
        align === "right" ? "justify-end text-right" : "justify-start text-left",
        active && "text-fg",
      )}
    >
      <span className="inline-flex items-baseline gap-1">
        {label}
        {suffix}
      </span>
      <Icon
        className={cn(
          "h-2.5 w-2.5 shrink-0",
          active ? "text-fg" : "opacity-0 transition-opacity group-hover/th:opacity-70",
        )}
      />
    </button>
  );
}

/**
 * The ranked screener table.
 *
 * Rank is the market-cap position in the loaded universe and does not move
 * when the table is sorted or filtered — the same contract as a professional
 * screener. Every other column sorts from its header.
 */
export function ScannerTable({
  tokens,
  timeframe,
  sortKey,
  sortDirection,
  onSort,
  onOpen,
  watched,
  onToggleWatch,
  ranks,
}: {
  tokens: MarketToken[];
  timeframe: ScannerTimeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  onOpen: (token: MarketToken) => void;
  watched: Set<string>;
  onToggleWatch: (token: MarketToken) => void;
  ranks: Map<string, number>;
}) {
  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDirection === "asc" ? ("ascending" as const) : ("descending" as const)) : ("none" as const);
  const windowLabel = scannerTimeframeLabel(timeframe).toUpperCase();

  return (
    <>
      <div className="hidden overflow-x-auto panel-scroll md:block">
        <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0" aria-label="Token scanner">
          <colgroup>
            <col className="w-[54px]" />
            <col />
            <col className="w-[96px]" />
            <col className="w-[90px]" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-[100px]" />
            <col className="w-[88px]" />
            <col className="w-[84px]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={cn(HEADER_CELL, "pl-3 pr-1 text-right")} aria-sort={ariaSort("marketCap")}>
                <SortHeader
                  label="Rank"
                  sortKey="marketCap"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  align="right"
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "pl-2 pr-3 text-left")}>
                Token
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("price")}>
                <SortHeader label="Price" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("change")}>
                <SortHeader
                  label="Change %"
                  sortKey="change"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  suffix={<span className="text-[9px] font-normal tracking-normal text-faint/70">{windowLabel}</span>}
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("marketCap")}>
                <SortHeader
                  label="Market cap"
                  sortKey="marketCap"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("volume")}>
                <SortHeader
                  label="Volume"
                  sortKey="volume"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  suffix={<span className="text-[9px] font-normal tracking-normal text-faint/70">{windowLabel}</span>}
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("liquidity")}>
                <SortHeader
                  label="Liquidity"
                  sortKey="liquidity"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("traders")}>
                <SortHeader
                  label="Traders"
                  sortKey="traders"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={onSort}
                  suffix={
                    <Tooltip content="Wallets that bought or sold in this window, from provider buyer/seller counts. A wallet that did both is counted twice. Holder counts are not published by the pool APIs.">
                      <Info className="h-2.5 w-2.5 cursor-help text-faint/60" aria-hidden="true" />
                    </Tooltip>
                  }
                />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "text-right")} aria-sort={ariaSort("age")}>
                <SortHeader label="Age" sortKey="age" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              </th>
              <th scope="col" className={cn(HEADER_CELL, "pl-2 pr-3 text-right")}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                rank={ranks.get(token.id) ?? null}
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
            rank={ranks.get(token.id) ?? null}
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
