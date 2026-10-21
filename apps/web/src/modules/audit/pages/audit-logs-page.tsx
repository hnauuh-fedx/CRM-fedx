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
import { Eye, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/modules/auth/auth-context";
import {
  getAuditLogDetail,
  getAuditLogFilterOptions,
  getAuditLogs,
} from "@/services/audit-log.service";
import type {
  AuditLogDetail,
  AuditLogFilterOptions,
  AuditLogListFilters,
  AuditLogListItem,
  AuditLogListResponse,
  AuditLogSortField,
} from "../audit-log.types";

const pageSize = 20;
const emptyFilters: AuditLogListFilters = {
  search: "",
  action: "",
  entityType: "",
  userId: "",
  fromDate: "",
  toDate: "",
};
const sortableColumns = new Set<AuditLogSortField>([
  "createdAt",
  "action",
  "entityType",
]);
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const entityLabels: Record<string, string> = {
  admission_profile: "Hồ sơ tuyển sinh",
  campaign: "Chiến dịch",
  lead: "Lead",
  lead_activity: "Hoạt động lead",
  major: "Ngành",
  marketing_form: "Biểu mẫu marketing",
  reminder: "Nhắc việc",
  role: "Vai trò",
  student: "Sinh viên",
  student_service: "Dịch vụ sinh viên",
  user: "Người dùng",
};
const actionLabels: Record<string, string> = {
  assign: "Phân công",
  create: "Tạo mới",
  create_from_admission: "Tạo sinh viên từ hồ sơ",
  delete: "Xóa",
  login: "Đăng nhập",
  seed_director_access: "Gán quyền giám đốc",
  update: "Cập nhật",
  update_academic_info: "Cập nhật học vụ",
};

function displayEntity(value: string) {
  return entityLabels[value] ?? value;
}

function displayAction(value: string) {
  return actionLabels[value] ?? value;
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

function formatPayload(value: unknown) {
  if (value == null) return "Không có dữ liệu";
  return JSON.stringify(value, null, 2);
}

export function AuditLogsPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as AuditLogSortField)
    ? (selectedSort.id as AuditLogSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: [
      "audit-logs",
      "list",
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters,
    ],
    queryFn: () =>
      getAuditLogs(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["audit-logs", "options"],
    queryFn: () => getAuditLogFilterOptions(auth.accessToken!),
  });
  const detailQuery = useQuery({
    queryKey: ["audit-logs", "detail", selectedAuditId],
    queryFn: () => getAuditLogDetail(selectedAuditId!, auth.accessToken!),
    enabled: Boolean(selectedAuditId),
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const table = useReactTable({
    data,
    columns: useAuditLogColumns({ onOpenDetail: setSelectedAuditId }),
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
    <PageLoadingBoundary variant="list" queries={[listQuery, optionsQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Giám sát hệ thống"
        title="Nhật ký hệ thống"
        scopeLabel="Quyền audit"
        description="Theo dõi hành động nghiệp vụ, lọc nâng cao và xem payload đã được kiểm soát dữ liệu nhạy cảm."
      />
      <AuditLogFilters
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
      <AuditLogResults
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
      <AuditLogDetailDialog
        open={Boolean(selectedAuditId)}
        detail={detailQuery.data}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        onReload={() => detailQuery.refetch()}
        onClose={() => setSelectedAuditId(null)}
      />
    </div>
    </PageLoadingBoundary>
  );
}

function useAuditLogColumns({
  onOpenDetail,
}: {
  onOpenDetail: (id: string) => void;
}) {
  return useMemo<ColumnDef<AuditLogListItem>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Thời điểm",
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "action",
        header: "Hành động",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {displayAction(row.original.action)}
          </Badge>
        ),
      },
      {
        accessorKey: "entityType",
        header: "Đối tượng",
        cell: ({ row }) => displayEntity(row.original.entityType),
      },
      {
        id: "entityId",
        header: "Mã tham chiếu",
        enableSorting: false,
        cell: ({ row }) => row.original.entityId ?? "-",
      },
      {
        id: "actor",
        header: "Người thực hiện",
        enableSorting: false,
        cell: ({ row }) => row.original.actor?.fullName ?? "Hệ thống",
      },
      {
        id: "actions",
        header: "Chi tiết",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenDetail(row.original.id)}
          >
            <Eye aria-hidden="true" />
            Xem
          </Button>
        ),
      },
    ],
    [onOpenDetail],
  );
}

