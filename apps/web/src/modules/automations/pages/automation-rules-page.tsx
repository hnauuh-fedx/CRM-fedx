import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Pause,
  Plus,
  Archive,
  Settings2,
  Zap,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  Copy,
} from "lucide-react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  listAutomationRules,
  getAutomationOptions,
  toggleAutomationRule,
  archiveAutomationRule,
  createAutomationRule,
  duplicateAutomationRule,
} from "@/services/automation.service";
import {
  SUPPORTED_AUTOMATION_TRIGGER_TYPES,
  TRIGGER_TYPE_LABELS,
  type AutomationGraphData,
  type AutomationRuleListItem,
} from "../automation.types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RULE_TEMPLATES = [
  { id: "blank", label: "Tự thiết kế", description: "Bắt đầu với node khởi động." },
  { id: "new-lead-notification", label: "Thông báo Lead mới", description: "Khởi động và gửi thông báo nội bộ." },
  { id: "lead-follow-up", label: "Follow-up Lead", description: "Chờ 60 phút rồi ghi hoạt động chăm sóc." },
] as const;

function createTemplateGraph(templateId: string): AutomationGraphData {
  const trigger = { id: "trigger-1", type: "trigger" as const, position: { x: 80, y: 160 }, data: { label: "Khởi động" } };
  if (templateId === "new-lead-notification") {
    return {
      nodes: [
        trigger,
        {
          id: "notification-1",
          type: "action_notification",
          position: { x: 360, y: 160 },
          data: { label: "Thông báo Lead mới", title: "Có Lead mới", content: "Lead {{system:fullName}} vừa được tạo." },
        },
      ],
      edges: [{ id: "trigger-notification", source: trigger.id, target: "notification-1" }],
    };
  }
  if (templateId === "lead-follow-up") {
    return {
      nodes: [
        trigger,
        { id: "delay-1", type: "delay", position: { x: 340, y: 160 }, data: { label: "Chờ 60 phút", delayMinutes: 60 } },
        {
          id: "activity-1",
          type: "action_activity",
          position: { x: 600, y: 160 },
          data: { label: "Ghi nhận follow-up", activityType: "note", activityContent: "Tự động tạo nhắc follow-up cho {{system:fullName}}." },
        },
      ],
      edges: [
        { id: "trigger-delay", source: trigger.id, target: "delay-1" },
        { id: "delay-activity", source: "delay-1", target: "activity-1" },
      ],
    };
  }
  return { nodes: [trigger], edges: [] };
}

