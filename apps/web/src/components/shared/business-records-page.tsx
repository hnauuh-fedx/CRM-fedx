import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useMemo, useReducer } from "react";

import { DataPagination } from "@/components/shared/data-pagination";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const defaultPageSize = 20;
const pageSizeOptions = [10, 20, 30, 50, 100];
const emptyFilters: FilterConfig[] = [];

type BusinessRecordsState<TSort extends string> = {
  page: number;
  pageSize: number;
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
  | { type: "setPage"; page: number }
  | { type: "setPageSize"; pageSize: number };

function businessRecordsReducer<TSort extends string>(
  state: BusinessRecordsState<TSort>,
  action: BusinessRecordsAction<TSort>,
): BusinessRecordsState<TSort> {
  switch (action.type) {
    case "setSearch":
      return { ...state, search: action.value };
    case "setFilter":
      return {
        ...state,
        filterValues: { ...state.filterValues, [action.key]: action.value },
      };
    case "applyFilters":
      return {
        ...state,
        page: 1,
        appliedSearch: state.search,
        appliedFilterValues: state.filterValues,
      };
    case "resetFilters":
      return {
        ...state,
        page: 1,
        pageSize: defaultPageSize,
        search: "",
        appliedSearch: "",
        filterValues: {},
        appliedFilterValues: {},
      };
    case "toggleSort":
      return {
        ...state,
        page: 1,
        sortBy: action.sortBy,
        sortOrder:
          state.sortBy === action.sortBy
            ? state.sortOrder === "asc"
              ? "desc"
              : "asc"
            : "desc",
      };
    case "setPage":
      return { ...state, page: action.page };
    case "setPageSize":
      return { ...state, page: 1, pageSize: action.pageSize };
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
    pageSize: defaultPageSize,
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
      state.pageSize,
      state.sortBy,
      state.sortOrder,
      state.appliedSearch,
      state.appliedFilterValues,
    ],
    queryFn: () =>
      fetchRecords(
        {
          page: state.page,
          limit: state.pageSize,
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
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        scopeLabel="Theo phạm vi truy cập"
        description={description}
      />

      <Card className="gap-3 border-border/70 py-4 shadow-xs">
        <CardHeader className="gap-0.5 px-4">
          <CardTitle>Bộ lọc dữ liệu</CardTitle>
          <CardDescription>
            Tìm kiếm và lọc dữ liệu theo tiêu chí nghiệp vụ.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "applyFilters" });
            }}
          >
            <FieldGroup className="grid gap-3 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor={`${queryKey}-search`}>Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={`${queryKey}-search`}
                    className="pl-9"
                    placeholder="Nhập từ khóa cần tìm"
                    value={state.search}
                    onChange={(event) =>
                      dispatch({ type: "setSearch", value: event.target.value })
                    }
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
                  onChange={(value) =>
                    dispatch({ type: "setFilter", key: filter.key, value })
                  }
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
        <CardHeader className="gap-0.5 border-b px-4 py-3 [.border-b]:pb-3">
          <CardTitle>{recordsLabel}</CardTitle>
          <CardDescription>
            {pagination
              ? `Hiển thị ${data.length} trong tổng số ${pagination.total} bản ghi`
              : "Đang lấy dữ liệu…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {query.isError ? (
            <ErrorState
              title="Không thể tải dữ liệu"
              description="Vui lòng thử lại để cập nhật danh sách."
              onReload={() => query.refetch()}
            />
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
                    <TableHead
                      key={column.key}
                      scope="col"
                      className="px-3 font-medium text-muted-foreground"
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            const sortableKey = column.sortable;
                            if (sortableKey) {
                              dispatch({ type: "toggleSort", sortBy: sortableKey });
                            }
                          }}
                        >
                          {column.label}
                          {state.sortBy === column.sortable ? (
                            state.sortOrder === "asc" ? (
                              <ArrowUp aria-hidden="true" />
                            ) : (
                              <ArrowDown aria-hidden="true" />
                            )
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
                      <TableCell key={column.key} className="px-2.5 py-2">
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
          <DataPagination
            pagination={{
              page: pagination.page,
              totalPages: pagination.totalPages,
              total: pagination.total,
              limit: pagination.limit,
            }}
            pageSize={state.pageSize}
            pageSizeOptions={pageSizeOptions}
            isFetching={query.isFetching}
            onPageChange={(nextPage) => dispatch({ type: "setPage", page: nextPage })}
            onPageSizeChange={(nextPageSize) => dispatch({ type: "setPageSize", pageSize: nextPageSize })}
          />
        )}
      </Card>
    </div>
  );
}

function formatCellValue(value: string | number | null) {
  return value == null || value === "" ? "-" : String(value);
}
