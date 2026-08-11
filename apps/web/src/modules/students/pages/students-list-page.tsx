import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Pencil, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { getStudentDetail, getStudentFilterOptions, getStudents, updateStudentAcademicInfo } from "@/services/student.service";
import type {
  StudentDetail,
  StudentFilterOptions,
  StudentListFilters,
  StudentListItem,
  StudentListResponse,
  StudentSortField,
  StudentUpdateInput,
} from "../student.types";

const pageSize = 20;
const emptyFilters: StudentListFilters = { search: "", status: "", majorId: "", facultyId: "", classId: "" };
const sortableColumns = new Set<StudentSortField>(["enrolledAt", "studentCode", "status"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const statusLabels: Record<string, string> = { active: "Đang học", graduated: "Đã tốt nghiệp", suspended: "Tạm dừng", withdrawn: "Thôi học" };
const defaultStatuses = ["active", "graduated", "suspended", "withdrawn"];

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function StudentsListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "enrolledAt", desc: true }]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const selectedSort = sorting[0] ?? { id: "enrolledAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as StudentSortField)
    ? (selectedSort.id as StudentSortField)
    : "enrolledAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["students", "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getStudents({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["students", "options"],
    queryFn: () => getStudentFilterOptions(auth.accessToken!),
  });
  const detailQuery = useQuery({
    queryKey: ["students", "detail", selectedStudentId],
    queryFn: () => getStudentDetail(selectedStudentId!, auth.accessToken!),
    enabled: Boolean(selectedStudentId),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StudentUpdateInput }) =>
      updateStudentAcademicInfo(id, input, auth.accessToken!),
    onSuccess: (student) => {
      queryClient.invalidateQueries({ queryKey: ["students", "list"] });
      queryClient.setQueryData(["students", "detail", student.id], student);
    },
  });
  const data = listQuery.data?.data ?? [];
  const canUpdate = auth.can("student.update") || auth.can("student.update_all");
  const table = useReactTable({
    data,
    columns: useStudentColumns({ canUpdate, onOpen: setSelectedStudentId }),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? next.slice(0, 1) : [{ id: "enrolledAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sinh viên"
        title="Danh sách sinh viên"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi sinh viên đã nhập học theo khoa, lớp và trạng thái đào tạo."
      />
      <StudentFilters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) => setDraftFilters((current) => ({ ...current, [field]: value }))}
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
      <StudentResults
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
      <StudentDetailDialog
        open={Boolean(selectedStudentId)}
        student={detailQuery.data}
        options={optionsQuery.data}
        canUpdate={canUpdate}
        isLoading={detailQuery.isLoading}
        isSaving={updateMutation.isPending}
        error={updateMutation.error}
        onClose={() => {
          setSelectedStudentId(null);
          updateMutation.reset();
        }}
        onSubmit={(input) => {
          if (selectedStudentId) updateMutation.mutate({ id: selectedStudentId, input });
        }}
      />
    </div>
  );
}

function useStudentColumns({ canUpdate, onOpen }: { canUpdate: boolean; onOpen: (id: string) => void }) {
  return useMemo<ColumnDef<StudentListItem>[]>(
    () => [
      { accessorKey: "studentCode", header: "Mã sinh viên" },
      {
        id: "fullName",
        header: "Họ và tên",
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.lead?.fullName ?? "-"}</span>,
      },
      {
        id: "admissionCode",
        header: "Mã hồ sơ",
        enableSorting: false,
        cell: ({ row }) => row.original.admissionProfile?.admissionCode ?? "-",
      },
      {
        id: "programMajor",
        header: "Chương trình / Ngành",
        enableSorting: false,
        cell: ({ row }) => `${row.original.institutionProgram?.name ?? "-"} / ${row.original.major?.name ?? "-"}`,
      },
      {
        id: "facultyClass",
        header: "Khoa / Lớp",
        enableSorting: false,
        cell: ({ row }) => `${row.original.faculty?.name ?? "-"} / ${row.original.studentClass?.name ?? "-"}`,
      },
      {
        accessorKey: "status",
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {displayStatus(row.original.status)}
          </Badge>
        ),
      },
      { accessorKey: "enrolledAt", header: "Ngày nhập học", cell: ({ row }) => formatDate(row.original.enrolledAt) },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) => (
          <Button type="button" variant="outline" size="sm" onClick={() => onOpen(row.original.id)}>
            {canUpdate ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {canUpdate ? "Chi tiết / sửa" : "Chi tiết"}
          </Button>
        ),
      },
    ],
    [canUpdate, onOpen],
  );
}

type DetailDialogProps = {
  open: boolean;
  student?: StudentDetail;
  options?: StudentFilterOptions;
  canUpdate: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: StudentUpdateInput) => void;
};

