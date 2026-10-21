import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
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
  getLeadActivities,
  getSaleFilterOptions,
} from "@/services/sale.service";
import { ActivityDialog } from "../components/activity-dialog";
import type {
  ActivityFilters,
  ActivityItem,
  ActivityListResponse,
  SaleFilterOptions,
} from "../sale.types";

const pageSize = 20;
const emptyFilters: ActivityFilters = { search: "", type: "", userId: "" };
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

export function SaleActivitiesPage() {
  const auth = useAuth();
  const canCreate = auth.can("lead_activity.create");
  const canUpdate = auth.can("lead_activity.update");
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["sale", "activities", page, pageSize, sortOrder, filters],
    queryFn: () =>
      getLeadActivities(
        { page, limit: pageSize, sortOrder, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "options"],
    queryFn: () => getSaleFilterOptions(auth.accessToken!),
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const table = useReactTable({
    data,
    columns: useColumns(canUpdate, optionsQuery.data, auth.accessToken!),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length
          ? [{ id: "createdAt", desc: next[0].desc }]
          : [{ id: "createdAt", desc: true }];
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
        title="Hoạt động"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi các hoạt động sale đã ghi nhận trên lead."
        actions={
          canCreate ? (
            <ActivityDialog
              leads={optionsQuery.data?.leads ?? []}
              accessToken={auth.accessToken!}
            />
          ) : undefined
        }
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

function useColumns(
  canUpdate: boolean,
  options: SaleFilterOptions | undefined,
  accessToken: string,
) {
  return useMemo<ColumnDef<ActivityItem>[]>(
    () => [
      { accessorKey: "type", header: "Loại hoạt động" },
      {
        id: "lead",
        header: "Lead",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lead
            ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})`
            : "-",
      },
      {
        id: "actor",
        header: "Người thực hiện",
        enableSorting: false,
        cell: ({ row }) => row.original.actor?.fullName ?? "Hệ thống",
      },
      {
        accessorKey: "content",
        header: "Nội dung",
        enableSorting: false,
        cell: ({ row }) => row.original.content ?? "-",
      },
      {
        accessorKey: "createdAt",
        header: "Thời điểm",
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) =>
          canUpdate && row.original.isManual ? (
            <ActivityDialog
              activity={row.original}
              leads={options?.leads ?? []}
              accessToken={accessToken}
            />
          ) : (
            "-"
          ),
      },
    ],
    [accessToken, canUpdate, options?.leads],
  );
}

type FiltersProps = {
  filters: ActivityFilters;
  options?: SaleFilterOptions;
  onChange: (field: keyof ActivityFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: FiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc hoạt động</CardTitle>
        <CardDescription>
          Tìm theo loại hoạt động, nội dung hoặc lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="activity-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="activity-search"
                  className="pl-9"
                  placeholder="Nhập nội dung, mã lead hoặc họ tên"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="activity-type"
              label="Loại hoạt động"
              value={filters.type}
              onChange={(value) => onChange("type", value)}
              options={(options?.activityTypes ?? []).map((type) => ({
                value: type,
                label: type,
              }))}
            />
            <FilterSelect
              id="activity-user"
              label="Người thực hiện"
              value={filters.userId}
              onChange={(value) => onChange("userId", value)}
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

type ResultsProps = {
  table: DataTable<ActivityItem>;
  data: ActivityItem[];
  pagination?: ActivityListResponse["pagination"];
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
        <CardTitle>Hoạt động sale</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} hoạt động`
            : "Đang lấy dữ liệu hoạt động…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải hoạt động sale"
            description="Vui lòng thử lại để cập nhật dữ liệu hoạt động."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải hoạt động sale" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có hoạt động phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm hoạt động cần kiểm tra."
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

function SortableTable({ table }: { table: DataTable<ActivityItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Danh sách hoạt động sale"
      className="min-w-260"
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
  pagination: ActivityListResponse["pagination"];
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
