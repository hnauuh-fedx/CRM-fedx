import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Plus } from "lucide-react";
import {
  WORK_WEEKDAYS,
  type SaleWorkSchedule,
} from "@admission-crm/shared/sale-work-schedule";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { listWorkSchedules } from "@/services/sale-work-schedule.service";
import { SaleWorkScheduleDialog } from "../components/sale-work-schedule-dialog";

const EMPTY_SCHEDULES: SaleWorkSchedule[] = [];
export function SaleWorkSchedulesPage() {
  const { accessToken } = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  if (!accessToken || !selectedProgramId)
    return (
      <EmptyState
        title="Chọn chương trình tuyển sinh"
        description="Lịch làm việc được quản lý riêng trong từng chương trình."
      />
    );
  return (
    <WorkSchedules
      key={selectedProgramId}
      token={accessToken}
      programId={selectedProgramId}
    />
  );
}
function WorkSchedules({
  token,
  programId,
}: {
  token: string;
  programId: string;
}) {
  const [filters, setFilters] = useState({ page: 1, search: "", status: "" });
  const [editor, setEditor] = useState<{
    schedule?: Partial<SaleWorkSchedule>;
    readOnly?: boolean;
  } | null>(null);
  const query = useQuery({
    queryKey: ["sale-work-schedules", programId, filters],
    queryFn: () =>
      listWorkSchedules(
        token,
        programId,
        filters.page,
        filters.search,
        filters.status,
      ),
  });
  const columns = useMemo<ColumnDef<SaleWorkSchedule>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tên lịch",
        cell: ({ row }) => (
          <Button
            variant="link"
            onClick={() =>
              setEditor({ schedule: row.original, readOnly: true })
            }
          >
            {row.original.name}
          </Button>
        ),
      },
      {
        id: "sales",
        header: "Sale áp dụng",
        cell: ({ row }) => (
          <div className="flex max-w-60 flex-wrap gap-1">
            {row.original.sales.slice(0, 3).map((sale) => (
              <Badge key={sale.id} variant="secondary">
                {sale.fullName}
              </Badge>
            ))}
            {row.original.sales.length > 3 && (
              <Badge variant="outline">+{row.original.sales.length - 3}</Badge>
            )}
            {!row.original.sales.length && <span>Chưa chọn Sale</span>}
          </div>
        ),
      },
      {
        id: "calendar",
        header: "Ngày và ca làm việc",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1 text-sm">
            {[...row.original.calendar.days]
              .sort((a, b) => (a.weekday || 7) - (b.weekday || 7))
              .filter((day) => day.shifts.length > 0)
              .map((day) => (
                <span key={day.weekday}>
                  {WORK_WEEKDAYS[day.weekday]}:{" "}
                  {day.shifts
                    .map((shift) => `${shift.start}–${shift.end}`)
                    .join(", ")}
                </span>
              ))}
          </div>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? "Đang áp dụng" : "Ngừng áp dụng"}
          </Badge>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Cập nhật",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>
              {new Date(row.original.updatedAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
            <span className="text-muted-foreground">
              {row.original.updatedByName}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Thao tác",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEditor({ schedule: row.original })}
            >
              Sửa
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setEditor({
                  schedule: {
                    name: `${row.original.name} (bản sao)`,
                    calendar: row.original.calendar,
                    note: row.original.note,
                    isActive: false,
                    saleIds: [],
                    sales: [],
                  },
                })
              }
            >
              Sao chép
            </Button>
          </div>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: query.data?.data ?? EMPTY_SCHEDULES,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    defaultColumn: { enableSorting: false },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Quản lý"
        title="Thời gian làm việc của Sale"
        description="Cấu hình ca làm việc để automation tạm dừng tính thời gian không tương tác ngoài giờ. Múi giờ Việt Nam (UTC+7)."
        actions={
          <Button onClick={() => setEditor({})}>
            <Plus data-icon="inline-start" />
            Thêm lịch làm việc
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Danh sách lịch làm việc</CardTitle>
          <CardDescription>
            Mỗi Sale chỉ có một lịch đang áp dụng trong chương trình. Rule cũ
            chỉ sử dụng lịch khi bật “Chỉ tính trong giờ làm việc”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field>
              <FieldLabel htmlFor="schedule-search">Tìm tên lịch</FieldLabel>
              <Input
                id="schedule-search"
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    search: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="schedule-status-filter">
                Trạng thái
              </FieldLabel>
              <select
                id="schedule-status-filter"
                aria-label="Trạng thái lịch"
                className="min-h-11 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">Tất cả</option>
                <option value="true">Đang áp dụng</option>
                <option value="false">Ngừng áp dụng</option>
              </select>
            </Field>
          </div>
          {query.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : query.isError ? (
            <ErrorState
              title="Không tải được lịch làm việc"
              description={query.error.message}
              onReload={() => void query.refetch()}
            />
          ) : !query.data?.data.length ? (
            <EmptyState
              title="Chưa có lịch phù hợp"
              description="Thêm lịch làm việc hoặc thay đổi bộ lọc tìm kiếm."
            />
          ) : (
            <ServerDataTable
              table={table}
              caption="Danh sách thời gian làm việc của Sale"
              className="min-w-[800px]"
            />
          )}
          {query.data && (
            <TablePagination
              page={filters.page}
              pagination={query.data.pagination}
              isFetching={query.isFetching}
              onPrevious={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
              onNext={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            />
          )}
        </CardContent>
      </Card>
      {editor && (
        <SaleWorkScheduleDialog
          schedule={editor.schedule}
          readOnly={editor.readOnly}
          token={token}
          programId={programId}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
