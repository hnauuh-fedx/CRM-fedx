import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import { Eye, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { assignLead as assignLeadToTelesale } from "@/services/lead.service";
import {
  getLeadAssignments,
  getSaleFilterOptions,
} from "@/services/sale.service";
import type {
  AssignmentFilters,
  AssignmentItem,
  AssignmentListResponse,
  AssignmentStatus,
  SaleFilterOptions,
} from "../sale.types";

const pageSize = 20;
const emptyAssignments: AssignmentItem[] = [];
const emptyTelesales: SaleFilterOptions["telesales"] = [];
const emptyFilters: AssignmentFilters = {
  search: "",
  assigneeId: "",
  sourceId: "",
};
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function LeadAssignmentsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [status, setStatus] = useState<AssignmentStatus>("unassigned");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "assignedAt", desc: true },
  ]);
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: [
      "sale",
      "assignments",
      status,
      page,
      pageSize,
      sortOrder,
      filters,
    ],
    queryFn: () =>
      getLeadAssignments(
        { page, limit: pageSize, sortOrder, status, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "options"],
    queryFn: () => getSaleFilterOptions(auth.accessToken!),
  });
  const assignmentMutation = useMutation({
    mutationFn: ({
      leadId,
      assigneeId,
    }: {
      leadId: string;
      assigneeId: string;
    }) => assignLeadToTelesale(leadId, { assigneeId }, auth.accessToken!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sale", "assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["sale", "options"] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
    },
  });
  const data = listQuery.data?.data ?? emptyAssignments;
  const onAssign = useCallback(
    (leadId: string, assigneeId: string) => {
      assignmentMutation.mutate({ leadId, assigneeId });
    },
    [assignmentMutation.mutate],
  );
  const columns = useColumns({
    status,
    telesales: optionsQuery.data?.telesales ?? emptyTelesales,
    assigningLeadId: assignmentMutation.isPending
      ? assignmentMutation.variables?.leadId
      : undefined,
    onAssign,
  });
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length
          ? [{ id: "assignedAt", desc: next[0].desc }]
          : [{ id: "assignedAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sale"
        title="Phân công lead"
        scopeLabel="Toàn hệ thống"
        description="Theo dõi các lượt phân công lead theo nhân viên và nguồn học viên."
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
      {assignmentMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {assignmentMutation.error instanceof ApiError
            ? assignmentMutation.error.message
            : "Không thể phân công Sale phụ trách. Vui lòng thử lại."}
        </p>
      )}
      <Results
        status={status}
        table={table}
        data={data}
        pagination={listQuery.data?.pagination}
        page={page}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onStatusChange={(nextStatus) => {
          setStatus(nextStatus);
          setPage(1);
        }}
        onReload={() => listQuery.refetch()}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    </div>
  );
}

function useColumns({
  status,
  telesales,
  assigningLeadId,
  onAssign,
}: {
  status: AssignmentStatus;
  telesales: SaleFilterOptions["telesales"];
  assigningLeadId?: string;
  onAssign: (leadId: string, assigneeId: string) => void;
}) {
  return useMemo<ColumnDef<AssignmentItem>[]>(
    () => [
      {
        id: "lead",
        header: "Lead",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lead ? <LeadCell item={row.original} /> : "-",
      },
      {
        id: "assignee",
        header: "Nhân viên",
        enableSorting: false,
        cell: ({ row }) =>
          status === "unassigned" ? (
            <InlineAssigneeSelect
              item={row.original}
              telesales={telesales}
              isPending={assigningLeadId === row.original.lead?.id}
              onAssign={onAssign}
            />
          ) : (
            (row.original.assignee?.fullName ?? "-")
          ),
      },
      {
        id: "source",
        header: "Nguồn HV",
        enableSorting: false,
        cell: ({ row }) => row.original.source?.name ?? "-",
      },
      {
        id: "assignedBy",
        header: "Người phân công",
        enableSorting: false,
        cell: ({ row }) => row.original.assignedBy?.fullName ?? "Hệ thống",
      },
      {
        id: "owner",
        header: "Vai trò",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="secondary">
            {status === "unassigned"
              ? "Chưa phân công"
              : row.original.isMainOwner
                ? "Phụ trách chính"
                : "Phối hợp"}
          </Badge>
        ),
      },
      {
        accessorKey: "assignedAt",
        header: "Ngày phân công",
        cell: ({ row }) => formatDate(row.original.assignedAt),
      },
    ],
    [assigningLeadId, onAssign, status, telesales],
  );
}

function LeadCell({ item }: { item: AssignmentItem }) {
  if (!item.lead) {
    return "-";
  }

  return (
    <div className="flex min-w-56 items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="size-9 shrink-0">
        <Link
          to={`/sale/leads/${item.lead.id}`}
          aria-label={`Xem chi tiết ${item.lead.fullName}`}
        >
          <Eye aria-hidden="true" />
        </Link>
      </Button>
      <div className="min-w-0">
        <p className="truncate font-medium">{item.lead.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.lead.leadCode ?? "Chưa có mã"}
        </p>
      </div>
    </div>
  );
}

