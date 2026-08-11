import { useMemo, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import type {
  BusinessRecord,
  BusinessRecordListParams,
  BusinessRecordListResponse,
} from "./business-records.types";

type Column<TSort extends string> = {
  key: string;
  label: string;
  sortable?: TSort;
  format?: (value: string | number | null, row: BusinessRecord) => string;
};

type FilterConfig = {
  key: "status" | "type";
  label: string;
  options: Array<{ value: string; label: string }>;
};

type BusinessRecordsPageProps<TSort extends string> = {
  eyebrow: string;
  title: string;
  description: string;
  recordsLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  queryKey: string;
  defaultSortBy: TSort;
  columns: Column<TSort>[];
  filters?: FilterConfig[];
  fetchRecords: (
    params: BusinessRecordListParams<TSort>,
    accessToken: string,
  ) => Promise<BusinessRecordListResponse<TSort>>;
};

const pageSize = 20;
const emptyFilters: FilterConfig[] = [];

type BusinessRecordsState<TSort extends string> = {
  page: number;
  search: string;
  appliedSearch: string;
  filterValues: Record<string, string>;
  appliedFilterValues: Record<string, string>;
  sortBy: TSort;
  sortOrder: "asc" | "desc";
};

type BusinessRecordsAction<TSort extends string> =
  | { type: "setSearch"; value: string }
  | { type: "setFilter"; key: string; value: string }
  | { type: "applyFilters" }
  | { type: "resetFilters" }
  | { type: "toggleSort"; sortBy: TSort }
  | { type: "setPage"; page: number };

function businessRecordsReducer<TSort extends string>(
  state: BusinessRecordsState<TSort>,
  action: BusinessRecordsAction<TSort>,
): BusinessRecordsState<TSort> {
  switch (action.type) {
    case "setSearch":
      return { ...state, search: action.value };
    case "setFilter":
      return { ...state, filterValues: { ...state.filterValues, [action.key]: action.value } };
    case "applyFilters":
      return {
        ...state,
        page: 1,
        appliedSearch: state.search,
        appliedFilterValues: state.filterValues,
      };
    case "resetFilters":
      return { ...state, page: 1, search: "", appliedSearch: "", filterValues: {}, appliedFilterValues: {} };
    case "toggleSort":
      return {
        ...state,
        page: 1,
        sortBy: action.sortBy,
        sortOrder:
          state.sortBy === action.sortBy ? (state.sortOrder === "asc" ? "desc" : "asc") : "desc",
      };
    case "setPage":
      return { ...state, page: action.page };
    default:
      return state;
  }
}

export function BusinessRecordsPage<TSort extends string>({
  eyebrow,
  title,
  description,
  recordsLabel,
  emptyTitle,
  emptyDescription,
  queryKey,
  defaultSortBy,
  columns,
  filters = emptyFilters,
  fetchRecords,
}: BusinessRecordsPageProps<TSort>) {
  const auth = useAuth();
  const [state, dispatch] = useReducer(businessRecordsReducer<TSort>, {
    page: 1,
    search: "",
    appliedSearch: "",
    filterValues: {},
    appliedFilterValues: {},
    sortBy: defaultSortBy,
    sortOrder: "desc",
  });
  const query = useQuery({
    queryKey: [
      queryKey,
      state.page,
      pageSize,
      state.sortBy,
      state.sortOrder,
      state.appliedSearch,
      state.appliedFilterValues,
    ],
    queryFn: () =>
      fetchRecords(
        {
          page: state.page,
          limit: pageSize,
          search: state.appliedSearch,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
          status: state.appliedFilterValues.status ?? "",
          type: state.appliedFilterValues.type ?? "",
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  const displayColumns = useMemo(() => columns, [columns]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} scopeLabel="Theo phạm vi truy cập" description={description} />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc dữ liệu</CardTitle>
          <CardDescription>Tìm kiếm và lọc dữ liệu theo tiêu chí nghiệp vụ.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "applyFilters" });
            }}
          >
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor={`${queryKey}-search`}>Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id={`${queryKey}-search`}
                    className="pl-9"
                    placeholder="Nhập từ khóa cần tìm"
                    value={state.search}
                    onChange={(event) => dispatch({ type: "setSearch", value: event.target.value })}
                  />
                </div>
              </Field>
              {filters.map((filter) => (
                <FilterSelect
                  key={filter.key}
                  id={`${queryKey}-${filter.key}`}
                  label={filter.label}
                  value={state.filterValues[filter.key] ?? ""}
                  options={filter.options}
                  onChange={(value) => dispatch({ type: "setFilter", key: filter.key, value })}
                />
              ))}
              <div className="flex items-end gap-2">
                <Button type="submit">Áp dụng</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => dispatch({ type: "resetFilters" })}
                >
                  Xóa lọc
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>{recordsLabel}</CardTitle>
          <CardDescription>
            {pagination
              ? `Hiển thị ${data.length} trong tổng số ${pagination.total} bản ghi`
              : "Đang lấy dữ liệu…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {query.isError ? (
            <ErrorState title="Không thể tải dữ liệu" description="Vui lòng thử lại để cập nhật danh sách." onReload={() => query.refetch()} />
          ) : query.isLoading ? (
            <TableLoadingState label="Đang tải dữ liệu" />
          ) : data.length === 0 ? (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          ) : (
            <Table className="min-w-220">
              <caption className="sr-only">{recordsLabel}</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  {displayColumns.map((column) => (
                    <TableHead key={column.key} scope="col" className="px-5 font-medium text-muted-foreground">
                      {column.sortable ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            dispatch({ type: "toggleSort", sortBy: column.sortable });
                          }}
                        >
                          {column.label}
                          {state.sortBy === column.sortable ? (
                            state.sortOrder === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        column.label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    {displayColumns.map((column) => (
                      <TableCell key={column.key} className="px-5 py-4">
                        {column.format ? column.format(row[column.key], row) : formatCellValue(row[column.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
            <p className="text-muted-foreground">
              Trang {pagination.page} / {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={state.page <= 1 || query.isFetching}
                onClick={() => dispatch({ type: "setPage", page: Math.max(1, state.page - 1) })}
              >
                <ChevronLeft aria-hidden="true" />
                Trang trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={state.page >= pagination.totalPages || query.isFetching}
                onClick={() => dispatch({ type: "setPage", page: state.page + 1 })}
              >
                Trang sau
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatCellValue(value: string | number | null) {
  return value == null || value === "" ? "-" : String(value);
}
