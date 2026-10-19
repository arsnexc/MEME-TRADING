import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-1.5 text-2xs text-faint">
      <span className="num">
        Showing {start + 1}–{end} of {total} pools
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="num px-1 text-muted">
          {page} / {pages}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
