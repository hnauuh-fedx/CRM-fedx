import { useEffect, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PageSkeletonVariant =
  | "list"
  | "lead-list"
  | "detail"
  | "dashboard"
  | "settings"
  | "cards"
  | "builder"
  | "public-form"
  | "session";

type PageLoadingStateProps = {
  variant?: PageSkeletonVariant;
  label?: string;
  className?: string;
};

function HeaderSkeleton() {
  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full sm:w-80" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-32 shrink-0" />
    </div>
  );
}

function FilterSkeleton() {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((field) => (
        <div key={field} className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
      <Skeleton className="h-5 w-48 max-w-full" />
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((cell) => (
            <Skeleton key={cell} className={cn("h-9 w-full", cell > 2 && "hidden sm:block")} />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-xl border bg-card p-5 sm:p-6">
      <Skeleton className="h-6 w-48 max-w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((field) => (
          <div key={field} className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-32 self-end" />
    </div>
  );
}

/** Shared by route chunk fallbacks and the first data load of each page. */
export function PageLoadingState({
  variant = "list",
  label = "Đang tải nội dung trang",
  className,
}: PageLoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-page-skeleton={variant}
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6",
        variant === "lead-list" && "max-w-400",
        variant === "detail" && "max-w-400",
        variant === "public-form" && "max-w-3xl rounded-2xl bg-background p-5 sm:p-8",
        variant === "session" && "max-w-md rounded-xl border bg-card p-6",
        variant === "builder" && "h-dvh max-w-none overflow-hidden p-4 sm:p-6",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-6">
        <HeaderSkeleton />
        {variant === "session" ? (
          <Skeleton className="h-24 w-full" />
        ) : variant === "builder" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <Skeleton className="h-full min-h-64 w-full" />
            <div className="hidden lg:block"><FormSkeleton /></div>
          </div>
        ) : variant === "settings" || variant === "public-form" ? (
          <>
            {variant === "settings" && <Skeleton className="h-10 w-full max-w-md" />}
            <FormSkeleton />
          </>
        ) : variant === "detail" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <FormSkeleton />
            <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
              <Skeleton className="h-10 w-full" />
              {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-20 w-full" />)}
            </div>
          </div>
        ) : variant === "cards" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((card) => <Skeleton key={card} className="h-64 w-full" />)}
          </div>
        ) : variant === "dashboard" ? (
          <>
            <FilterSkeleton />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((card) => <Skeleton key={card} className="h-32 w-full" />)}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          </>
        ) : (
          <>
            {variant === "lead-list" && <Skeleton className="h-36 w-full" />}
            <FilterSkeleton />
            <TableSkeleton />
          </>
        )}
      </div>
    </div>
  );
}

export type PageLoadingQuery = {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
};

export function SessionLoadingState() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <PageLoadingState variant="session" label="Đang tải phiên đăng nhập" />
    </main>
  );
}

/** Only replace the whole page until its first result (or error) is displayed.
 * Later query-key changes keep filters, dialogs and keyboard focus mounted.
 * Disabled queries have isLoading=false and never hold this boundary open.
 */
export function PageLoadingBoundary({
  queries,
  children,
  ...props
}: PageLoadingStateProps & { queries: readonly PageLoadingQuery[]; children: ReactNode }) {
  const loading = !queries.some((query) => query.isError) &&
    queries.some((query) => query.isLoading && query.data === undefined);
  const [hasDisplayedContent, setHasDisplayedContent] = useState(!loading);

  useEffect(() => {
    if (!loading) setHasDisplayedContent(true);
  }, [loading]);

  return loading && !hasDisplayedContent ? <PageLoadingState {...props} /> : children;
}
