import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Play, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/services/api";
import {
  getAutomationBulkRun,
  getAutomationOptions,
  previewAutomationBulkRun,
  startAutomationBulkRun,
} from "@/services/automation.service";
import type { AutomationBulkJob, AutomationBulkPreview, AutomationRuleListItem } from "../automation.types";

const TERMINAL_STATUSES = new Set(["completed", "completed_with_errors", "failed"]);

export function AutomationBulkRunDialog({
  open,
  onOpenChange,
  rule,
  accessToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRuleListItem;
  accessToken: string;
}) {
  const [customerListId, setCustomerListId] = useState("");
  const [preview, setPreview] = useState<AutomationBulkPreview | null>(null);
  const [job, setJob] = useState<AutomationBulkJob | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["automations", "options", rule.institutionProgramId],
    queryFn: () => getAutomationOptions(accessToken, rule.institutionProgramId ?? undefined),
    enabled: open,
  });

  const progressQuery = useQuery({
    queryKey: ["automations", rule.id, "bulk-run", job?.id],
    queryFn: () => getAutomationBulkRun(rule.id, job!.id, accessToken),
    enabled: Boolean(open && job && !TERMINAL_STATUSES.has(job.status)),
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && TERMINAL_STATUSES.has(current.status) ? false : 1_500;
    },
  });
  const currentJob = progressQuery.data ?? job;
  const finishedCount = currentJob ? currentJob.processedCount + currentJob.failedCount : 0;
  const progress = currentJob && currentJob.totalCount > 0
    ? Math.min(100, Math.round((finishedCount / currentJob.totalCount) * 100))
    : 0;

  async function handlePreview() {
    if (!customerListId) return;
    setIsWorking(true);
    setErrorMessage("");
    setJob(null);
    try {
      setPreview(await previewAutomationBulkRun(rule.id, customerListId, accessToken));
    } catch (error) {
      setPreview(null);
      setErrorMessage(toMessage(error, "Không thể xem trước tập Lead."));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStart() {
    if (!customerListId || !preview?.total) return;
    setIsWorking(true);
    setErrorMessage("");
    try {
      setJob(await startAutomationBulkRun(rule.id, customerListId, accessToken));
    } catch (error) {
      setErrorMessage(toMessage(error, "Không thể bắt đầu lượt chạy hàng loạt."));
    } finally {
      setIsWorking(false);
    }
  }

  const lists = optionsQuery.data?.customerLists ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Chạy rule cho danh sách Lead</DialogTitle>
          <DialogDescription>
            Xem trước số Lead và mẫu dữ liệu trước khi xác nhận. Hệ thống xử lý nền tối đa 100 Lead/phút.
          </DialogDescription>
        </DialogHeader>

        {currentJob ? (
          <div className="grid gap-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>Tiến độ xử lý</span>
              <strong>{finishedCount}/{currentJob.totalCount} Lead ({progress}%)</strong>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Tiến độ chạy automation hàng loạt"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              Đã đưa vào hàng đợi: {currentJob.processedCount} · Lỗi khởi chạy: {currentJob.failedCount} · Trạng thái: {bulkStatusLabel(currentJob.status)}
            </p>
            {currentJob.errorMessage && <p role="alert" className="text-sm text-destructive">{currentJob.errorMessage}</p>}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="automation-customer-list">Danh sách khách hàng</Label>
              <Select value={customerListId} onValueChange={(value) => { setCustomerListId(value); setPreview(null); }}>
                <SelectTrigger id="automation-customer-list" className="min-h-11 w-full">
                  <SelectValue placeholder={optionsQuery.isLoading ? "Đang tải danh sách..." : "Chọn danh sách Lead"} />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!optionsQuery.isLoading && lists.length === 0 && (
                <p className="text-sm text-muted-foreground">Không có danh sách khách hàng phù hợp trong phạm vi của rule.</p>
              )}
            </div>

            {preview && (
              <Alert>
                <Users aria-hidden="true" />
                <AlertTitle>{preview.total.toLocaleString("vi-VN")} Lead sẽ được xử lý</AlertTitle>
                <AlertDescription>
                  {preview.sample.length > 0
                    ? `Mẫu: ${preview.sample.slice(0, 5).map((lead) => lead.fullName).join(", ")}${preview.total > 5 ? "…" : ""}`
                    : "Danh sách không có Lead phù hợp."}
                  {preview.actions.length > 0 && (
                    <span className="mt-1 block">Action dự kiến: {preview.actions.map((action) => action.label).join(" → ")}.</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Đóng</Button>
          {!currentJob && (
            preview ? (
              <Button type="button" className="min-h-11" disabled={isWorking || preview.total === 0} onClick={handleStart}>
                {isWorking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
                Xác nhận chạy
              </Button>
            ) : (
              <Button type="button" className="min-h-11" disabled={isWorking || !customerListId} onClick={handlePreview}>
                {isWorking && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Xem trước
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function bulkStatusLabel(status: string) {
  if (status === "completed") return "Đã đưa hết vào hàng đợi";
  if (status === "completed_with_errors") return "Đã đưa vào hàng đợi, có lỗi";
  if (status === "failed") return "Thất bại";
  if (status === "processing") return "Đang đưa vào hàng đợi";
  return "Đang chờ";
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
