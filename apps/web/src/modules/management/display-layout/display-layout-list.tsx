import type { LayoutScreen } from "@admission-crm/shared/display-layout";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  LayoutDetail,
  LayoutList,
} from "@/services/display-layout.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { DisplayLayoutEditor } from "./display-layout-editor";

export function DisplayLayoutList({
  query,
  selected,
  page,
  onSelect,
  onPage,
}: {
  query: UseQueryResult<LayoutList, Error>;
  selected: string | null;
  page: number;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
}) {
  if (query.isError)
    return (
      <ErrorState
        title="Không tải được mẫu"
        description="Vui lòng thử lại."
        onReload={() => query.refetch()}
      />
    );
  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.data.map((item) => (
          <li key={item.id}>
            <Button
              type="button"
              variant={selected === item.id ? "secondary" : "outline"}
              className="h-auto w-full flex-wrap justify-start gap-2 p-4 text-left whitespace-normal"
              aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}
            >
              <span className="min-w-0 break-words">{item.draft.name}</span>
              <Badge variant="secondary">
                {item.publishedVersion
                  ? `Phiên bản ${item.publishedVersion}`
                  : "Nháp"}
              </Badge>
            </Button>
          </li>
        ))}
      </ul>
      {!query.data?.data.length && (
        <p className="text-sm text-muted-foreground">
          Chưa có mẫu phù hợp. Chọn Tạo mẫu để bắt đầu.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || query.isFetching}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </Button>
        <span className="text-sm">
          Trang {page}/{query.data?.totalPages ?? 1} · {query.data?.total ?? 0}{" "}
          mẫu
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            !query.data || page >= query.data.totalPages || query.isFetching
          }
          onClick={() => onPage(page + 1)}
        >
          Sau
        </Button>
      </div>
    </>
  );
}
export function SelectedDisplayLayout({
  selected,
  query,
  draftKey,
  screen,
}: {
  selected: string | null;
  query: UseQueryResult<LayoutDetail, Error>;
  draftKey: string;
  screen: LayoutScreen;
}) {
  if (!selected) return null;
  if (selected === "new")
    return (
      <DisplayLayoutEditor
        key={`${screen}-${draftKey}`}
        initial={null}
        screen={screen}
      />
    );
  if (query.isError)
    return (
      <ErrorState
        title="Không mở được mẫu"
        description={query.error.message}
        onReload={() => query.refetch()}
      />
    );
  if (query.isLoading) return <Skeleton className="h-80 w-full" />;
  if (!query.data) return null;
  return (
    <DisplayLayoutEditor
      key={`${query.data.id}-${query.data.revision}`}
      initial={query.data}
    />
  );
}
