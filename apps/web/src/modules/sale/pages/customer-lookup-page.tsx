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
import { Link } from "react-router-dom";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { TablePagination } from "@/components/shared/table-pagination";
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
  getCustomerLookup,
  getCustomerLookupOptions,
} from "@/services/sale.service";
import type {
  CustomerLookupFilters,
  CustomerLookupItem,
  CustomerLookupOptions,
  CustomerLookupResponse,
  CustomerLookupSortBy,
  CustomerLookupType,
} from "../sale.types";

const pageSize = 20;
const emptyItems: CustomerLookupItem[] = [];
const emptyFilters: CustomerLookupFilters = {
  search: "",
  type: "all",
  sourceId: "",
  assigneeId: "",
};
const defaultSorting: SortingState = [{ id: "createdAt", desc: true }];
const sortableColumns = new Set<string>(["fullName", "createdAt", "updatedAt"]);
const typeOptions: Array<{ value: CustomerLookupType; label: string }> = [
  { value: "candidates", label: "Ứng viên" },
  { value: "students", label: "Học viên" },
];
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function CustomerLookupPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const sortBy = (sorting[0]?.id ?? "createdAt") as CustomerLookupSortBy;
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["sale", "customer-lookup", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () =>
      getCustomerLookup(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "customer-lookup", "options"],
    queryFn: () => getCustomerLookupOptions(auth.accessToken!),
  });
  const data = listQuery.data?.data ?? emptyItems;
  const columns = useColumns();
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length && sortableColumns.has(next[0].id) ? [next[0]] : defaultSorting;
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery, optionsQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeader
          eyebrow="CRM Sale"
          title="Tra cứu khách hàng"
          scopeLabel="Toàn hệ thống"
          description="Tra cứu toàn bộ ứng viên và học viên để biết khách hàng đã tồn tại và ai đang phụ trách."
        />
        <Filters
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
    </PageLoadingBoundary>
  );
}

function useColumns() {
  return useMemo<ColumnDef<CustomerLookupItem>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Họ tên",
        cell: ({ row }) => <NameCell item={row.original} />,
      },
      {
        id: "assignee",
        header: "Nhân viên phụ trách",
        enableSorting: false,
        cell: ({ row }) => row.original.assignee?.fullName ?? "Chưa phân công",
      },
      {
        id: "source",
        header: "Nguồn HV",
        enableSorting: false,
        cell: ({ row }) => row.original.source?.name ?? "-",
      },
      {
        accessorKey: "createdAt",
        header: "Ngày tạo",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        accessorKey: "updatedAt",
        header: "Ngày cập nhật",
        cell: ({ row }) => formatDate(row.original.updatedAt),
      },
    ],
    [],
  );
}

function NameCell({ item }: { item: CustomerLookupItem }) {
  if (!item.canOpenDetail) {
    return <span className="block min-w-48 font-medium">{item.fullName}</span>;
  }
  const basePath = item.type === "student" ? "/sale/students" : "/sale/leads";
  return (
    <Link
      to={`${basePath}/${item.id}`}
      className="block min-w-48 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Xem chi tiết ${item.fullName}`}
    >
      {item.fullName}
    </Link>
  );
}

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: {
  filters: CustomerLookupFilters;
  options?: CustomerLookupOptions;
  onChange: (field: keyof CustomerLookupFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc tra cứu</CardTitle>
        <CardDescription>
          Tìm theo họ tên, số điện thoại hoặc email của khách hàng.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(240px,2fr)_repeat(3,minmax(160px,1fr))_auto]">
            <Field className="gap-2 md:col-span-2 lg:col-span-1">
              <FieldLabel htmlFor="customer-lookup-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="customer-lookup-search"
                  type="search"
                  className="pl-9"
                  placeholder="Nhập họ tên, số điện thoại hoặc email"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="customer-lookup-type"
              label="Loại khách hàng"
              value={filters.type === "all" ? "" : filters.type}
              onChange={(value) => onChange("type", value || "all")}
              options={typeOptions}
            />
            <FilterSelect
              id="customer-lookup-source"
              label="Nguồn HV"
              value={filters.sourceId}
              onChange={(value) => onChange("sourceId", value)}
              options={(options?.sources ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <FilterSelect
              id="customer-lookup-assignee"
              label="Nhân viên phụ trách"
              value={filters.assigneeId}
              onChange={(value) => onChange("assigneeId", value)}
              options={(options?.assignees ?? []).map((item) => ({
                value: item.id,
                label: item.fullName,
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

function Results({
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
}: {
  table: DataTable<CustomerLookupItem>;
  data: CustomerLookupItem[];
  pagination?: CustomerLookupResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Danh sách khách hàng</CardTitle>
        <CardDescription aria-live="polite">
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} khách hàng`
            : "Đang lấy dữ liệu khách hàng…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải danh sách khách hàng"
            description="Vui lòng thử lại để cập nhật kết quả tra cứu."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải danh sách khách hàng" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Không tìm thấy khách hàng phù hợp"
            description="Kiểm tra lại từ khóa hoặc điều chỉnh bộ lọc."
          />
        ) : (
          <ServerDataTable
            table={table}
            caption="Kết quả tra cứu khách hàng"
            className="min-w-200"
          />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <TablePagination
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
