import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  Search,
  UserRoundCog,
} from "lucide-react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import type { AutomationExecutionStatus, AutomationOperationalMetrics, AutomationRuleVersion } from "@/modules/automations/automation.types";
import {
  getAutomationOperationalMetrics,
  getAutomationOperationsExecution,
  listAutomationExecutions,
  listAutomationOwnerCandidates,
  listAutomationRuleVersions,
  listAutomationTransferRules,
  replayAutomationExecution,
  retryAutomationExecution,
  rollbackAutomationRule,
  transferAutomationRuleOwner,
} from "@/services/automation.service";

const pageSize = 20;
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const emptyFilters = { search: "", status: "", source: "" };

type ConfirmAction =
  | { type: "retry" | "replay"; executionId: string }
  | { type: "rollback"; ruleId: string; version: AutomationRuleVersion }
  | null;

const statusCopy: Record<AutomationExecutionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Đang chờ", variant: "outline" },
  processing: { label: "Đang chạy", variant: "secondary" },
  completed: { label: "Hoàn thành", variant: "default" },
  failed: { label: "Thất bại", variant: "destructive" },
  stuck: { label: "Bị kẹt", variant: "destructive" },
};

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return "Chưa có dữ liệu";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${numberFormatter.format(milliseconds / 1_000)} giây`;
  return `${numberFormatter.format(milliseconds / 60_000)} phút`;
}

const reassignmentReasonCopy: Record<string, string> = {
  sale_reassigned: "Đã chuyển sang Sale khác",
  lead_opened: "Sale đã mở bản ghi",
  care_activity_recorded: "Sale đã chăm sóc Lead",
  lead_data_updated: "Sale đã cập nhật dữ liệu Lead",
  stale_assignment: "Phân công không còn hiệu lực",
  reassignment_disabled: "Đã tắt chia lại",
  invalid_policy: "Cấu hình không hợp lệ",
  max_reassignments_reached: "Đã đạt giới hạn chia lại",
  candidate_pool_exhausted: "Đã hết danh sách Sale",
  max_pool_cycles_reached: "Đã đạt giới hạn vòng chia",
  assignment_no_longer_eligible: "Lead không còn đủ điều kiện",
  actor_unavailable: "Tài khoản thực thi không khả dụng",
  invalid_node_snapshot: "Snapshot node không hợp lệ",
  job_failed: "Job xử lý thất bại",
};

function reassignmentReasonLabel(reason: string | null) {
  if (!reason) return "Không có lý do";
  return reassignmentReasonCopy[reason] ?? reason;
}

export function AutomationMonitoringPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canViewMetrics = auth.can("automation.manage") || auth.can("automation.view") || auth.can("automation.view_logs");
  const canViewLogs = auth.can("automation.manage") || auth.can("automation.view_logs");
  const canTransfer = auth.can("automation.manage") || auth.can("automation.transfer_owner");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [ownerId, setOwnerId] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerAppliedSearch, setOwnerAppliedSearch] = useState("");
  const [transferRuleId, setTransferRuleId] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleAppliedSearch, setRuleAppliedSearch] = useState("");

  const metricsQuery = useQuery({
    queryKey: ["automations", "operations", "metrics"],
    queryFn: () => getAutomationOperationalMetrics(auth.accessToken!),
    refetchInterval: 30_000,
    enabled: canViewMetrics,
  });
  const executionsQuery = useQuery({
    queryKey: ["automations", "operations", "executions", page, appliedFilters],
    queryFn: () => listAutomationExecutions({ page, limit: pageSize, ...appliedFilters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
    refetchInterval: 30_000,
    enabled: canViewLogs,
  });
  const detailQuery = useQuery({
    queryKey: ["automations", "operations", "execution", selectedExecutionId],
    queryFn: () => getAutomationOperationsExecution(selectedExecutionId!, auth.accessToken!),
    enabled: Boolean(selectedExecutionId),
  });
  const detailRuleId = detailQuery.data?.rule.id;
  const ownerRuleId = detailRuleId ?? (transferRuleId || undefined);
  const versionsQuery = useQuery({
    queryKey: ["automations", detailRuleId, "versions"],
    queryFn: () => listAutomationRuleVersions(detailRuleId!, auth.accessToken!),
    enabled: Boolean(detailRuleId),
  });
  const transferRulesQuery = useQuery({
    queryKey: ["automations", "transfer-rules", ruleAppliedSearch],
    queryFn: () => listAutomationTransferRules(auth.accessToken!, ruleAppliedSearch),
    enabled: canTransfer,
  });
  const ownerCandidatesQuery = useQuery({
    queryKey: ["automations", ownerRuleId, "owner-candidates", ownerAppliedSearch],
    queryFn: () => listAutomationOwnerCandidates(ownerRuleId!, auth.accessToken!, ownerAppliedSearch),
    enabled: Boolean(ownerRuleId) && canTransfer && ownerAppliedSearch.length >= 2,
  });

  const invalidateOperations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["automations", "operations"] }),
      queryClient.invalidateQueries({ queryKey: ["automations", detailRuleId, "versions"] }),
      queryClient.invalidateQueries({ queryKey: ["automations", "transfer-rules"] }),
      queryClient.invalidateQueries({ queryKey: ["automations", "rules"] }),
    ]);
  };
  const retryMutation = useMutation({
    mutationFn: (executionId: string) => retryAutomationExecution(executionId, auth.accessToken!),
    onSuccess: async () => { setConfirmAction(null); await invalidateOperations(); },
  });
  const replayMutation = useMutation({
    mutationFn: (executionId: string) => replayAutomationExecution(executionId, crypto.randomUUID(), auth.accessToken!),
    onSuccess: async () => { setConfirmAction(null); await invalidateOperations(); },
  });
  const rollbackMutation = useMutation({
    mutationFn: ({ selectedRuleId, versionId }: { selectedRuleId: string; versionId: string }) =>
      rollbackAutomationRule(selectedRuleId, versionId, auth.accessToken!),
    onSuccess: async () => { setConfirmAction(null); await invalidateOperations(); },
  });
  const transferMutation = useMutation({
    mutationFn: () => transferAutomationRuleOwner(ownerRuleId!, ownerId, auth.accessToken!),
    onSuccess: async () => { setOwnerId(""); setOwnerSearch(""); setOwnerAppliedSearch(""); await invalidateOperations(); },
  });

  const metrics = metricsQuery.data;
  const executions = executionsQuery.data?.data ?? [];
  const pagination = executionsQuery.data?.pagination;
  const canRecover = auth.can("automation.manage") || auth.can("automation.retry");
  const canRollback = auth.can("automation.manage") || auth.can("automation.update");
  const actionError = retryMutation.error ?? replayMutation.error ?? rollbackMutation.error;
  const isActionPending = retryMutation.isPending || replayMutation.isPending || rollbackMutation.isPending;
  const contextExpired = detailQuery.data?.contextData == null;

  const contextText = useMemo(
    () => detailQuery.data ? JSON.stringify(detailQuery.data.contextData, null, 2) : "",
    [detailQuery.data],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Rule Automation"
        title="Giám sát vận hành"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi độ ổn định của hàng đợi, tìm execution lỗi và khôi phục có kiểm soát từ một màn hình."
        actions={
          <Button type="button" variant="outline" onClick={() => void Promise.all([
            ...(canViewMetrics ? [metricsQuery.refetch()] : []),
            ...(canViewLogs ? [executionsQuery.refetch()] : []),
            ...(canTransfer ? [transferRulesQuery.refetch()] : []),
          ])}>
            <RefreshCw aria-hidden="true" />
            Làm mới
          </Button>
        }
      />

      {!canViewMetrics ? null : metricsQuery.isError ? (
        <ErrorState title="Không thể tải chỉ số vận hành" description="Dữ liệu lịch sử vẫn an toàn. Vui lòng thử tải lại." onReload={() => metricsQuery.refetch()} />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số vận hành automation">
          <MetricCard icon={Activity} label="Execution trong 24 giờ" value={metrics ? numberFormatter.format(metrics.totals.executions) : "..."} hint={metrics ? `${numberFormatter.format(metrics.totals.throughputPerHour)} lượt/giờ` : "Đang tính"} />
          <MetricCard icon={Gauge} label="Tỷ lệ thành công" value={metrics ? `${numberFormatter.format(metrics.totals.successRate * 100)}%` : "..."} hint={metrics ? `${metrics.totals.failed} thất bại · ${metrics.totals.stuck} bị kẹt` : "Đang tính"} tone={metrics && (metrics.totals.failed > 0 || metrics.totals.stuck > 0) ? "warning" : "normal"} />
          <MetricCard icon={Clock3} label="Độ trễ trung bình" value={metrics ? formatDuration(metrics.totals.averageLatencyMs) : "..."} hint={metrics ? `${metrics.totals.affectedEntities} đối tượng bị ảnh hưởng` : "Đang tính"} />
          <MetricCard icon={AlertTriangle} label="Độ sâu hàng đợi" value={metrics ? numberFormatter.format(metrics.queue.waiting + metrics.queue.active + metrics.queue.delayed) : "..."} hint={metrics ? (metrics.queue.available ? `${metrics.queue.failed} dead-letter` : "Redis chưa khả dụng") : "Đang kiểm tra"} tone={metrics && (!metrics.queue.available || metrics.queue.failed > 0) ? "warning" : "normal"} />
        </section>
      )}

      {canViewMetrics && metrics?.reassignment && <ReassignmentObservabilitySection metrics={metrics} canViewLogs={canViewLogs} />}

      {canTransfer && (
        <Card className="gap-4 border-border/70 py-5 shadow-xs">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="flex items-center gap-2"><UserRoundCog className="size-5" aria-hidden="true" />Chuyển người phụ trách rule</CardTitle>
            <CardDescription>Tìm rule và người nhận có quyền automation trong cùng phạm vi chương trình.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 lg:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="automation-transfer-rule-search">Tìm rule</FieldLabel>
              <div className="flex gap-2">
                <Input id="automation-transfer-rule-search" value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="Nhập tên rule" />
                <Button type="button" variant="outline" onClick={() => setRuleAppliedSearch(ruleSearch.trim())}>Tìm</Button>
              </div>
              <Select value={transferRuleId} onValueChange={(value) => { setTransferRuleId(value); setOwnerId(""); setOwnerAppliedSearch(""); }}>
                <SelectTrigger className="w-full" aria-label="Chọn rule cần chuyển"><SelectValue placeholder="Chọn rule" /></SelectTrigger>
                <SelectContent>{(transferRulesQuery.data?.data ?? []).map((rule) => <SelectItem key={rule.id} value={rule.id}>{rule.name}{rule.owner ? ` · ${rule.owner.fullName}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="automation-owner-search">Tìm người nhận</FieldLabel>
              <div className="flex gap-2">
                <Input id="automation-owner-search" value={ownerSearch} onChange={(event) => setOwnerSearch(event.target.value)} placeholder="Tối thiểu 2 ký tự" />
                <Button type="button" variant="outline" disabled={!transferRuleId || ownerSearch.trim().length < 2} onClick={() => setOwnerAppliedSearch(ownerSearch.trim())}>Tìm</Button>
              </div>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="w-full" aria-label="Chọn người nhận rule"><SelectValue placeholder="Chọn người nhận" /></SelectTrigger>
                <SelectContent>{(ownerCandidatesQuery.data?.data ?? []).map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.fullName}</SelectItem>)}</SelectContent>
              </Select>
              {transferMutation.error && <p role="alert" className="text-sm text-destructive">Không thể chuyển owner. Hãy kiểm tra quyền và phạm vi của người nhận.</p>}
              <Button type="button" disabled={!transferRuleId || !ownerId || transferMutation.isPending} onClick={() => transferMutation.mutate()}>{transferMutation.isPending ? "Đang chuyển..." : "Chuyển người phụ trách"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(canViewMetrics || canViewLogs) && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-4 border-border/70 py-5 shadow-xs">
            <CardHeader className="gap-1 px-5">
              <CardTitle>Bộ lọc execution</CardTitle>
              <CardDescription>Lọc phía máy chủ theo rule, trạng thái và nguồn chạy.</CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <form className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters, search: filters.search.trim() }); setPage(1); }}>
                <Field>
                  <FieldLabel htmlFor="automation-execution-search">Tên rule</FieldLabel>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="automation-execution-search" className="pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Tìm theo tên rule" />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="automation-execution-status">Trạng thái</FieldLabel>
                  <Select value={filters.status || "__all__"} onValueChange={(status) => setFilters((current) => ({ ...current, status: status === "__all__" ? "" : status }))}>
                    <SelectTrigger id="automation-execution-status" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả</SelectItem>
                      <SelectItem value="processing">Đang chạy</SelectItem>
                      <SelectItem value="completed">Hoàn thành</SelectItem>
                      <SelectItem value="failed">Thất bại</SelectItem>
                      <SelectItem value="stuck">Bị kẹt</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="automation-execution-source">Nguồn chạy</FieldLabel>
                  <Select value={filters.source || "__all__"} onValueChange={(source) => setFilters((current) => ({ ...current, source: source === "__all__" ? "" : source }))}>
                    <SelectTrigger id="automation-execution-source" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả</SelectItem>
                      <SelectItem value="event">Sự kiện</SelectItem>
                      <SelectItem value="bulk">Hàng loạt</SelectItem>
                      <SelectItem value="manual_test">Chạy thử</SelectItem>
                      <SelectItem value="replay">Replay</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <AutoFilterActions snapshot={filters} onApply={() => { setAppliedFilters({ ...filters, search: filters.search.trim() }); setPage(1); }} onReset={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }} />
              </form>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
            <CardHeader className="gap-1 border-b py-5">
              <CardTitle>Lịch sử thực thi</CardTitle>
              <CardDescription>{pagination ? `${pagination.total} execution phù hợp` : "Đang lấy dữ liệu..."}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!canViewLogs ? (
                <EmptyState title="Bạn chưa có quyền xem nhật ký" description="Chỉ số tổng hợp vẫn hiển thị; cần quyền automation.view_logs để xem context và lỗi từng execution." />
              ) : executionsQuery.isError ? (
                <ErrorState title="Không thể tải lịch sử thực thi" description="Vui lòng thử lại để cập nhật danh sách." onReload={() => executionsQuery.refetch()} />
              ) : executionsQuery.isLoading ? (
                <TableLoadingState label="Đang tải lịch sử automation" />
              ) : executions.length === 0 ? (
                <EmptyState title="Chưa có execution phù hợp" description="Điều chỉnh bộ lọc hoặc chờ rule được kích hoạt." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">Lịch sử thực thi Rule Automation</caption>
                    <TableHeader className="bg-muted/55"><TableRow><TableHead className="min-w-64 px-5">Rule</TableHead><TableHead>Trạng thái</TableHead><TableHead>Nguồn</TableHead><TableHead>Bắt đầu</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {executions.map((execution) => (
                        <TableRow key={execution.id}>
                          <TableCell className="px-5"><div className="font-medium">{execution.rule.name}</div><div className="text-xs text-muted-foreground">v{execution.version ?? "-"} · {execution.nodeExecutionCount} node</div></TableCell>
                          <TableCell><StatusBadge status={execution.status} /></TableCell>
                          <TableCell>{sourceLabel(execution.source)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateTime(execution.startedAt)}</TableCell>
                          <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedExecutionId(execution.id)}>Xem chi tiết</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {pagination && pagination.totalPages > 1 && <div className="flex items-center justify-between border-t px-5 py-4 text-sm"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" />Trước</Button><Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Sau<ChevronRight aria-hidden="true" /></Button></div></div>}
          </Card>
        </div>

        <Card className="h-fit gap-0 border-border/70 py-0 shadow-xs">
          <CardHeader className="border-b py-5"><CardTitle>Hiệu quả theo rule</CardTitle><CardDescription>Tỷ lệ hoàn thành trong 24 giờ gần nhất.</CardDescription></CardHeader>
          <CardContent className="divide-y p-0">
            {(metrics?.perRule ?? []).slice(0, 10).map((rule) => <div key={rule.ruleId} className="space-y-2 px-5 py-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{rule.ruleName}</p><span className="text-sm tabular-nums">{numberFormatter.format(rule.successRate * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, rule.successRate * 100)}%` }} /></div><p className="text-xs text-muted-foreground">{rule.completed}/{rule.total} hoàn thành · {rule.failed} lỗi</p><p className="text-xs text-muted-foreground">Tác động: {rule.affectedLeads} lead · {rule.affectedAdmissions} hồ sơ · {rule.affectedStudents} sinh viên</p></div>)}
            {metrics && metrics.perRule.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Chưa có execution trong khoảng thống kê.</p>}
          </CardContent>
        </Card>
      </div>}

      <Dialog open={Boolean(selectedExecutionId)} onOpenChange={(open) => { if (!open) { setSelectedExecutionId(null); setOwnerId(""); setOwnerSearch(""); setOwnerAppliedSearch(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Chi tiết execution</DialogTitle><DialogDescription>Context đã được che dữ liệu nhạy cảm. Retry tiếp tục execution hiện tại; replay giữ actor gốc và ghi audit người thao tác.</DialogDescription></DialogHeader>
          {detailQuery.isLoading ? <TableLoadingState label="Đang tải chi tiết execution" /> : detailQuery.isError || !detailQuery.data ? <ErrorState title="Không thể tải chi tiết execution" description="Execution có thể đã nằm ngoài phạm vi truy cập." onReload={() => detailQuery.refetch()} /> : (
            <div className="grid gap-6">
              <div className="flex flex-wrap items-center gap-3"><StatusBadge status={detailQuery.data.status} /><span className="font-medium">{detailQuery.data.rule.name}</span><span className="text-sm text-muted-foreground">v{detailQuery.data.version ?? "-"} · {formatDateTime(detailQuery.data.startedAt)}</span></div>
              {detailQuery.data.errorMessage && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><p className="font-medium">Nguyên nhân gần nhất</p><p className="mt-1 break-words">{detailQuery.data.errorMessage}</p></div>}
              {contextExpired && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><p className="font-medium">Context đã hết thời hạn lưu trữ</p><p className="mt-1 text-muted-foreground">Execution này vẫn dùng để đối soát chỉ số, nhưng không thể retry hoặc replay an toàn.</p></div>}
              <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Node</TableHead><TableHead>Trạng thái</TableHead><TableHead>Số lần thử</TableHead><TableHead>Lỗi</TableHead></TableRow></TableHeader><TableBody>{detailQuery.data.nodes.map((node) => <TableRow key={node.id}><TableCell><div className="font-medium">{node.nodeId}</div><div className="text-xs text-muted-foreground">{node.nodeType}</div></TableCell><TableCell><Badge variant={node.status === "failed" ? "destructive" : node.status === "completed" ? "default" : "secondary"}>{node.status}</Badge></TableCell><TableCell>{node.attemptCount}</TableCell><TableCell className="max-w-72 whitespace-normal text-sm text-muted-foreground">{node.errorMessage ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div>
              <div><h3 className="mb-2 text-sm font-medium">Context đã làm sạch</h3><pre className="max-h-48 overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">{contextText || "{}"}</pre></div>
              <div className="grid gap-4">
                <section className="rounded-lg border p-4"><div className="mb-3 flex items-center gap-2"><GitCompareArrows className="size-4" aria-hidden="true" /><h3 className="font-medium">Lịch sử phiên bản</h3></div><div className="max-h-64 space-y-3 overflow-y-auto">{(versionsQuery.data?.data ?? []).map((version) => <div key={version.id} className="rounded-md bg-muted/55 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">Phiên bản {version.version}</span>{version.isCurrent ? <Badge>Hiện tại</Badge> : canRollback ? <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction({ type: "rollback", ruleId: detailQuery.data.rule.id, version })}>Khôi phục</Button> : null}</div>{version.changes && <p className="mt-2 text-xs text-muted-foreground">+{version.changes.addedNodeIds.length} node · −{version.changes.removedNodeIds.length} node · {version.changes.changedNodeIds.length} node thay đổi</p>}</div>)}</div></section>
              </div>
              {canRecover && <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={contextExpired || (detailQuery.data.status !== "failed" && detailQuery.data.status !== "stuck")} onClick={() => setConfirmAction({ type: "retry", executionId: detailQuery.data.id })}><RefreshCw aria-hidden="true" />Retry node lỗi</Button><Button type="button" disabled={contextExpired} onClick={() => setConfirmAction({ type: "replay", executionId: detailQuery.data.id })}><RotateCcw aria-hidden="true" />Replay execution</Button></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open && !isActionPending) setConfirmAction(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmAction?.type === "rollback" ? "Khôi phục phiên bản rule?" : confirmAction?.type === "retry" ? "Retry execution?" : "Replay execution?"}</DialogTitle><DialogDescription>{confirmAction?.type === "rollback" ? `Hệ thống sẽ tạo một phiên bản mới từ phiên bản ${confirmAction.version.version}. Rule phải đang tắt.` : confirmAction?.type === "retry" ? "Chỉ các node thất bại hoặc chưa hoàn thành được đưa lại vào hàng đợi. Action đã hoàn tất sẽ không gửi lại." : "Một execution mới sẽ được tạo từ snapshot/context đã lưu và giữ actor gốc; bạn được ghi nhận là người yêu cầu."}</DialogDescription></DialogHeader>
          {actionError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Không thể thực hiện thao tác. Vui lòng kiểm tra hàng đợi, trạng thái rule và thử lại.</p>}
          <DialogFooter showCloseButton><Button type="button" disabled={isActionPending} onClick={() => { if (!confirmAction) return; if (confirmAction.type === "retry") retryMutation.mutate(confirmAction.executionId); else if (confirmAction.type === "replay") replayMutation.mutate(confirmAction.executionId); else rollbackMutation.mutate({ selectedRuleId: confirmAction.ruleId, versionId: confirmAction.version.id }); }}>{isActionPending ? "Đang xử lý..." : "Xác nhận"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReassignmentObservabilitySection({ metrics, canViewLogs }: { metrics: AutomationOperationalMetrics; canViewLogs: boolean }) {
  const reassignment = metrics.reassignment;
  return (
    <section className="space-y-4" aria-labelledby="reassignment-observability-title">
      <div>
        <h2 id="reassignment-observability-title" className="text-lg font-semibold">Theo dõi tự động chuyển Sale</h2>
        <p className="text-sm text-muted-foreground">Backlog hiện tại và kết quả xử lý trong khoảng thống kê, giới hạn theo chương trình làm việc.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={Clock3} label="Đang chờ" value={numberFormatter.format(reassignment.totals.pending)} hint="Chưa đến hạn kiểm tra" />
        <MetricCard icon={AlertTriangle} label="Đã cảnh báo" value={numberFormatter.format(reassignment.totals.warned)} hint="Đang chờ đến hạn chuyển" tone={reassignment.totals.warned > 0 ? "warning" : "normal"} />
        <MetricCard icon={GitCompareArrows} label="Đã chuyển Sale" value={numberFormatter.format(reassignment.totals.reassigned)} hint={`Trễ TB ${formatDuration(reassignment.totals.averageDelayMs)}`} />
        <MetricCard icon={RotateCcw} label="Đã hủy" value={numberFormatter.format(reassignment.totals.cancelled)} hint="Assignment không còn hiệu lực" />
        <MetricCard icon={AlertTriangle} label="Thất bại" value={numberFormatter.format(reassignment.totals.failed)} hint="Cần kiểm tra worker hoặc quyền" tone={reassignment.totals.failed > 0 ? "warning" : "normal"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
          <CardHeader className="border-b py-5">
            <CardTitle>Theo chương trình</CardTitle>
            <CardDescription>Số lượng được tách riêng, không cộng dữ liệu từ chương trình khác.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {reassignment.perProgram.length === 0 ? (
              <EmptyState title="Chưa có monitor chuyển Sale" description="Dữ liệu sẽ xuất hiện sau khi node Chia Lead tự động tạo monitor đầu tiên." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Chỉ số tự động chuyển Sale theo chương trình</caption>
                  <TableHeader className="bg-muted/55"><TableRow><TableHead className="min-w-48 px-5">Chương trình</TableHead><TableHead className="text-right">Chờ</TableHead><TableHead className="text-right">Cảnh báo</TableHead><TableHead className="text-right">Đã chuyển</TableHead><TableHead className="text-right">Đã hủy</TableHead><TableHead className="text-right">Lỗi</TableHead></TableRow></TableHeader>
                  <TableBody>{reassignment.perProgram.map((program) => (
                    <TableRow key={program.institutionProgramId ?? "global"}>
                      <TableCell className="px-5 font-medium">{program.institutionProgramName}</TableCell>
                      <TableCell className="text-right tabular-nums">{program.pending}</TableCell>
                      <TableCell className="text-right tabular-nums">{program.warned}</TableCell>
                      <TableCell className="text-right tabular-nums">{program.reassigned}</TableCell>
                      <TableCell className="text-right tabular-nums">{program.cancelled}</TableCell>
                      <TableCell className="text-right tabular-nums">{program.failed}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
          <CardHeader className="border-b py-5">
            <CardTitle>Nhật ký chuyển Sale gần đây</CardTitle>
            <CardDescription>Lý do kết thúc, Sale cũ/mới và độ trễ so với hạn xử lý.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!canViewLogs ? (
              <EmptyState title="Bạn chưa có quyền xem nhật ký" description="Cần quyền automation.view_logs để xem Sale cũ/mới và lý do của từng lượt xử lý." />
            ) : reassignment.recent.length === 0 ? (
              <EmptyState title="Chưa có lượt xử lý gần đây" description="Không có monitor kết thúc trong khoảng thời gian đang thống kê." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Nhật ký tự động chuyển Sale gần đây</caption>
                  <TableHeader className="bg-muted/55"><TableRow><TableHead className="min-w-56 px-5">Rule / chương trình</TableHead><TableHead className="min-w-52">Kết quả</TableHead><TableHead className="min-w-52">Sale</TableHead><TableHead className="whitespace-nowrap">Độ trễ</TableHead><TableHead className="whitespace-nowrap">Xử lý lúc</TableHead></TableRow></TableHeader>
                  <TableBody>{reassignment.recent.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="px-5"><div className="font-medium">{entry.ruleName}</div><div className="text-xs text-muted-foreground">{entry.institutionProgramName}</div></TableCell>
                      <TableCell><Badge variant={entry.status === "failed" ? "destructive" : entry.status === "reassigned" ? "default" : "outline"}>{reassignmentReasonLabel(entry.completionReason)}</Badge></TableCell>
                      <TableCell><div className="text-sm">{entry.previousAssignee.fullName}</div><div className="text-xs text-muted-foreground">{entry.nextAssignee ? `→ ${entry.nextAssignee.fullName}` : "Không chuyển Sale"}</div></TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDuration(entry.delayMs)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(entry.processedAt)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: AutomationExecutionStatus }) {
  const copy = statusCopy[status];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function sourceLabel(source: string) {
  return ({ event: "Sự kiện", bulk: "Hàng loạt", manual_test: "Chạy thử", replay: "Replay" } as Record<string, string>)[source] ?? source;
}

function MetricCard({ icon: Icon, label, value, hint, tone = "normal" }: { icon: typeof Activity; label: string; value: string; hint: string; tone?: "normal" | "warning" }) {
  return <Card className={tone === "warning" ? "border-amber-500/40 bg-amber-500/5" : "border-border/70"}><CardContent className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-5" aria-hidden="true" /></div></CardContent></Card>;
}
