import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type TablePaginationProps = {
  page: number;
  pagination: { page: number; totalPages: number };
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
  labels?: { previous: string; next: string };
  className?: string;
};

export function TablePagination({
  page,
  pagination,
  isFetching,
  onPrevious,
  onNext,
  labels = { previous: "Trang trước", next: "Trang sau" },
  className = "flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row",
}: TablePaginationProps) {
  return (
    <nav className={className} aria-label="Phân trang danh sách">
      <p className="text-muted-foreground">
        Trang {pagination.page} / {pagination.totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || isFetching}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden="true" />
          {labels.previous}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pagination.totalPages || isFetching}
          onClick={onNext}
        >
          {labels.next}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