function StudentDetailDialog(props: DetailDialogProps) {
  const { open, student, options, canUpdate, isLoading, isSaving, error, onClose, onSubmit } = props;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chi tiết sinh viên</DialogTitle>
          <DialogDescription>
            {student ? `${student.studentCode} - ${student.lead?.fullName ?? "Chưa có họ tên"}` : "Đang tải thông tin sinh viên..."}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !student ? (
          <TableLoadingState label="Đang tải chi tiết sinh viên" />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
              <DetailItem label="Mã sinh viên" value={student.studentCode} />
              <DetailItem label="Trạng thái" value={displayStatus(student.status)} />
              <DetailItem label="Họ và tên" value={student.lead?.fullName} />
              <DetailItem label="Ngày sinh" value={formatDate(student.lead?.dateOfBirth ?? null)} />
              <DetailItem label="Chương trình" value={student.institutionProgram?.name} />
              <DetailItem label="Ngành" value={student.major?.name} />
              <DetailItem label="Khoa" value={student.faculty?.name} />
              <DetailItem label="Lớp" value={student.studentClass?.name} />
              <DetailItem label="Mã hồ sơ" value={student.admissionProfile?.admissionCode} />
              <DetailItem label="Ngày nhập học" value={formatDate(student.enrolledAt)} />
            </div>
            {canUpdate && (
              <StudentAcademicForm
                key={student.id}
                student={student}
                options={options}
                error={error}
                isSaving={isSaving}
                onClose={onClose}
                onSubmit={onSubmit}
              />
            )}
            {!canUpdate && <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Đóng</Button></DialogFooter>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StudentAcademicForm({
  student,
  options,
  error,
  isSaving,
  onClose,
  onSubmit,
}: {
  student: StudentDetail;
  options?: StudentFilterOptions;
  error: unknown;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: StudentUpdateInput) => void;
}) {
  const [form, setForm] = useState<StudentUpdateInput>({
    status: student.status ?? "active",
    facultyId: student.faculty?.id,
    classId: student.studentClass?.id,
  });
  const statusOptions = Array.from(new Set([...defaultStatuses, ...(options?.statuses ?? [])]));

  return (
    <form
      className="grid gap-4 rounded-md border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field className="gap-2">
          <FieldLabel>Trạng thái</FieldLabel>
          <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
            <SelectTrigger><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => <SelectItem key={status} value={status}>{displayStatus(status)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-2">
          <FieldLabel>Khoa</FieldLabel>
          <Select value={form.facultyId ?? "none"} onValueChange={(value) => setForm((current) => ({ ...current, facultyId: value === "none" ? undefined : value }))}>
            <SelectTrigger><SelectValue placeholder="Chọn khoa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Chưa phân khoa</SelectItem>
              {(options?.faculties ?? []).map((faculty) => <SelectItem key={faculty.id} value={faculty.id}>{faculty.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-2">
          <FieldLabel>Lớp</FieldLabel>
          <Select value={form.classId ?? "none"} onValueChange={(value) => setForm((current) => ({ ...current, classId: value === "none" ? undefined : value }))}>
            <SelectTrigger><SelectValue placeholder="Chọn lớp" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Chưa phân lớp</SelectItem>
              {(options?.classes ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.facultyName ? `${item.name} - ${item.facultyName}` : item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Không thể cập nhật sinh viên."}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu cập nhật"}</Button>
      </DialogFooter>
    </form>
  );
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

type FilterProps = {
  filters: StudentListFilters;
  options?: StudentFilterOptions;
  onChange: (field: keyof StudentListFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function StudentFilters({ filters, options, onChange, onApply, onReset }: FilterProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc sinh viên</CardTitle>
        <CardDescription>Tìm theo mã sinh viên hoặc họ tên.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(210px,2fr)_repeat(4,minmax(145px,1fr))_auto]">
          <Field className="gap-2">
            <FieldLabel htmlFor="student-search">Tìm kiếm</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="student-search" className="pl-9" placeholder="Nhập mã sinh viên hoặc họ tên" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
            </div>
          </Field>
          <FilterSelect id="student-status" label="Trạng thái" value={filters.status} onChange={(value) => onChange("status", value)} options={(options?.statuses ?? []).map((status) => ({ value: status, label: displayStatus(status) }))} />
          <FilterSelect id="student-major" label="Ngành" value={filters.majorId} onChange={(value) => onChange("majorId", value)} options={(options?.majors ?? []).map((item) => ({ value: item.id, label: item.name }))} />
          <FilterSelect id="student-faculty" label="Khoa" value={filters.facultyId} onChange={(value) => onChange("facultyId", value)} options={(options?.faculties ?? []).map((item) => ({ value: item.id, label: item.name }))} />
          <FilterSelect id="student-class" label="Lớp" value={filters.classId} onChange={(value) => onChange("classId", value)} options={(options?.classes ?? []).map((item) => ({ value: item.id, label: item.facultyName ? `${item.name} - ${item.facultyName}` : item.name }))} />
          <div className="flex items-end gap-2">
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={onReset}>Xóa lọc</Button>
          </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type ResultsProps = {
  table: DataTable<StudentListItem>;
  data: StudentListItem[];
  pagination?: StudentListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function StudentResults(props: ResultsProps) {
  const { table, data, pagination, page, isLoading, isError, isFetching, onReload, onPrevious, onNext } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Sinh viên nhập học</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} sinh viên` : "Đang lấy dữ liệu sinh viên…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải danh sách sinh viên" description="Vui lòng thử lại để cập nhật dữ liệu sinh viên." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải danh sách sinh viên" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có sinh viên phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm sinh viên cần theo dõi." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
          <p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<StudentListItem> }) {
  return (
      <Table className="min-w-220">
        <caption className="sr-only">Danh sách sinh viên</caption>
        <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => {
            const direction = header.column.getIsSorted();
            return <TableHead key={header.id} scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>
              {header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>
                {flexRender(header.column.columnDef.header, header.getContext())}
                {direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}
              </button> : flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>;
          })}</TableRow>)}
        </TableHeader>
        <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
  );
}
