"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import { TokenCard, TokenRow } from "./token-row";
import { screenerMinWidth, visibleScreenerColumns, type ColumnDef } from "./columns";
import { Tooltip } from "@/components/ui/tooltip";
import type { MarketToken } from "@/lib/market-data/types";
import { tokenKey } from "@/lib/market-view";
import { scannerTimeframeLabel, type ScannerTimeframe } from "@/lib/constants";
import type { ScreenerColumn, SortDirection, SortKey } from "@/stores/preferences";
import { cn } from "@/lib/utils";

const HEADER_CELL =
  "sticky top-0 z-20 h-8 border-b border-border bg-[#0f0f0f] px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint";

/** Left offset of each sticky column, so rank and token never overlap. */
function stickyOffsets(columns: ColumnDef[]): Map<string, number> {
  const offsets = new Map<string, number>();
  let left = 0;
  for (const column of columns) {
    if (column.key !== "rank" && column.key !== "token") break;
    offsets.set(column.key, left);
    left += column.width;
  }
  return offsets;
}

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
 * screener. Every other column sorts from its header, the header and the two
 * identity columns stay pinned while the table scrolls, and the column set is
 * driven by one shared definition so a hidden column never shifts its
 * neighbours out of alignment.
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
  hiddenColumns = [],
  emptyMessage,
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
  /** Columns the user hid from the display menu; structural ones are ignored. */
  hiddenColumns?: ScreenerColumn[];
  emptyMessage?: string;
}) {
  const columns = visibleScreenerColumns(hiddenColumns);
  const visible = new Set(columns.map((column) => column.key));
  // The minimum width follows the visible columns, so hiding a column can make
  // the table fit a narrow window instead of forcing sideways scrolling.
  const minWidth = screenerMinWidth(columns);
  const offsets = stickyOffsets(columns);
  const windowLabel = scannerTimeframeLabel(timeframe).toUpperCase();

  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDirection === "asc" ? ("ascending" as const) : ("descending" as const)) : ("none" as const);

  const suffixFor = (column: ColumnDef) => {
    if (column.hint === "window") {
      return <span className="text-[9px] font-normal tracking-normal text-faint/70">{windowLabel}</span>;
    }
    if (column.hint === "traders") {
      return (
        <Tooltip content="Wallets that bought or sold in this window, summed across the token's pools from provider buyer/seller counts. A wallet that did both is counted twice. Holder counts are not published by the pool APIs.">
          <Info className="h-2.5 w-2.5 cursor-help text-faint/60" aria-hidden="true" />
        </Tooltip>
      );
    }
    return null;
  };

  const headerCellClass = (column: ColumnDef, isActive: boolean) =>
    cn(
      HEADER_CELL,
      column.align === "right" ? "text-right" : "text-left",
      column.key === "rank" && "pl-3",
      column.key === "token" && "pl-2",
      column.key === "action" && "pr-3",
      (column.key === "rank" || column.key === "token") && "z-30",
      isActive && "bg-[#141414] text-fg",
    );

  return (
    <>
      <div
        className="hidden min-h-0 flex-1 overflow-auto overscroll-contain panel-scroll md:block md:max-h-[calc(100dvh-20rem)]"
        data-testid="screener-scroll"
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth }}
          aria-label="Token scanner"
        >
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => {
                const isActive = column.sortKey != null && column.sortKey === sortKey;
                const sticky = offsets.get(column.key);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={headerCellClass(column, isActive)}
                    aria-sort={column.sortKey ? ariaSort(column.sortKey) : undefined}
                    style={sticky == null ? undefined : { left: sticky }}
                  >
                    {column.sortKey ? (
                      <SortHeader
                        label={column.label}
                        sortKey={column.sortKey}
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={onSort}
                        align={column.align}
                        suffix={suffixFor(column)}
                      />
                    ) : (
                      <span className={cn("block", column.align === "right" ? "text-right" : "text-left")}>
                        {column.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="border-b border-[#1f1f1f] px-3 py-10 text-center text-xs text-faint">
                  {emptyMessage ?? "No rows match these filters."}
                </td>
              </tr>
            ) : (
              tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  rank={ranks.get(token.id) ?? null}
                  timeframe={timeframe}
                  onOpen={onOpen}
                  watched={watched.has(tokenKey(token))}
                  onToggleWatch={onToggleWatch}
                  columns={visible}
                />
              ))
            )}
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
            watched={watched.has(tokenKey(token))}
            onToggleWatch={onToggleWatch}
          />
        ))}
      </div>
    </>
  );
}
