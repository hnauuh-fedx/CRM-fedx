import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock3, Eye, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import type { BusinessRecord } from "@/components/shared/business-records.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import {
  getStudentServiceOptions,
  getStudentSupportHistory,
  type StudentServiceSortField,
} from "@/services/student.service";

const pageSize = 20;
const timelineLimit = 100;
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
const statusLabels: Record<string, string> = {
  open: "Mới",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
  cancelled: "Đã hủy",
};

type SupportRecord = BusinessRecord & {
  studentId: string | null;
  studentCode: string | null;
  studentName: string | null;
  facultyName: string | null;
  className: string | null;
  type: string | null;
  status: string | null;
  content: string | null;
  handledBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

export function StudentSupportHistoryPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [studentDraft, setStudentDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [timelineStudentId, setTimelineStudentId] = useState<string | null>(null);
  const sortBy: StudentServiceSortField = "createdAt";

  const optionsQuery = useQuery({
    queryKey: ["students", "support-history", "options"],
    queryFn: () => getStudentServiceOptions(auth.accessToken!),
  });
  const listQuery = useQuery({
    queryKey: ["student-support-history", page, search, studentId, type, status],
    queryFn: () =>
      getStudentSupportHistory(
        { page, limit: pageSize, search, studentId, type, status, sortBy, sortOrder: "desc" },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const timelineQuery = useQuery({
    queryKey: ["student-support-history", "timeline", timelineStudentId],
    queryFn: () =>
      getStudentSupportHistory(
        {
          page: 1,
          limit: timelineLimit,
          search: "",
          studentId: timelineStudentId ?? "",
          type: "",
          status: "",
          sortBy,
          sortOrder: "desc",
        },
        auth.accessToken!,
      ),
    enabled: Boolean(timelineStudentId),
  });

  const records = (listQuery.data?.data ?? []) as SupportRecord[];
  const timelineRecords = (timelineQuery.data?.data ?? []) as SupportRecord[];
  const pagination = listQuery.data?.pagination;
  const selectedStudent = useMemo(
    () => records.find((record) => record.studentId === timelineStudentId)
      ?? timelineRecords.find((record) => record.studentId === timelineStudentId)
      ?? null,
    [records, timelineRecords, timelineStudentId],
  );
  const statusOptions = useMemo(
    () => (optionsQuery.data?.statuses ?? []).map((item) => ({ value: item, label: displayStatus(item) })),
    [optionsQuery.data?.statuses],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sinh viên"
        title="Lịch sử hỗ trợ"
        scopeLabel="Theo phạm vi truy cập"
        description="Tra cứu lịch sử yêu cầu dịch vụ, lọc nâng cao và xem timeline xử lý theo từng sinh viên."
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc lịch sử hỗ trợ</CardTitle>
          <CardDescription>Tìm theo sinh viên, loại hỗ trợ, trạng thái hoặc nội dung xử lý.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft);
              setStudentId(studentDraft);
              setType(typeDraft);
              setStatus(statusDraft);
              setPage(1);
            }}
          >
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(160px,1fr))_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor="support-history-search">Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="support-history-search"
                    className="pl-9"
                    placeholder="Mã sinh viên, họ tên hoặc nội dung"
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                  />
                </div>
              </Field>
              <FilterSelect
                id="support-history-student"
                label="Sinh viên"
                value={studentDraft}
                onChange={setStudentDraft}
                options={(optionsQuery.data?.students ?? []).map((student) => ({
                  value: student.id,
                  label: `${student.studentCode} - ${student.fullName ?? "Chưa có họ tên"}`,
                }))}
              />
              <FilterSelect
                id="support-history-type"
                label="Loại hỗ trợ"
                value={typeDraft}
                onChange={setTypeDraft}
                options={(optionsQuery.data?.types ?? []).map((item) => ({ value: item, label: item }))}
              />
              <FilterSelect
                id="support-history-status"
                label="Trạng thái"
                value={statusDraft}
                onChange={setStatusDraft}
                options={statusOptions}
              />
              <div className="flex items-end gap-2">
                <Button type="submit">Áp dụng</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchDraft("");
                    setStudentDraft("");
                    setTypeDraft("");
                    setStatusDraft("");
                    setSearch("");
                    setStudentId("");
                    setType("");
                    setStatus("");
                    setPage(1);
                  }}
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
          <CardTitle>Lịch sử hỗ trợ sinh viên</CardTitle>
          <CardDescription>
            {pagination
              ? `Hiển thị ${records.length} trong tổng số ${pagination.total} bản ghi`
              : "Đang lấy dữ liệu lịch sử hỗ trợ..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải lịch sử hỗ trợ" description="Vui lòng thử lại để cập nhật danh sách." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải lịch sử hỗ trợ" />
          ) : records.length === 0 ? (
            <EmptyState title="Chưa có lịch sử hỗ trợ phù hợp" description="Điều chỉnh bộ lọc để tìm lịch sử hỗ trợ cần kiểm tra." />
          ) : (
            <Table className="min-w-240">
              <caption className="sr-only">Lịch sử hỗ trợ sinh viên</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <TableHead className="px-5">Thời gian</TableHead>
                  <TableHead className="px-5">Sinh viên</TableHead>
                  <TableHead className="px-5">Khoa / Lớp</TableHead>
                  <TableHead className="px-5">Loại hỗ trợ</TableHead>
                  <TableHead className="px-5">Trạng thái</TableHead>
                  <TableHead className="px-5">Nội dung xử lý</TableHead>
                  <TableHead className="px-5">Người xử lý</TableHead>
                  <TableHead className="px-5">Timeline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="px-5 py-4">{formatDateTime(record.createdAt)}</TableCell>
                    <TableCell className="px-5 py-4">
                      <span className="font-medium">{record.studentName ?? "-"}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{record.studentCode ?? "-"}</span>
                    </TableCell>
                    <TableCell className="px-5 py-4">{record.facultyName ?? "-"} / {record.className ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{record.type ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4"><Badge variant="secondary">{displayStatus(record.status)}</Badge></TableCell>
                    <TableCell className="max-w-96 px-5 py-4">{record.content ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{record.handledBy ?? "Chưa phân công"}</TableCell>
                    <TableCell className="px-5 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!record.studentId}
                        onClick={() => setTimelineStudentId(record.studentId)}
                      >
                        <Eye aria-hidden="true" />
                        Xem
                      </Button>
                    </TableCell>
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

      <Dialog open={Boolean(timelineStudentId)} onOpenChange={(open) => { if (!open) setTimelineStudentId(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Timeline hỗ trợ sinh viên</DialogTitle>
            <DialogDescription>
              {selectedStudent
                ? `${selectedStudent.studentCode ?? "-"} - ${selectedStudent.studentName ?? "Chưa có họ tên"}`
                : "Đang tải timeline hỗ trợ..."}
            </DialogDescription>
          </DialogHeader>
          {timelineQuery.isLoading ? (
            <TableLoadingState label="Đang tải timeline hỗ trợ" />
          ) : timelineQuery.isError ? (
            <ErrorState title="Không thể tải timeline hỗ trợ" description="Vui lòng thử lại để cập nhật timeline." onReload={() => timelineQuery.refetch()} />
          ) : timelineRecords.length === 0 ? (
            <EmptyState title="Chưa có timeline hỗ trợ" description="Sinh viên này chưa có yêu cầu hỗ trợ nào trong phạm vi truy cập." />
          ) : (
            <ol className="relative ms-3 grid gap-4 border-s pl-6">
              {timelineRecords.map((record) => (
                <li key={record.id} className="relative rounded-md border bg-card p-4">
                  <Clock3 className="absolute -left-9 top-4 size-5 rounded-full bg-background text-muted-foreground" aria-hidden="true" />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{record.type ?? "Yêu cầu hỗ trợ"}</p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">{record.content ?? "-"}</p>
                    </div>
                    <Badge variant="secondary" className="w-fit">{displayStatus(record.status)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>Ghi nhận: {formatDateTime(record.createdAt)}</span>
                    <span>Cập nhật: {formatDateTime(record.updatedAt)}</span>
                    <span>Người xử lý: {record.handledBy ?? "Chưa phân công"}</span>
                    <span>Khoa / Lớp: {record.facultyName ?? "-"} / {record.className ?? "-"}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
