import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/modules/auth/auth-context";
import {
  getLeadSourceFilterOptions,
  getLeadSources,
} from "@/services/marketing-reference.service";
import type {
  LeadSourceFilterOptions,
  LeadSourceFilters,
  LeadSourceItem,
  LeadSourceListResponse,
  LeadSourceSortField,
} from "../marketing-reference.types";

const pageSize = 20;
const emptyFilters: LeadSourceFilters = { search: "", type: "" };
const sortableColumns = new Set<LeadSourceSortField>([
  "createdAt",
  "name",
  "type",
]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function LeadSourcesPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as LeadSourceSortField)
    ? (selectedSort.id as LeadSourceSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: [
      "lead-sources",
      "list",
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters,
    ],
    queryFn: () =>
      getLeadSources(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["lead-sources", "options"],
    queryFn: () => getLeadSourceFilterOptions(auth.accessToken!),
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const table = useReactTable({
    data,
    columns: useColumns(),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length
          ? next.slice(0, 1)
          : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Nguồn lead"
        scopeLabel="Toàn hệ thống"
        description="Theo dõi các nguồn phát sinh lead và số lead đang hoạt động theo từng nguồn."
      />
      <LeadSourceFilters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
        onApply={() => {
          setFilters(draftFilters);
          setPage(1);
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setPage(1);
        }}
      />
      <Results
        table={table}
        data={data}
        pagination={listQuery.data?.pagination}
        page={page}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onReload={() => listQuery.refetch()}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    </div>
  );
}

function useColumns() {
  return useMemo<ColumnDef<LeadSourceItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nguồn lead",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "type",
        header: "Loại",
        cell: ({ row }) => row.original.type ?? "-",
      },
      {
        id: "institutionProgram",
        header: "Chương trình",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.institutionProgram
            ? `${row.original.institutionProgram.institutionName} / ${row.original.institutionProgram.name}`
            : "Dùng chung",
      },
      {
        accessorKey: "activeLeadCount",
        header: "Lead đang hoạt động",
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: "Ngày tạo",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
    ],
    [],
  );
}

type LeadSourceFiltersProps = {
  filters: LeadSourceFilters;
  options?: LeadSourceFilterOptions;
  onChange: (field: keyof LeadSourceFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function LeadSourceFilters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: LeadSourceFiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc nguồn lead</CardTitle>
        <CardDescription>Tìm theo tên nguồn hoặc loại nguồn.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(250px,2fr)_minmax(170px,1fr)_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="lead-source-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="lead-source-search"
                  className="pl-9"
                  placeholder="Nhập tên nguồn lead"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="lead-source-type"
              label="Loại nguồn"
              value={filters.type}
              onChange={(value) => onChange("type", value)}
              options={(options?.types ?? []).map((type) => ({
                value: type,
                label: type,
              }))}
            />
            <AutoFilterActions
              snapshot={filters}
              onApply={onApply}
              onReset={onReset}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type ResultsProps = {
  table: DataTable<LeadSourceItem>;
  data: LeadSourceItem[];
  pagination?: LeadSourceListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function Results(props: ResultsProps) {
  const {
    table,
    data,
    pagination,
    page,
    isLoading,
    isError,
    isFetching,
    onReload,
    onPrevious,
    onNext,
  } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Nguồn lead</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} nguồn`
            : "Đang lấy dữ liệu nguồn lead…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải nguồn lead"
            description="Vui lòng thử lại để cập nhật dữ liệu nguồn lead."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải nguồn lead" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có nguồn lead phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm nguồn cần theo dõi."
          />
        ) : (
          <SortableTable table={table} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <Pager
          page={page}
          pagination={pagination}
          isFetching={isFetching}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<LeadSourceItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Danh sách nguồn lead"
      className="min-w-180"
    />
  );
}

function Pager({
  page,
  pagination,
  isFetching,
  onPrevious,
  onNext,
}: {
  page: number;
  pagination: LeadSourceListResponse["pagination"];
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <TablePagination
      page={page}
      pagination={pagination}
      isFetching={isFetching}
      className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"
      labels={{ previous: "Trang trước", next: "Trang sau" }}
      onPrevious={onPrevious}
      onNext={onNext}
    />
  );
}