export function AutomationRulesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["automations", "options"],
    queryFn: () => getAutomationOptions(auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });
  const programs = optionsQuery.data?.institutionPrograms ?? [];
  const triggers = optionsQuery.data?.registry.triggers
    ?? SUPPORTED_AUTOMATION_TRIGGER_TYPES.map((code) => ({ code, label: TRIGGER_TYPE_LABELS[code] }));

  const rulesQuery = useQuery({
    queryKey: ["automations", "list", { page, search, statusFilter, triggerFilter, programFilter }],
    queryFn: () => listAutomationRules({
      page,
      limit: 20,
      search: search || undefined,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
      triggerType: triggerFilter === "all" ? undefined : triggerFilter,
      institutionProgramId: programFilter === "all" ? undefined : programFilter,
    }, auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleAutomationRule(id, isActive, auth.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveAutomationRule(id, auth.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateAutomationRule(id, auth.accessToken!),
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      navigate(`/automations/${rule.id}/builder`);
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(draftSearch.trim());
    setPage(1);
  }

  function resetFilters() {
    setDraftSearch("");
    setSearch("");
    setStatusFilter("all");
    setTriggerFilter("all");
    setProgramFilter("all");
    setPage(1);
  }

  const hasFilters = Boolean(search || statusFilter !== "all" || triggerFilter !== "all" || programFilter !== "all");
  const mutationError = toggleMutation.error ?? archiveMutation.error ?? duplicateMutation.error;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Quản lý hệ thống"
        title="Rule Automation"
        scopeLabel={auth.user?.accessScope === "ALL" ? "Toàn hệ thống" : "Theo phạm vi truy cập"}
        description="Xây dựng quy trình tự động hóa theo sự kiện để chăm sóc lead, gửi thông báo và cập nhật dữ liệu."
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Bộ lọc Automation Rule</CardTitle>
              <CardDescription>Tìm theo tên, trạng thái, sự kiện kích hoạt hoặc chương trình tuyển sinh.</CardDescription>
            </div>
            <Button id="create-automation-btn" className="min-h-11" onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />Tạo rule mới
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_13rem_16rem_minmax(16rem,1fr)_auto] lg:items-end">
          <form className="grid gap-2" onSubmit={handleSearch}>
            <Label htmlFor="automation-search">Tìm kiếm</Label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="automation-search" placeholder="Tên rule automation" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className="min-h-11 pl-9" />
              </div>
              <Button type="submit" variant="outline" className="min-h-11">Tìm</Button>
            </div>
          </form>
          <div className="grid gap-2">
            <Label htmlFor="automation-status-filter">Trạng thái</Label>
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
              <SelectTrigger id="automation-status-filter" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="active">Đang chạy</SelectItem><SelectItem value="inactive">Đang tắt</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="automation-trigger-filter">Sự kiện kích hoạt</Label>
            <Select value={triggerFilter} onValueChange={(value) => { setTriggerFilter(value); setPage(1); }}>
              <SelectTrigger id="automation-trigger-filter" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả sự kiện</SelectItem>{triggers.map((trigger) => <SelectItem key={trigger.code} value={trigger.code}>{trigger.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="automation-program-filter">Chương trình tuyển sinh</Label>
            <Select value={programFilter} onValueChange={(value) => { setProgramFilter(value); setPage(1); }}>
              <SelectTrigger id="automation-program-filter" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả chương trình</SelectItem>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.institutionName} - {program.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="button" variant="ghost" className="min-h-11" disabled={!hasFilters} onClick={resetFilters}>
            <FilterX data-icon="inline-start" />Xóa lọc
          </Button>
        </CardContent>
      </Card>

      {mutationError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {mutationError instanceof ApiError
            ? mutationError.message
            : "Không thể cập nhật rule. Vui lòng thử lại."}
        </p>
      )}

      {/* Rule list */}
      {rulesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : rulesQuery.isError || !rulesQuery.data ? (
        <Card className="mx-auto max-w-xl">
          <ErrorState
            title="Không thể tải danh sách rule"
            description="Vui lòng thử lại."
            onReload={() => rulesQuery.refetch()}
          />
        </Card>
      ) : rulesQuery.data.data.length === 0 ? (
        <Card>
          <EmptyState
            title={hasFilters ? "Không tìm thấy rule phù hợp" : "Chưa có automation rule nào"}
            description={hasFilters ? "Thay đổi hoặc xóa bộ lọc để xem các rule khác." : "Tạo rule mới để bắt đầu tự động hoá quy trình sale."}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rulesQuery.data.data.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={(isActive) => toggleMutation.mutate({ id: rule.id, isActive })}
              onArchive={() => archiveMutation.mutate(rule.id)}
              onDuplicate={() => duplicateMutation.mutate(rule.id)}
              onEdit={() => navigate(`/automations/${rule.id}/builder`)}
            />
          ))}
        </div>
      )}

      {rulesQuery.data && rulesQuery.data.pagination.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
          <p className="text-muted-foreground">
            {rulesQuery.data.pagination.total} rule · Trang {rulesQuery.data.pagination.page} / {rulesQuery.data.pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={page <= 1 || rulesQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft aria-hidden="true" />Trang trước
            </Button>
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={page >= rulesQuery.data.pagination.totalPages || rulesQuery.isFetching} onClick={() => setPage((value) => value + 1)}>
              Trang sau<ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <CreateRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        accessToken={auth.accessToken!}
        programs={programs}
        triggers={triggers}
        canManageGlobal={auth.user?.accessScope === "ALL" && auth.can("automation.manage_global")}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["automations"] });
          navigate(`/automations/${id}/builder`);
        }}
      />
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onArchive,
  onDuplicate,
  onEdit,
}: {
  rule: AutomationRuleListItem;
  onToggle: (isActive: boolean) => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const triggerLabel = TRIGGER_TYPE_LABELS[rule.triggerType] ?? rule.triggerType;

  return (
    <Card className="group border-border/70 shadow-xs transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{rule.name}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5 text-xs">
              <Zap className="h-3 w-3 shrink-0" />
              {triggerLabel}
            </CardDescription>
          </div>
          <Badge
            variant={rule.isActive ? "default" : "secondary"}
            className="shrink-0"
          >
            {rule.isActive ? (
              <><CircleDot className="mr-1 h-3 w-3 text-green-400" />Đang chạy</>
            ) : (
              "Tắt"
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-2 pt-0">
        <Button
          id={`edit-rule-${rule.id}`}
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="min-h-11 flex-1"
        >
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          Chỉnh sửa
        </Button>
        <Button
          id={`toggle-rule-${rule.id}`}
          size="sm"
          variant={rule.isActive ? "secondary" : "default"}
          className="min-h-11 min-w-11"
          aria-label={rule.isActive ? `Tắt rule ${rule.name}` : `Bật rule ${rule.name}`}
          onClick={() => onToggle(!rule.isActive)}
        >
          {rule.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          id={`duplicate-rule-${rule.id}`}
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11"
          aria-label={`Nhân bản rule ${rule.name}`}
          title="Nhân bản rule"
          onClick={onDuplicate}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          id={`archive-rule-${rule.id}`}
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={rule.isActive}
          aria-label={rule.isActive ? `Không thể lưu trữ rule ${rule.name} khi đang chạy` : `Lưu trữ rule ${rule.name}`}
          title={rule.isActive ? "Tắt rule trước khi lưu trữ" : "Lưu trữ rule"}
          onClick={() => setConfirmOpen(true)}
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lưu trữ automation rule?</DialogTitle>
            <DialogDescription>
              Rule <strong>{rule.name}</strong> sẽ ngừng xuất hiện trong danh sách. Lịch sử thực thi vẫn được giữ lại để tra soát.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Huỷ</Button>
            <Button
              variant="destructive"
              onClick={() => { setConfirmOpen(false); onArchive(); }}
            >
              Lưu trữ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


function CreateRuleDialog({
  open,
  onOpenChange,
  accessToken,
  programs,
  triggers,
  canManageGlobal,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accessToken: string;
  programs: Array<{ id: string; name: string; institutionName: string }>;
  triggers: Array<{ code: string; label: string }>;
  canManageGlobal: boolean;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("lead_created");
  const [templateId, setTemplateId] = useState("blank");
  const [programId, setProgramId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !triggerType || !programId) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const rule = await createAutomationRule({
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        graphData: createTemplateGraph(templateId),
        institutionProgramId: programId === "global" ? undefined : programId,
      }, accessToken);
      onOpenChange(false);
      setName("");
      setDescription("");
      setTriggerType("lead_created");
      setTemplateId("blank");
      setProgramId("");
      onCreated(rule.id);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Không thể tạo rule. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo automation rule mới</DialogTitle>
          <DialogDescription>Chọn phạm vi, sự kiện kích hoạt và đặt tên cho rule trước khi vào builder.</DialogDescription>
        </DialogHeader>
        <form id="create-rule-form" onSubmit={handleSubmit}>
          <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="rule-name">Tên rule</FieldLabel>
            <Input
              id="rule-name"
              className="min-h-11"
              placeholder="Ví dụ: Nhắc Sale khi có lead mới"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rule-template">Mẫu quy trình</FieldLabel>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="rule-template" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TEMPLATES.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldDescription>{RULE_TEMPLATES.find((template) => template.id === templateId)?.description}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="rule-program">Chương trình tuyển sinh</FieldLabel>
            <Select value={programId} onValueChange={setProgramId} required>
              <SelectTrigger id="rule-program" className="min-h-11 w-full" aria-describedby="rule-program-help">
                <SelectValue placeholder="Chọn phạm vi áp dụng" />
              </SelectTrigger>
              <SelectContent>
                {canManageGlobal && <SelectItem value="global">Toàn hệ thống</SelectItem>}
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.institutionName} - {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="rule-program-help">
              Rule chỉ đọc và thay đổi lead thuộc phạm vi đã chọn.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="rule-trigger">Sự kiện kích hoạt</FieldLabel>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger id="rule-trigger" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggers.map((trigger) => (
                  <SelectItem key={trigger.code} value={trigger.code}>{trigger.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rule-description">Mô tả (tuỳ chọn)</FieldLabel>
            <Textarea
              id="rule-description"
              placeholder="Mô tả mục đích của rule..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {errorMessage && <FieldError>{errorMessage}</FieldError>}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="submit" form="create-rule-form" disabled={isSubmitting || !name.trim() || !programId}>
            {isSubmitting ? "Đang tạo..." : "Tạo và vào builder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
