import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const PAGE_BUTTON =
  "inline-flex h-6 w-6 items-center justify-center rounded-[3px] border border-border bg-panel text-faint transition-colors hover:border-border-strong hover:text-fg disabled:pointer-events-none disabled:opacity-35";

/**
 * Table footer: what is on screen, how much of it there is, and page controls.
 *
 * The range is printed from the real slice offsets so it can never claim a row
 * that is not rendered, and it is phrased in tokens ("coins") rather than
 * provider pools because the table above is one row per token.
 */
export function Pagination({
  page,
  pages,
  start,
  end,
  total,
  onPage,
  pageSize,
  noun = "coins",
}: {
  page: number;
  pages: number;
  start: number;
  end: number;
  total: number;
  onPage: (page: number) => void;
  pageSize?: number;
  noun?: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-9 flex-wrap items-center justify-between gap-2 border-t border-border bg-[#0f0f0f] px-3 text-[11px] text-faint">
      <span className="num">
        <span className="text-muted">
          {start + 1}–{end}
        </span>{" "}
        of {total} {noun}
        {pageSize ? <span className="text-border-strong"> · {pageSize} per page</span> : null}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="First page"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          className={PAGE_BUTTON}
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={PAGE_BUTTON}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="num px-1.5 text-muted">
          {page} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={PAGE_BUTTON}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Last page"
          disabled={page >= pages}
          onClick={() => onPage(pages)}
          className={PAGE_BUTTON}
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
