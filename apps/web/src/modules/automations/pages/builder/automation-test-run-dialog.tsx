import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TestTube2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/services/api";
import { getAutomationExecution, getAutomationTestLeads, runAutomationTest } from "@/services/automation.service";

const nodeStatusLabels: Record<string, string> = {
  processing: "Đang xử lý",
  action_completed: "Đã chạy action",
  completed: "Hoàn tất",
  failed: "Thất bại",
};

export function AutomationTestRunDialog({
  ruleId,
  accessToken,
  disabled,
}: {
  ruleId: string;
  accessToken: string;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const leadsQuery = useQuery({
    queryKey: ["automations", "test-leads", ruleId, search],
    queryFn: () => getAutomationTestLeads(ruleId, accessToken, search || undefined),
    enabled: open,
  });
  const runMutation = useMutation({
    mutationFn: () => runAutomationTest(ruleId, leadId, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", "logs", ruleId] }),
  });
  const executionId = runMutation.data?.executionId;
  const executionQuery = useQuery({
    queryKey: ["automations", "logs", ruleId, executionId],
    queryFn: () => getAutomationExecution(ruleId, executionId!, accessToken),
    enabled: Boolean(executionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2_000;
    },
  });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setLeadId("");
        setDraftSearch("");
        setSearch("");
        runMutation.reset();
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabled ? "Lưu rule trước khi chạy thử" : undefined}>
          <TestTube2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Chạy thử
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chạy thử automation</DialogTitle>
          <DialogDescription>
            Chọn một Lead trong phạm vi của bạn. Đây là chạy thật: rule có thể tạo thông báo, hoạt động, phân công hoặc đổi giai đoạn của Lead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            setLeadId("");
            setSearch(draftSearch.trim());
          }}>
            <Input
              aria-label="Tìm Lead theo tên, mã hoặc số điện thoại"
              placeholder="Tìm tên, mã hoặc số điện thoại..."
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              disabled={runMutation.isPending}
            />
            <Button type="submit" variant="outline" disabled={leadsQuery.isFetching || runMutation.isPending}>Tìm</Button>
          </form>
          <Label htmlFor="automation-test-lead">Lead thử nghiệm</Label>
          <Select value={leadId} onValueChange={setLeadId} disabled={leadsQuery.isLoading || runMutation.isPending}>
            <SelectTrigger id="automation-test-lead" className="w-full">
              <SelectValue placeholder={leadsQuery.isLoading ? "Đang tải Lead..." : "Chọn Lead"} />
            </SelectTrigger>
            <SelectContent>
              {leadsQuery.data?.data.map((lead) => (
                <SelectItem key={lead.id} value={lead.id}>
                  {lead.leadCode ? `${lead.leadCode} — ` : ""}{lead.fullName}{lead.phone ? ` · ${lead.phone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {leadsQuery.isError && (
            <p role="alert" className="text-sm text-destructive">
              {leadsQuery.error instanceof ApiError ? leadsQuery.error.message : "Không thể tải danh sách Lead chạy thử."}
            </p>
          )}
          {!leadsQuery.isLoading && leadsQuery.data?.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Không có Lead phù hợp trong phạm vi truy cập và chương trình của rule.</p>
          )}
        </div>

        {runMutation.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {runMutation.error instanceof ApiError ? runMutation.error.message : "Không thể khởi tạo lần chạy thử."}
          </p>
        )}
        {runMutation.data && (
          <div className="grid gap-3 rounded-md border bg-muted/30 px-3 py-3 text-sm" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-all">Execution <code>{runMutation.data.executionId}</code> · v{runMutation.data.version}</span>
              <Badge variant={executionQuery.data?.status === "failed" ? "destructive" : executionQuery.data?.status === "completed" ? "default" : "secondary"}>
                {executionQuery.data?.status === "completed"
                  ? "Hoàn tất"
                  : executionQuery.data?.status === "failed"
                    ? "Thất bại"
                    : "Đang xử lý"}
              </Badge>
            </div>
            {executionQuery.data?.errorMessage && (
              <p role="alert" className="text-destructive">{executionQuery.data.errorMessage}</p>
            )}
            {executionQuery.isError && (
              <p role="alert" className="text-destructive">
                {executionQuery.error instanceof ApiError ? executionQuery.error.message : "Không thể cập nhật trạng thái execution."}
              </p>
            )}
            {executionQuery.data?.nodes.length ? (
              <div className="grid gap-1.5">
                {executionQuery.data.nodes.map((node) => (
                  <div key={node.id} className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5">
                    <span className="truncate">{node.nodeType} · {node.nodeId}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {nodeStatusLabels[node.status] ?? node.status} · {node.attemptCount} lần
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Đang chờ worker nhận node đầu tiên...</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Đóng</Button>
          <Button type="button" onClick={() => runMutation.mutate()} disabled={!leadId || runMutation.isPending || Boolean(runMutation.data)}>
            {runMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            Xác nhận chạy thử
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