function InlineAssigneeSelect({
  item,
  telesales,
  isPending,
  onAssign,
}: {
  item: AssignmentItem;
  telesales: SaleFilterOptions["telesales"];
  isPending: boolean;
  onAssign: (leadId: string, assigneeId: string) => void;
}) {
  const lead = item.lead;
  if (!lead) return "-";
  return (
    <Select
      value="__placeholder__"
      disabled={isPending || telesales.length === 0}
      onValueChange={(assigneeId) => {
        if (assigneeId !== "__placeholder__") onAssign(lead.id, assigneeId);
      }}
    >
      <SelectTrigger
        className="min-h-11 min-w-48"
        aria-label={`Chọn Sale phụ trách cho ${lead.fullName}`}
      >
        {isPending ? (
          <span>Đang phân công…</span>
        ) : telesales.length === 0 ? (
          <span>Không có Telesale</span>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="__placeholder__" disabled>
            Chọn Sale phụ trách
          </SelectItem>
          {telesales.map((telesale) => (
            <SelectItem key={telesale.id} value={telesale.id}>
              {telesale.fullName}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: {
  filters: AssignmentFilters;
  options?: SaleFilterOptions;
  onChange: (field: keyof AssignmentFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc phân công</CardTitle>
        <CardDescription>
          Tìm theo lead hoặc nhân viên phụ trách.
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
              <FieldLabel htmlFor="assignment-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="assignment-search"
                  className="pl-9"
                  placeholder="Nhập mã lead, họ tên hoặc nhân viên"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="assignment-assignee"
              label="Nhân viên"
              value={filters.assigneeId}
              onChange={(value) => onChange("assigneeId", value)}
              options={(options?.assignees ?? []).map((item) => ({
                value: item.id,
                label: item.fullName,
              }))}
            />
            <FilterSelect
              id="assignment-source"
              label="Nguồn HV"
              value={filters.sourceId}
              onChange={(value) => onChange("sourceId", value)}
              options={(options?.sources ?? []).map((item) => ({
                value: item.id,
                label: item.name,
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

function Results(props: {
  status: AssignmentStatus;
  table: DataTable<AssignmentItem>;
  data: AssignmentItem[];
  pagination?: AssignmentListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onStatusChange: (status: AssignmentStatus) => void;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const {
    status,
    data,
    pagination,
    page,
    isFetching,
    onStatusChange,
    onPrevious,
    onNext,
  } = props;
  const isUnassigned = status === "unassigned";
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <div
          role="tablist"
          aria-label="Trạng thái phân công lead"
          className="flex flex-wrap gap-2"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={isUnassigned}
            aria-controls="assignment-results-panel"
            variant={isUnassigned ? "default" : "ghost"}
            className="min-h-11"
            onClick={() => onStatusChange("unassigned")}
          >
            Chưa phân công
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={!isUnassigned}
            aria-controls="assignment-results-panel"
            variant={!isUnassigned ? "default" : "ghost"}
            className="min-h-11"
            onClick={() => onStatusChange("assigned")}
          >
            Đã phân công
          </Button>
        </div>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} lead ${isUnassigned ? "chưa được phân công" : "đã được phân công"}`
            : "Đang lấy dữ liệu phân công…"}
        </CardDescription>
      </CardHeader>
      <CardContent
        id="assignment-results-panel"
        role="tabpanel"
        className="p-0"
      >
        <AssignmentResultContent {...props} />
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

function AssignmentResultContent({
  status,
  table,
  data,
  isLoading,
  isError,
  onReload,
}: Pick<
  Parameters<typeof Results>[0],
  "status" | "table" | "data" | "isLoading" | "isError" | "onReload"
>) {
  if (isError)
    return (
      <ErrorState
        title="Không thể tải phân công lead"
        description="Vui lòng thử lại để cập nhật dữ liệu phân công."
        onReload={onReload}
      />
    );
  if (isLoading) return <TableLoadingState label="Đang tải phân công lead" />;
  if (data.length === 0) {
    const copy = assignmentEmptyCopy[status];
    return <EmptyState title={copy.title} description={copy.description} />;
  }
  return (
    <ServerDataTable
      table={table}
      caption={`Danh sách lead ${status === "unassigned" ? "chưa phân công" : "đã phân công"}`}
      className="min-w-260"
    />
  );
}

const assignmentEmptyCopy: Record<
  AssignmentStatus,
  { title: string; description: string }
> = {
  unassigned: {
    title: "Không có lead chưa phân công",
    description: "Tất cả lead hiện tại đều đã có Sale phụ trách.",
  },
  assigned: {
    title: "Không có lead đã phân công phù hợp",
    description: "Điều chỉnh bộ lọc để tìm lead đã phân công cần theo dõi.",
  },
};
