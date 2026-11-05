import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { assignmentEventLabels, type AssignmentEventType, type AssignmentReportQuery } from "@admission-crm/shared/assignment-report";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataPagination } from "@/components/shared/data-pagination";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getAssignmentEvents } from "@/services/assignment-report.service";

export type AssignmentDetailTarget = { type: AssignmentEventType; assigneeId?: string; name?: string };
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
export function AssignmentReportDetails({ query, target, onClose }: { query: AssignmentReportQuery; target: AssignmentDetailTarget; onClose: () => void }) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [page, setPage] = useState(1);
  const request = { ...query, page, limit: 20, eventTypes: [target.type], assigneeIds: target.assigneeId ? [target.assigneeId] : query.assigneeIds };
  const details = useQuery({
    queryKey: ["assignment-report-details", auth.user?.id, selectedProgramId, request],
    queryFn: ({ signal }) => getAssignmentEvents(request, auth.accessToken!, signal),
    enabled: Boolean(auth.accessToken && selectedProgramId),
  });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader><DialogTitle>{assignmentEventLabels[target.type]}{target.name ? ` — ${target.name}` : ""}</DialogTitle>
        <DialogDescription>Từ {query.fromDate} đến {query.toDate}. Thông tin lead chỉ hiển thị trong phạm vi bạn được truy cập hiện tại.</DialogDescription></DialogHeader>
      {details.isPending ? <Skeleton className="h-48" /> : details.isError ? <ErrorState title="Không thể tải chi tiết" description="Vui lòng thử lại." onReload={() => details.refetch()} /> : <>
        <Table><TableCaption>{details.data.pagination.total} sự kiện phù hợp</TableCaption>
          <TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Lead</TableHead><TableHead>Nhân viên</TableHead><TableHead>Nguồn / Chiến dịch</TableHead><TableHead>Hình thức / Quy tắc</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader>
          <TableBody>{!details.data.rows.length ? <TableRow><TableCell colSpan={6}>Chưa có sự kiện phù hợp.</TableCell></TableRow> : details.data.rows.map((event) => <TableRow key={event.id}>
            <TableCell>{dateFormatter.format(new Date(event.occurredAt))}</TableCell>
            <TableCell>{event.leadId ? <Link className="text-primary underline-offset-4 hover:underline focus-visible:underline" to={`/sale/leads/${event.leadId}`}>{event.leadCode ? `${event.leadCode} · ` : ""}{event.leadName}</Link> : <span className="text-muted-foreground">Lead ngoài phạm vi truy cập hoặc đã xóa</span>}</TableCell>
            <TableCell>{event.assigneeName}</TableCell><TableCell><p>{event.sourceName ?? "Không có nguồn"}</p><p className="text-xs text-muted-foreground">{event.campaignNames.join(", ") || "Không có chiến dịch"}</p></TableCell>
            <TableCell><p>{event.method === "AUTOMATIC" ? "Tự động" : "Thủ công"}</p><p className="text-xs text-muted-foreground">{event.ruleName}</p></TableCell>
            <TableCell className="max-w-64 whitespace-normal">{event.reason}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataPagination pagination={{ ...details.data.pagination, totalPages: Math.max(1, Math.ceil(details.data.pagination.total / 20)) }} pageSize={20} showPageSize={false} isFetching={details.isFetching} onPageChange={setPage} ariaLabel="Phân trang sự kiện phân bổ lead" />
      </>}
    </DialogContent>
  </Dialog>;
}
