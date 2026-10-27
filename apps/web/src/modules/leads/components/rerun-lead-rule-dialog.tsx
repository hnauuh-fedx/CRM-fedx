import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AutomationBulkJob, AutomationBulkPreview, AutomationRuleListItem } from "@/modules/automations/automation.types";
import { getAutomationBulkRun, listAutomationRules, previewAutomationBulkRun, startAutomationBulkRun, type LeadAutomationTarget } from "@/services/automation.service";
import type { LeadListFilters } from "../lead.types";

const terminalStatuses = new Set(["completed", "completed_with_errors", "failed"]);
const statusLabels: Record<string, string> = { pending: "Đang chờ", processing: "Đang đưa vào hàng đợi", completed: "Đã đưa vào hàng đợi", completed_with_errors: "Hoàn tất, có lỗi khởi chạy", failed: "Khởi chạy thất bại" };

export function RerunLeadRuleDialog({ leadIds, filteredCount, filters, audience, customerListId, accessToken, onClose }: {
  leadIds: string[];
  filteredCount?: number;
  filters: LeadListFilters & { filterConditions?: string };
  audience: "candidates" | "students" | "all";
  customerListId?: string;
  accessToken: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"selected" | "filtered">(leadIds.length ? "selected" : "filtered");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rule, setRule] = useState<AutomationRuleListItem | null>(null);
  const [preview, setPreview] = useState<{ data: AutomationBulkPreview; target: LeadAutomationTarget; requestId: string } | null>(null);
  const [job, setJob] = useState<AutomationBulkJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rules = useQuery({ queryKey: ["automations", "rerun-options", search, page], queryFn: () => listAutomationRules({ search, page, limit: 30 }, accessToken) });
  const progress = useQuery({
    queryKey: ["automations", rule?.id, "bulk-run", job?.id],
    queryFn: () => getAutomationBulkRun(rule!.id, job!.id, accessToken),
    enabled: Boolean(job && !terminalStatuses.has(job.status)),
    refetchInterval: (query) => query.state.data && terminalStatuses.has(query.state.data.status) ? false : 1500,
  });
  const currentJob = progress.data ?? job;
  const options = rules.data?.data ?? [];
  const choices = rule && !options.some((item) => item.id === rule.id) ? [rule, ...options] : options;
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "filterConditions" && Boolean(value)) || Boolean(filters.filterConditions);

  async function run(start: boolean) {
    if (!rule) return;
    setBusy(true); setError("");
    try {
      if (start && preview) {
        setJob(await startAutomationBulkRun(rule.id, preview.target, accessToken, preview.requestId));
      } else {
        const target: LeadAutomationTarget = scope === "selected"
          ? { target: "selected", leadIds, audience, ...(customerListId ? { customerListId } : {}) }
          : { target: "filtered", filters: { ...filters, audience }, ...(customerListId ? { customerListId } : {}) };
        setPreview({ data: await previewAutomationBulkRun(rule.id, target, accessToken), target, requestId: crypto.randomUUID() });
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Không thể chạy lại rule. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>Chạy lại rule cho lead</DialogTitle>
        <DialogDescription>Chọn rule và phạm vi, sau đó xem trước để xác nhận. Các điều kiện trong rule được kiểm tra theo dữ liệu hiện tại của từng lead.</DialogDescription>
      </DialogHeader>
      {currentJob ? <div className="flex flex-col gap-3" aria-live="polite">
        <p className="text-sm font-medium">{statusLabels[currentJob.status] ?? "Đang xử lý"}</p>
        <Progress value={currentJob.totalCount ? Math.min(100, (currentJob.processedCount + currentJob.failedCount) * 100 / currentJob.totalCount) : 0} aria-label="Tiến độ đưa lead vào hàng đợi" />
        <p className="text-sm">Đã đưa vào hàng đợi: {currentJob.processedCount}/{currentJob.totalCount} lead · Lỗi khởi chạy: {currentJob.failedCount}.</p>
        <p className="text-sm text-muted-foreground">Lượt chạy tiếp tục khi đóng cửa sổ. Tiến độ này phản ánh việc khởi chạy; các bước trong rule có thể tiếp tục xử lý sau đó.</p>
        {currentJob.errorMessage && <p role="alert" className="text-sm text-destructive">{currentJob.errorMessage}</p>}
        {progress.isError && <p role="alert" className="text-sm text-destructive">Không thể cập nhật tiến độ. <Button variant="link" onClick={() => progress.refetch()}>Thử lại</Button></p>}
        <Button asChild variant="outline"><Link to="/automations/monitoring">Xem lịch sử chạy rule</Link></Button>
      </div> : <FieldGroup>
        <Field>
          <FieldLabel id="rerun-scope-label">Phạm vi chạy lại</FieldLabel>
          <ToggleGroup type="single" variant="outline" value={scope} disabled={busy} aria-labelledby="rerun-scope-label" className="w-full flex-wrap" onValueChange={(value) => { if (value === "selected" || value === "filtered") { setScope(value); setPreview(null); } }}>
            <ToggleGroupItem value="selected" disabled={!leadIds.length}>Đang chọn ({leadIds.length})</ToggleGroupItem>
            <ToggleGroupItem value="filtered">Theo bộ lọc hiện tại ({filteredCount?.toLocaleString("vi-VN") ?? "…"})</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>{scope === "selected" ? "Chạy cho các lead đã chọn, kể cả các trang khác." : hasFilters ? "Lấy toàn bộ lead khớp bộ lọc hiện tại, kể cả ngoài trang đang mở." : "Không có bộ lọc: lấy toàn bộ danh sách hiện tại trong phạm vi bạn được quyền xem."}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="rerun-rule-search">Tìm rule</FieldLabel>
          <Input id="rerun-rule-search" value={search} maxLength={100} disabled={busy} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nhập tên rule" />
        </Field>
        <Field>
          <FieldLabel htmlFor="rerun-rule">Rule cần chạy lại</FieldLabel>
          <Select value={rule?.id ?? ""} disabled={busy} onValueChange={(id) => { setRule(choices.find((item) => item.id === id) ?? null); setPreview(null); setError(""); }}>
            <SelectTrigger id="rerun-rule" className="w-full"><SelectValue placeholder={rules.isLoading ? "Đang tải rule..." : "Chọn rule"} /></SelectTrigger>
            <SelectContent><SelectGroup>{choices.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{!item.isActive ? " (Đã dừng)" : ""}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {rules.isError && <FieldDescription role="alert">Không thể tải rule. <Button variant="link" onClick={() => rules.refetch()}>Thử lại</Button></FieldDescription>}
          {!rules.isLoading && !rules.isError && !options.length && <FieldDescription>Không có rule phù hợp trong phạm vi truy cập.</FieldDescription>}
          {(rules.data?.pagination.totalPages ?? 0) > 1 && <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" disabled={busy || rules.isFetching || page === 1} onClick={() => setPage(page - 1)}>Trang trước</Button>
            <span className="text-sm">Trang {page}/{rules.data?.pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={busy || rules.isFetching || page >= (rules.data?.pagination.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Trang sau</Button>
          </div>}
        </Field>
        {preview && <Alert><AlertTitle>{preview.data.total.toLocaleString("vi-VN")} lead sẽ được kiểm tra và chạy theo rule</AlertTitle><AlertDescription>{preview.data.sample.length ? `Một số lead: ${preview.data.sample.map((lead) => lead.fullName).join(", ")}.` : "Không có lead phù hợp."} Các bước cập nhật, phân công hoặc gửi thông báo trong rule có thể thay đổi dữ liệu.</AlertDescription></Alert>}
      </FieldGroup>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>Đóng</Button>
        {!currentJob && <Button disabled={busy || !rule || (scope === "selected" && !leadIds.length) || (preview !== null && !preview.data.total)} onClick={() => run(Boolean(preview))}>{busy && <Spinner />} {preview ? "Xác nhận chạy lại" : "Xem trước"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
