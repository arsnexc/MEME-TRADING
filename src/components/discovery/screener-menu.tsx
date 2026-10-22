"use client";

import { useState } from "react";
import { Check, Download, MoreHorizontal, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { SCREENER_PAGE_SIZES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ScreenerColumn } from "@/stores/preferences";
import { SCREENER_TABLE_COLUMNS } from "./columns";

const MENU_BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-border bg-panel px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-fg";

/**
 * Display menu: page size, column visibility and CSV export.
 *
 * These are display controls only — nothing here changes what the provider
 * returns, and hiding a column never hides the row's data from the export.
 */
export function ScreenerMenu({
  pageSize,
  onPageSize,
  hiddenColumns,
  onToggleColumn,
  onResetColumns,
  onExport,
  exportDisabled,
  rowCount,
}: {
  pageSize: number;
  onPageSize: (size: number) => void;
  hiddenColumns: ScreenerColumn[];
  onToggleColumn: (column: ScreenerColumn) => void;
  onResetColumns: () => void;
  onExport: () => void;
  exportDisabled: boolean;
  rowCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Screener display options" className={MENU_BUTTON}>
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Display</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Rows per page</p>
        <Segmented
          size="xs"
          label="Rows per page"
          value={String(pageSize)}
          onChange={(value) => onPageSize(Number(value))}
          options={SCREENER_PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          className="w-full justify-between"
        />

        <div className="mt-2.5 flex items-center justify-between border-t border-border px-1 pb-1 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Columns</p>
          {hiddenColumns.length > 0 ? (
            <button
              type="button"
              onClick={onResetColumns}
              className="inline-flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-fg"
            >
              <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" /> Show all
            </button>
          ) : null}
        </div>
        {SCREENER_TABLE_COLUMNS.filter((column) => column.hideable).map(({ key, label }) => {
          const column = key as ScreenerColumn;
          const visible = !hiddenColumns.includes(column);
          return (
            <button
              key={column}
              type="button"
              role="menuitemcheckbox"
              aria-checked={visible}
              onClick={() => onToggleColumn(column)}
              className="flex h-7 w-full items-center gap-2 rounded-[3px] px-1 text-left text-[11px] text-muted transition-colors hover:bg-panel-2 hover:text-fg"
            >
              <span
                className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border",
                  visible ? "border-border-strong bg-panel-3" : "border-border bg-transparent",
                )}
                aria-hidden="true"
              >
                {visible ? <Check className="h-2.5 w-2.5 text-fg" /> : null}
              </span>
              {label}
            </button>
          );
        })}
        <p className="px-1 pb-0.5 pt-1 text-[10px] leading-relaxed text-faint">
          Rank, token and the buy action always stay visible.
        </p>

        <div className="mt-2 border-t border-border px-1 pt-2">
          <Tooltip content="Full-precision CSV of the filtered rows from every page, including columns that are hidden here.">
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              aria-label={`Download CSV of ${rowCount} rows`}
              className="flex h-7 w-full items-center gap-2 rounded-[3px] px-1 text-left text-[11px] text-muted transition-colors hover:bg-panel-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Download CSV
              <span className="num ml-auto text-[10px] text-faint">{rowCount} rows</span>
            </button>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
