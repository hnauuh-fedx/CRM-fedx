import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import type { BusinessRecord } from "@/components/shared/business-records.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import {
  createStudentService,
  getStudentServiceOptions,
  getStudentServices,
  updateStudentService,
  type StudentServiceSortField,
} from "@/services/student.service";
import type { StudentServiceInput, StudentServiceOptions, StudentServiceStatus, StudentServiceUpdateInput } from "../student.types";

const pageSize = 20;
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const statusLabels: Record<string, string> = {
  open: "Mới",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
  cancelled: "Đã hủy",
};

type ServiceRecord = BusinessRecord & {
  studentId: string | null;
  studentCode: string | null;
  studentName: string | null;
  facultyName: string | null;
  className: string | null;
  type: string | null;
  status: string | null;
  content: string | null;
  handledById: string | null;
  handledBy: string | null;
  createdAt: string | null;
};

type DialogState = { type: "create" } | { type: "edit"; record: ServiceRecord } | null;

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể thực hiện thao tác.";
}

export function StudentServicesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [typeDraft, setTypeDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const sortBy: StudentServiceSortField = "createdAt";

  const canCreate = auth.can("student_service.create");
  const canUpdate = auth.can("student_service.update");
  const optionsQuery = useQuery({
    queryKey: ["students", "services", "options"],
    queryFn: () => getStudentServiceOptions(auth.accessToken!),
  });
  const listQuery = useQuery({
    queryKey: ["students", "services", "list", page, search, type, status],
    queryFn: () =>
      getStudentServices(
        { page, limit: pageSize, search, type, status, sortBy, sortOrder: "desc" },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const createMutation = useMutation({
    mutationFn: (input: StudentServiceInput) => createStudentService(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ["students", "services"] });
      queryClient.invalidateQueries({ queryKey: ["student-services"] });
      queryClient.invalidateQueries({ queryKey: ["student-support-history"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StudentServiceUpdateInput }) =>
      updateStudentService(id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ["students", "services"] });
      queryClient.invalidateQueries({ queryKey: ["student-services"] });
      queryClient.invalidateQueries({ queryKey: ["student-support-history"] });
    },
  });
  const records = (listQuery.data?.data ?? []) as ServiceRecord[];
  const pagination = listQuery.data?.pagination;

  const statusOptions = useMemo(
    () => (optionsQuery.data?.statuses ?? []).map((item) => ({ value: item, label: displayStatus(item) })),
    [optionsQuery.data?.statuses],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sinh viên"
        title="Dịch vụ sinh viên"
        scopeLabel="Theo phạm vi truy cập"
        description="Quản lý yêu cầu dịch vụ, phân công người xử lý và theo dõi trạng thái hỗ trợ sinh viên."
        actions={canCreate ? <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}><Plus aria-hidden="true" />Tạo yêu cầu</Button> : undefined}
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc dịch vụ</CardTitle>
          <CardDescription>Tìm theo sinh viên, nội dung hoặc loại dịch vụ.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft);
              setType(typeDraft);
              setStatus(statusDraft);
              setPage(1);
            }}
          >
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor="student-service-search">Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="student-service-search" className="pl-9" placeholder="Nhập mã sinh viên, họ tên hoặc nội dung" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
                </div>
              </Field>
              <FilterSelect id="student-service-type" label="Loại dịch vụ" value={typeDraft} onChange={setTypeDraft} options={(optionsQuery.data?.types ?? []).map((item) => ({ value: item, label: item }))} />
              <FilterSelect id="student-service-status" label="Trạng thái" value={statusDraft} onChange={setStatusDraft} options={statusOptions} />
              <div className="flex items-end gap-2">
                <Button type="submit">Áp dụng</Button>
                <Button type="button" variant="outline" onClick={() => { setSearchDraft(""); setTypeDraft(""); setStatusDraft(""); setSearch(""); setType(""); setStatus(""); setPage(1); }}>Xóa lọc</Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Yêu cầu dịch vụ sinh viên</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${records.length} trong tổng số ${pagination.total} yêu cầu` : "Đang lấy dữ liệu dịch vụ..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải dịch vụ sinh viên" description="Vui lòng thử lại để cập nhật danh sách yêu cầu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải dịch vụ sinh viên" />
          ) : records.length === 0 ? (
            <EmptyState title="Chưa có yêu cầu dịch vụ phù hợp" description="Điều chỉnh bộ lọc hoặc tạo yêu cầu mới cho sinh viên." />
          ) : (
            <Table className="min-w-240">
              <caption className="sr-only">Dịch vụ sinh viên</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <TableHead className="px-5">Sinh viên</TableHead>
                  <TableHead className="px-5">Khoa / Lớp</TableHead>
                  <TableHead className="px-5">Loại dịch vụ</TableHead>
                  <TableHead className="px-5">Nội dung</TableHead>
                  <TableHead className="px-5">Trạng thái</TableHead>
                  <TableHead className="px-5">Người xử lý</TableHead>
                  <TableHead className="px-5">Ngày ghi nhận</TableHead>
                  {canUpdate && <TableHead className="px-5">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="px-5 py-4"><span className="font-medium">{record.studentName ?? "-"}</span><br /><span className="text-xs text-muted-foreground">{record.studentCode ?? "-"}</span></TableCell>
                    <TableCell className="px-5 py-4">{record.facultyName ?? "-"} / {record.className ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{record.type ?? "-"}</TableCell>
                    <TableCell className="max-w-80 px-5 py-4">{record.content ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4"><Badge variant="secondary">{displayStatus(record.status)}</Badge></TableCell>
                    <TableCell className="px-5 py-4">{record.handledBy ?? "Chưa phân công"}</TableCell>
                    <TableCell className="px-5 py-4">{formatDate(record.createdAt)}</TableCell>
                    {canUpdate && <TableCell className="px-5 py-4"><Button type="button" variant="outline" size="sm" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", record }); }}><Pencil aria-hidden="true" />Cập nhật</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
            <p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" />Trang trước</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || listQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Trang sau<ChevronRight aria-hidden="true" /></Button>
            </div>
          </div>
        )}
      </Card>

      <StudentServiceDialog
        key={dialog?.type === "edit" ? dialog.record.id : dialog?.type ?? "closed"}
        state={dialog}
        options={optionsQuery.data}
        isSaving={createMutation.isPending || updateMutation.isPending}
        error={createMutation.error ?? updateMutation.error}
        onClose={() => setDialog(null)}
        onCreate={(input) => createMutation.mutate(input)}
        onUpdate={(id, input) => updateMutation.mutate({ id, input })}
      />
    </div>
  );
}

function StudentServiceDialog({
  state,
  options,
  isSaving,
  error,
  onClose,
  onCreate,
  onUpdate,
}: {
  state: DialogState;
  options?: StudentServiceOptions;
  isSaving: boolean;
  error: unknown;
  onClose: () => void;
  onCreate: (input: StudentServiceInput) => void;
  onUpdate: (id: string, input: StudentServiceUpdateInput) => void;
}) {
  const record = state?.type === "edit" ? state.record : null;
  const [studentId, setStudentId] = useState(record?.studentId ?? "");
  const [serviceType, setServiceType] = useState(record?.type ?? "");
  const [content, setContent] = useState(record?.content ?? "");
  const [handledBy, setHandledBy] = useState(record?.handledById ?? "none");
  const [status, setStatus] = useState<StudentServiceStatus>((record?.status as StudentServiceStatus | null) ?? "open");

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "Cập nhật dịch vụ sinh viên" : "Tạo yêu cầu dịch vụ"}</DialogTitle>
          <DialogDescription>{record ? "Phân công người xử lý và cập nhật trạng thái yêu cầu." : "Tạo yêu cầu hỗ trợ mới cho sinh viên đã nhập học."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              type: serviceType,
              content,
              handledBy: handledBy === "none" ? undefined : handledBy,
              status,
            };
            if (record) onUpdate(record.id, payload);
            else onCreate({ studentId, ...payload });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="gap-2">
              <FieldLabel>Sinh viên</FieldLabel>
              <Select value={studentId} disabled={Boolean(record)} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Chọn sinh viên" /></SelectTrigger>
                <SelectContent>
                  {(options?.students ?? []).map((student) => (
                    <SelectItem key={student.id} value={student.id}>{student.studentCode} - {student.fullName ?? "Chưa có họ tên"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="gap-2">
              <FieldLabel>Loại dịch vụ</FieldLabel>
              <Input value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="Ví dụ: student_card" required />
            </Field>
            <Field className="gap-2">
              <FieldLabel>Người xử lý</FieldLabel>
              <Select value={handledBy} onValueChange={setHandledBy}>
                <SelectTrigger><SelectValue placeholder="Chọn người xử lý" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Chưa phân công</SelectItem>
                  {(options?.assignees ?? []).map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field className="gap-2">
              <FieldLabel>Trạng thái</FieldLabel>
              <Select value={status} onValueChange={(value) => setStatus(value as StudentServiceStatus)}>
                <SelectTrigger><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
                <SelectContent>
                  {(options?.statuses ?? ["open", "in_progress", "resolved", "closed", "cancelled"]).map((item) => <SelectItem key={item} value={item}>{displayStatus(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field className="gap-2">
            <FieldLabel>Nội dung yêu cầu</FieldLabel>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Nhập nội dung cần hỗ trợ" required />
          </Field>
          {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
            <Button type="submit" disabled={isSaving || !serviceType.trim() || !content.trim() || (!record && !studentId)}>{isSaving ? "Đang lưu..." : "Lưu yêu cầu"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
