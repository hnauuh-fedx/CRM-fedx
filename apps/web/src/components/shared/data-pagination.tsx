import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PaginationInfo = {
  page: number;
  totalPages: number;
  total?: number;
  limit?: number;
};

type DataPaginationProps = {
  pagination: PaginationInfo;
  pageSize: number;
  pageSizeOptions?: number[];
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  ariaLabel?: string;
  showQuickJump?: boolean;
  showPageSize?: boolean;
  windowSize?: number;
};

const defaultPageSizeOptions = [10, 20, 30, 50, 100];
const defaultWindowSize = 6;

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildPageItems(current: number, total: number, windowSize: number): Array<number | "ellipsis"> {
  if (total <= 0) return [];
  if (total <= windowSize + 2) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);
  if (current - 1 <= half) {
    end = Math.min(total - 1, windowSize);
  }
  if (total - current <= half) {
    start = Math.max(2, total - windowSize);
  }
  const items: Array<number | "ellipsis"> = [1];
  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

export function DataPagination({
  pagination,
  pageSize,
  pageSizeOptions = defaultPageSizeOptions,
  isFetching = false,
  onPageChange,
  onPageSizeChange,
  className,
  ariaLabel = "Phân trang",
  showQuickJump = true,
  showPageSize = true,
  windowSize = defaultWindowSize,
}: DataPaginationProps) {
  const { page, totalPages, total, limit } = pagination;
  const safeTotalPages = Math.max(1, totalPages);
  const [jumpValue, setJumpValue] = useState<string>(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  if (safeTotalPages <= 0) return null;

  const pageItems = buildPageItems(page, safeTotalPages, windowSize);
  const isFirstPage = page <= 1;
  const isLastPage = page >= safeTotalPages;
  const effectivePageSize = pageSize ?? limit ?? 0;
  const canChangePageSize = Boolean(onPageSizeChange);
  const safePageSizeOptions = pageSizeOptions.includes(effectivePageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, effectivePageSize].sort((a, b) => a - b);

  function goToPage(next: number) {
    if (Number.isNaN(next)) return;
    const target = clamp(next, 1, safeTotalPages);
    if (target !== page && !isFetching) {
      onPageChange(target);
    }
  }

  function handleJumpInput(event: ChangeEvent<HTMLInputElement>) {
    setJumpValue(event.target.value.replace(/[^\d]/g, ""));
  }

  function handleJumpSubmit(event?: KeyboardEvent<HTMLInputElement>) {
    if (event) {
      event.preventDefault();
    }
    const parsed = Number(jumpValue);
    if (Number.isFinite(parsed)) {
      goToPage(parsed);
    }
  }

  function handlePageSizeChange(next: string) {
    if (!onPageSizeChange) return;
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed > 0) {
      onPageSizeChange(parsed);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-stretch justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center",
        className,
      )}
      aria-label={ariaLabel}
      role="navigation"
    >
      <p className="text-muted-foreground">
        Trang {page} / {safeTotalPages}
        {typeof total === "number" ? ` · ${total.toLocaleString("vi-VN")} bản ghi` : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFirstPage || isFetching}
          onClick={() => goToPage(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Trang trước</span>
        </Button>
        <div className="flex items-center gap-1" role="group" aria-label="Danh sách trang">
          {pageItems.map((item, index) => {
            if (item === "ellipsis") {
              const key = `ellipsis-${index}`;
              return (
                <span
                  key={key}
                  aria-hidden="true"
                  className="inline-flex h-8 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground"
                >
                  …
                </span>
              );
            }
            const isActive = item === page;
            return (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                disabled={isFetching}
                aria-current={isActive ? "page" : undefined}
                aria-label={`Trang ${item}`}
                className="min-w-9 px-2"
                onClick={() => goToPage(item)}
              >
                {item}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLastPage || isFetching}
          onClick={() => goToPage(page + 1)}
          aria-label="Trang sau"
        >
          <span className="sr-only sm:not-sr-only">Trang sau</span>
          <ChevronRight aria-hidden="true" />
        </Button>
        {showPageSize && canChangePageSize && (
          <FieldGroup className="flex flex-row items-center gap-2">
            <Field className="gap-1">
              <FieldLabel htmlFor="data-pagination-page-size" className="text-xs font-normal text-muted-foreground">
                Số bản ghi / trang
              </FieldLabel>
            </Field>
            <Select value={String(effectivePageSize)} onValueChange={handlePageSizeChange} disabled={isFetching}>
              <SelectTrigger id="data-pagination-page-size" size="sm" className="min-w-28" aria-label="Chọn số bản ghi trên mỗi trang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {safePageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} / trang
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FieldGroup>
        )}
        {showQuickJump && safeTotalPages > 1 && (
          <FieldGroup className="flex flex-row items-center gap-2">
            <Field className="gap-1">
              <FieldLabel htmlFor="data-pagination-jump" className="text-xs font-normal text-muted-foreground">
                Đến trang
              </FieldLabel>
            </Field>
            <Input
              id="data-pagination-jump"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              size={6}
              value={jumpValue}
              onChange={handleJumpInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleJumpSubmit(event);
                }
              }}
              onBlur={() => {
                const parsed = Number(jumpValue);
                if (Number.isFinite(parsed)) {
                  goToPage(parsed);
                } else {
                  setJumpValue(String(page));
                }
              }}
              disabled={isFetching}
              className="h-8 w-16 px-2 text-sm"
              aria-label="Đến trang"
            />
          </FieldGroup>
        )}
      </div>
    </div>
  );
}
