import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Settings2,
  Zap,
  CircleDot,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import {
  listAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  createAutomationRule,
} from "@/services/automation.service";
import {
  TRIGGER_TYPE_LABELS,
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

export function AutomationRulesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["automations", "list", search],
    queryFn: () => listAutomationRules({ search: search || undefined, limit: 50 }, auth.accessToken!),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleAutomationRule(id, isActive, auth.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id, auth.accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(draftSearch);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Quản lý hệ thống"
        title="Rule Automation"
        scopeLabel="Toàn hệ thống"
        description="Xây dựng quy trình tự động hóa theo sự kiện để chăm sóc lead, gửi thông báo và cập nhật dữ liệu."
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex gap-2" onSubmit={handleSearch}>
          <Input
            id="automation-search"
            placeholder="Tìm kiếm rule..."
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="outline">Tìm</Button>
        </form>
        <Button id="create-automation-btn" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo rule mới
        </Button>
      </div>

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
            title="Chưa có automation rule nào"
            description="Tạo rule mới để bắt đầu tự động hoá quy trình sale."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rulesQuery.data.data.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={(isActive) => toggleMutation.mutate({ id: rule.id, isActive })}
              onDelete={() => deleteMutation.mutate(rule.id)}
              onEdit={() => navigate(`/automations/${rule.id}/builder`)}
            />
          ))}
        </div>
      )}

      <CreateRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        accessToken={auth.accessToken!}
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
  onDelete,
  onEdit,
}: {
  rule: AutomationRuleListItem;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
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
          className="flex-1"
        >
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          Chỉnh sửa
        </Button>
        <Button
          id={`toggle-rule-${rule.id}`}
          size="sm"
          variant={rule.isActive ? "secondary" : "default"}
          onClick={() => onToggle(!rule.isActive)}
        >
          {rule.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          id={`delete-rule-${rule.id}`}
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={rule.isActive}
          title={rule.isActive ? "Tắt rule trước khi xoá" : "Xoá rule"}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá automation rule?</DialogTitle>
            <DialogDescription>
              Rule <strong>{rule.name}</strong> sẽ bị xoá vĩnh viễn. Toàn bộ lịch sử thực thi cũng sẽ bị mất.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Huỷ</Button>
            <Button
              variant="destructive"
              onClick={() => { setConfirmOpen(false); onDelete(); }}
            >
              Xoá
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accessToken: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("lead_created");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !triggerType) return;
    setIsSubmitting(true);
    try {
      const rule = await createAutomationRule({ name: name.trim(), description: description.trim() || undefined, triggerType }, accessToken);
      onOpenChange(false);
      setName("");
      setDescription("");
      setTriggerType("lead_created");
      onCreated(rule.id);
    } catch {
      // error handled globally
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo automation rule mới</DialogTitle>
          <DialogDescription>Chọn sự kiện kích hoạt và đặt tên cho rule trước khi vào builder.</DialogDescription>
        </DialogHeader>
        <form id="create-rule-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rule-name">Tên rule</Label>
            <Input
              id="rule-name"
              placeholder="Ví dụ: Nhắc Sale khi có lead mới"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-trigger">Sự kiện kích hoạt</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger id="rule-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-description">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="rule-description"
              placeholder="Mô tả mục đích của rule..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="submit" form="create-rule-form" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Đang tạo..." : "Tạo và vào builder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
