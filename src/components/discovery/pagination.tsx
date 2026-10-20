import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_BUTTON =
  "inline-flex h-6 w-6 items-center justify-center rounded-[3px] border border-border bg-panel text-faint transition-colors hover:border-border-strong hover:text-fg disabled:pointer-events-none disabled:opacity-35";

export function Pagination({
  page,
  pages,
  start,
  end,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  start: number;
  end: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-9 flex-wrap items-center justify-between gap-2 border-t border-border px-3 text-[11px] text-faint">
      <span className="num">
        <span className="text-muted">{start + 1}–{end}</span> of {total} pools
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={PAGE_BUTTON}>
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="num px-1 text-muted">
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
      </div>
    </div>
  );
}
