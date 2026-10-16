import { useState } from "react";
import { useMutation, useQuery, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, apiDownload } from "@/services/api";

type Report = {
  summary: { total: number; accepted: number; failed: number; duplicate: number; needsReview: number; newLeads: number; updatedLeads: number };
  pipeline: Array<{ stageId: string | null; name: string; leadCount: number }>;
  pipelineVisible: boolean;
  pagination: { totalPages: number };
  definitions: string;
};
const labels: Record<keyof Report["summary"], string> = {
  total: "Tổng phản hồi", accepted: "Đã tiếp nhận", failed: "Lỗi", duplicate: "Khớp Lead có sẵn / cần xử lý",
  needsReview: "Cần xử lý trùng", newLeads: "Lead mới", updatedLeads: "Phản hồi cập nhật Lead",
};

export function MarketingFormReport({ formId, programId, accessToken, permissions }: {
  formId: string; programId: string; accessToken: string; permissions: string[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const canView = ["report.view_all", "report.marketing.view", "report.marketing.view_own"].some(p => permissions.includes(p));
  const canExport = permissions.includes("report.personal.export");
  const invalidDates = Boolean(fromDate && toDate && fromDate > toDate);
  const params = new URLSearchParams({ fromDate, toDate, page: String(page), limit: "20" });
  const path = `/forms/${formId}/report`;
  const query = useQuery({
    queryKey: ["marketing-form-report", programId, formId, fromDate, toDate, page],
    queryFn: ({ signal }) => apiRequest<Report>(`${path}?${params}`, { signal, headers: { "X-Institution-Program-Id": programId } }, accessToken),
    enabled: canView && !invalidDates,
  });
  const download = useMutation({ mutationFn: () => apiDownload(`${path}/export?${params}`, accessToken, { headers: { "X-Institution-Program-Id": programId } }) });
  if (!canView) return null;
  return <Card>
    <CardHeader><CardTitle>Báo cáo phản hồi</CardTitle><CardDescription>Số liệu tổng hợp theo biểu mẫu và chương trình đang chọn.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel htmlFor={`report-from-${formId}`}>Từ ngày</FieldLabel><Input id={`report-from-${formId}`} type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} /></Field>
        <Field data-invalid={invalidDates}><FieldLabel htmlFor={`report-to-${formId}`}>Đến ngày</FieldLabel><Input id={`report-to-${formId}`} type="date" value={toDate} aria-invalid={invalidDates} onChange={e => { setToDate(e.target.value); setPage(1); }} /></Field>
      </FieldGroup>
      <ReportResults query={query} invalidDates={invalidDates} />
      {download.isError && <p role="alert">Không thể xuất báo cáo. Kiểm tra quyền xuất và thử lại.</p>}
    </CardContent>
    <ReportActions query={query} download={download} canExport={canExport} invalidDates={invalidDates} page={page} onPage={setPage} />
  </Card>;
}

function ReportActions({ query, download, canExport, invalidDates, page, onPage }: {
  query: UseQueryResult<Report, Error>; download: UseMutationResult<void, Error, void, unknown>;
  canExport: boolean; invalidDates: boolean; page: number; onPage: (page: number) => void;
}) {
  const exportDisabled = download.isPending || !query.isSuccess || invalidDates || query.isFetching;
  const pages = query.data?.pagination.totalPages ?? 1;
  return <CardFooter className="flex flex-wrap gap-2">
    {canExport && <Button type="button" variant="outline" disabled={exportDisabled} onClick={() => download.mutate()}>{download.isPending ? "Đang xuất…" : "Xuất trang báo cáo CSV"}</Button>}
    {pages > 1 && <><Button type="button" variant="outline" disabled={page === 1 || query.isFetching} onClick={() => onPage(page - 1)}>Trang trước</Button><span>Trang {page} / {pages}</span><Button type="button" variant="outline" disabled={page >= pages || query.isFetching} onClick={() => onPage(page + 1)}>Trang sau</Button></>}
  </CardFooter>;
}

function ReportResults({ query, invalidDates }: { query: UseQueryResult<Report, Error>; invalidDates: boolean }) {
  if (invalidDates) return <p role="alert">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</p>;
  if (query.isError) return <div role="alert"><p>Không thể tải báo cáo.</p><Button type="button" variant="outline" onClick={() => query.refetch()}>Thử lại</Button></div>;
  if (query.isPending) return <Skeleton className="h-32 w-full" aria-label="Đang tải báo cáo" />;
  const report = query.data;
  return <>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(report.summary).map(([key, value]) => <div key={key}><dt className="text-sm text-muted-foreground">{labels[key as keyof typeof labels]}</dt><dd className="text-xl font-semibold tabular-nums">{value.toLocaleString("vi-VN")}</dd></div>)}</dl>
    <p className="text-sm text-muted-foreground">{report.definitions}</p>
    {report.pipelineVisible ? <div><p className="font-medium">Pipeline hiện tại</p><dl>{report.pipeline.map(stage => <div key={stage.stageId ?? "none"} className="flex justify-between gap-3 py-1"><dt>{stage.name}</dt><dd className="tabular-nums">{stage.leadCount.toLocaleString("vi-VN")}</dd></div>)}</dl>{!report.pipeline.length && <p>Chưa có Lead trong phạm vi để thống kê.</p>}</div> : <p>Pipeline chỉ hiển thị khi bạn có quyền xem Lead.</p>}
  </>;
}