type FilterProps = {
  filters: AuditLogListFilters;
  options?: AuditLogFilterOptions;
  onChange: (field: keyof AuditLogListFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function AuditLogFilters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: FilterProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc nhật ký</CardTitle>
        <CardDescription>
          Tìm theo người thực hiện, đối tượng, hành động và khoảng thời gian.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(5,minmax(150px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="audit-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="audit-search"
                  className="pl-9"
                  placeholder="Hành động, đối tượng hoặc mã tham chiếu"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="audit-user"
              label="Người thực hiện"
              value={filters.userId}
              onChange={(value) => onChange("userId", value)}
              options={(options?.users ?? []).map((user) => ({
                value: user.id,
                label: user.fullName,
              }))}
            />
            <FilterSelect
              id="audit-action"
              label="Hành động"
              value={filters.action}
              onChange={(value) => onChange("action", value)}
              options={(options?.actions ?? []).map((action) => ({
                value: action,
                label: displayAction(action),
              }))}
            />
            <FilterSelect
              id="audit-entity"
              label="Đối tượng"
              value={filters.entityType}
              onChange={(value) => onChange("entityType", value)}
              options={(options?.entityTypes ?? []).map((entity) => ({
                value: entity,
                label: displayEntity(entity),
              }))}
            />
            <Field className="gap-2">
              <FieldLabel htmlFor="audit-from-date">Từ thời điểm</FieldLabel>
              <Input
                id="audit-from-date"
                type="datetime-local"
                value={filters.fromDate}
                onChange={(event) => onChange("fromDate", event.target.value)}
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="audit-to-date">Đến thời điểm</FieldLabel>
              <Input
                id="audit-to-date"
                type="datetime-local"
                value={filters.toDate}
                onChange={(event) => onChange("toDate", event.target.value)}
              />
            </Field>
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
  table: DataTable<AuditLogListItem>;
  data: AuditLogListItem[];
  pagination?: AuditLogListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function AuditLogResults(props: ResultsProps) {
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
        <CardTitle>Sự kiện đã ghi nhận</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} sự kiện`
            : "Đang lấy nhật ký hệ thống..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải nhật ký hệ thống"
            description="Vui lòng thử lại để cập nhật nhật ký."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải nhật ký hệ thống" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có sự kiện phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm sự kiện cần kiểm tra."
          />
        ) : (
          <SortableTable table={table} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <TablePagination
          page={page}
          pagination={pagination}
          isFetching={isFetching}
          className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"
          labels={{ previous: "Trang trước", next: "Trang sau" }}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<AuditLogListItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Nhật ký hệ thống"
      className="min-w-260"
    />
  );
}

function AuditLogDetailDialog({
  open,
  detail,
  isLoading,
  isError,
  onReload,
  onClose,
}: {
  open: boolean;
  detail?: AuditLogDetail;
  isLoading: boolean;
  isError: boolean;
  onReload: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Chi tiết nhật ký</DialogTitle>
          <DialogDescription>
            {detail
              ? `${displayAction(detail.action)} - ${displayEntity(detail.entityType)}`
              : "Đang tải chi tiết nhật ký..."}
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <ErrorState
            title="Không thể tải chi tiết nhật ký"
            description="Vui lòng thử lại để xem payload đã kiểm soát."
            onReload={onReload}
          />
        ) : isLoading || !detail ? (
          <TableLoadingState label="Đang tải chi tiết nhật ký" />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
              <DetailItem
                label="Thời điểm"
                value={formatDateTime(detail.createdAt)}
              />
              <DetailItem
                label="Người thực hiện"
                value={detail.actor?.fullName ?? "Hệ thống"}
              />
              <DetailItem
                label="Đối tượng"
                value={displayEntity(detail.entityType)}
              />
              <DetailItem
                label="Hành động"
                value={displayAction(detail.action)}
              />
              <DetailItem label="Mã tham chiếu" value={detail.entityId} />
              <DetailItem label="Địa chỉ IP" value={detail.ipAddress} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <PayloadBlock title="Dữ liệu cũ" value={detail.oldData} />
              <PayloadBlock title="Dữ liệu mới" value={detail.newData} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 wrap-break-word text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

function PayloadBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0 rounded-md border">
      <h3 className="border-b px-4 py-3 text-sm font-semibold">{title}</h3>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word p-4 text-xs leading-5 text-muted-foreground">
        {formatPayload(value)}
      </pre>
    </section>
  );
}
