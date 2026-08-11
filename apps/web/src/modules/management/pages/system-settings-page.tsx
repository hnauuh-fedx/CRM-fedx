import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, FileDown, Pencil, Plus, Settings, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/services/api";
import {
  createExportSetting,
  createSlaRule,
  deleteExportSetting,
  deleteSlaRule,
  deleteSystemSetting,
  getSystemManagementDashboard,
  updateExportSetting,
  updateSlaRule,
  upsertSystemSetting,
} from "@/services/system-management.service";
import { useAuth } from "@/modules/auth/auth-context";
import type { ExportSetting, ExportSettingInput, SettingInput, SlaRule, SlaRuleInput, SystemSetting } from "../system-management.types";

const emptySetting: SettingInput = { key: "", value: "", type: "string" };
const emptySla: SlaRuleInput = { name: "", module: "lead", durationMinutes: 60, action: "", isActive: true };
const emptyExport: ExportSettingInput = { name: "", reportType: "overview", filters: {}, isActive: true };

type DialogState =
  | { type: "setting"; setting?: SystemSetting }
  | { type: "delete-setting"; setting: SystemSetting }
  | { type: "sla"; rule?: SlaRule }
  | { type: "delete-sla"; rule: SlaRule }
  | { type: "export"; config?: ExportSetting }
  | { type: "delete-export"; config: ExportSetting }
  | null;

export function SystemSettingsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const query = useQuery({
    queryKey: ["system", "management"],
    queryFn: () => getSystemManagementDashboard(auth.accessToken!),
  });

  const refresh = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: ["system", "management"] });
  };
  const settingMutation = useMutation({ mutationFn: (input: SettingInput) => upsertSystemSetting(input, auth.accessToken!), onSuccess: refresh });
  const deleteSettingMutation = useMutation({ mutationFn: (id: string) => deleteSystemSetting(id, auth.accessToken!), onSuccess: refresh });
  const slaMutation = useMutation({
    mutationFn: (input: SlaRuleInput) => dialog?.type === "sla" && dialog.rule ? updateSlaRule(dialog.rule.id, input, auth.accessToken!) : createSlaRule(input, auth.accessToken!),
    onSuccess: refresh,
  });
  const deleteSlaMutation = useMutation({ mutationFn: (id: string) => deleteSlaRule(id, auth.accessToken!), onSuccess: refresh });
  const exportMutation = useMutation({
    mutationFn: (input: ExportSettingInput) => dialog?.type === "export" && dialog.config ? updateExportSetting(dialog.config.id, input, auth.accessToken!) : createExportSetting(input, auth.accessToken!),
    onSuccess: refresh,
  });
  const deleteExportMutation = useMutation({ mutationFn: (id: string) => deleteExportSetting(id, auth.accessToken!), onSuccess: refresh });

  const data = query.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Cấu hình hệ thống"
        scopeLabel="Quyền quản trị"
        description="Quản lý system settings, SLA, rule thông báo, cấu hình export và trạng thái queue/system health."
      />

      {query.isError ? (
        <ErrorState title="Không thể tải cấu hình hệ thống" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => query.refetch()} />
      ) : query.isLoading || !data ? (
        <TableLoadingState label="Đang tải cấu hình hệ thống" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <HealthCard title="Trạng thái queue" value={data.health.status === "ok" ? "Ổn định" : "Cần kiểm tra"} icon={Activity} variant={data.health.status} />
            <HealthCard title="Job đang chờ" value={String(data.health.pendingJobs)} icon={Settings} />
            <HealthCard title="Job lỗi" value={String(data.health.failedJobs)} icon={ShieldCheck} variant={data.health.failedJobs > 0 ? "warning" : "ok"} />
            <HealthCard title="Thông báo chưa đọc" value={String(data.health.unreadNotifications)} icon={Bell} />
          </div>

          <SectionCard
            icon={Settings}
            title="System settings"
            description="Key/value cấu hình chung. Rule thông báo có thể đặt bằng key bắt đầu với notification."
            actionLabel="Thêm setting"
            onAction={() => { settingMutation.reset(); setDialog({ type: "setting" }); }}
          >
            <SettingsTable items={data.settings} onEdit={(setting) => setDialog({ type: "setting", setting })} onDelete={(setting) => setDialog({ type: "delete-setting", setting })} />
          </SectionCard>

          <SectionCard
            icon={Bell}
            title="Notification rules"
            description="Các cấu hình thông báo đang lưu trong system_settings với prefix notification."
            actionLabel="Thêm rule"
            onAction={() => { settingMutation.reset(); setDialog({ type: "setting", setting: { id: "", key: "notification.", value: "", type: "json", createdAt: null } }); }}
          >
            <SettingsTable items={data.notificationRules} onEdit={(setting) => setDialog({ type: "setting", setting })} onDelete={(setting) => setDialog({ type: "delete-setting", setting })} />
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="SLA rules" description="Thời hạn xử lý theo module và hành động tự động khi vi phạm." actionLabel="Thêm SLA" onAction={() => { slaMutation.reset(); setDialog({ type: "sla" }); }}>
            <SlaTable items={data.slaRules} onEdit={(rule) => setDialog({ type: "sla", rule })} onDelete={(rule) => setDialog({ type: "delete-sla", rule })} />
          </SectionCard>

          <SectionCard icon={FileDown} title="Export settings" description="Cấu hình report/export đang lưu trong report_configs." actionLabel="Thêm export" onAction={() => { exportMutation.reset(); setDialog({ type: "export" }); }}>
            <ExportTable items={data.exportSettings} onEdit={(config) => setDialog({ type: "export", config })} onDelete={(config) => setDialog({ type: "delete-export", config })} />
          </SectionCard>

          <SectionCard icon={Activity} title="Queue/system health" description="Trạng thái automation jobs gần nhất." actionLabel="" onAction={undefined}>
            <Table>
              <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Trạng thái</TableHead><TableHead>Tạo lúc</TableHead><TableHead>Hoàn tất</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.health.recentJobs.map((job) => (
                  <TableRow key={job.id}><TableCell>{job.type}</TableCell><TableCell><Badge variant="outline">{job.status}</Badge></TableCell><TableCell>{formatDate(job.createdAt)}</TableCell><TableCell>{formatDate(job.completedAt)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
            {data.health.recentJobs.length === 0 && <EmptyState title="Chưa có automation job" description="Queue hiện chưa ghi nhận job gần đây." />}
          </SectionCard>
        </>
      )}

      <Dialog open={dialog?.type === "setting"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cấu hình key/value</DialogTitle><DialogDescription>Lưu key duy nhất trong system_settings. Nếu key đã tồn tại hệ thống sẽ cập nhật.</DialogDescription></DialogHeader>
          <SettingForm initialValues={dialog?.type === "setting" && dialog.setting ? toSettingInput(dialog.setting) : emptySetting} isPending={settingMutation.isPending} error={settingMutation.error} onSubmit={(input) => settingMutation.mutate(input)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog?.type === "sla"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.type === "sla" && dialog.rule ? "Cập nhật SLA" : "Thêm SLA"}</DialogTitle><DialogDescription>Thiết lập thời hạn xử lý và hành động khi vi phạm.</DialogDescription></DialogHeader>
          <SlaForm initialValues={dialog?.type === "sla" && dialog.rule ? toSlaInput(dialog.rule) : emptySla} isPending={slaMutation.isPending} error={slaMutation.error} onSubmit={(input) => slaMutation.mutate(input)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog?.type === "export"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.type === "export" && dialog.config ? "Cập nhật export" : "Thêm export"}</DialogTitle><DialogDescription>Filters cần là JSON hợp lệ để lưu vào report_configs.</DialogDescription></DialogHeader>
          <ExportForm initialValues={dialog?.type === "export" && dialog.config ? toExportInput(dialog.config) : emptyExport} isPending={exportMutation.isPending} error={exportMutation.error} onSubmit={(input) => exportMutation.mutate(input)} />
        </DialogContent>
      </Dialog>
      <ConfirmDelete open={dialog?.type === "delete-setting"} title="Xóa setting" error={deleteSettingMutation.error} isPending={deleteSettingMutation.isPending} onClose={() => setDialog(null)} onConfirm={() => dialog?.type === "delete-setting" && deleteSettingMutation.mutate(dialog.setting.id)} />
      <ConfirmDelete open={dialog?.type === "delete-sla"} title="Xóa SLA" error={deleteSlaMutation.error} isPending={deleteSlaMutation.isPending} onClose={() => setDialog(null)} onConfirm={() => dialog?.type === "delete-sla" && deleteSlaMutation.mutate(dialog.rule.id)} />
      <ConfirmDelete open={dialog?.type === "delete-export"} title="Xóa export" error={deleteExportMutation.error} isPending={deleteExportMutation.isPending} onClose={() => setDialog(null)} onConfirm={() => dialog?.type === "delete-export" && deleteExportMutation.mutate(dialog.config.id)} />
    </div>
  );
}

function HealthCard({ title, value, icon: Icon, variant = "ok" }: { title: string; value: string; icon: LucideIcon; variant?: "ok" | "warning" }) {
  return <Card className="border-border/70 shadow-xs"><CardContent className="flex items-center gap-3 p-5"><Icon className={variant === "warning" ? "size-5 text-amber-600" : "size-5 text-muted-foreground"} aria-hidden="true" /><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}

function SectionCard({ icon: Icon, title, description, actionLabel, onAction, children }: { icon: LucideIcon; title: string; description: string; actionLabel: string; onAction?: () => void; children: ReactNode }) {
  return <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs"><CardHeader className="flex-row items-start justify-between gap-4 border-b py-5"><div className="grid gap-1"><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-muted-foreground" aria-hidden="true" />{title}</CardTitle><CardDescription>{description}</CardDescription></div>{onAction && <Button type="button" onClick={onAction}><Plus aria-hidden="true" />{actionLabel}</Button>}</CardHeader><CardContent className="p-0">{children}</CardContent></Card>;
}

function SettingsTable({ items, onEdit, onDelete }: { items: SystemSetting[]; onEdit: (item: SystemSetting) => void; onDelete: (item: SystemSetting) => void }) {
  if (items.length === 0) return <EmptyState title="Chưa có cấu hình" description="Thêm key/value để kích hoạt cấu hình này." />;
  return <Table><TableHeader><TableRow><TableHead className="px-5">Key</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id || item.key}><TableCell className="px-5 font-medium">{item.key}</TableCell><TableCell>{item.type ?? "-"}</TableCell><TableCell className="max-w-md truncate">{item.value ?? "-"}</TableCell><TableCell className="text-right"><RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} disableDelete={!item.id} /></TableCell></TableRow>)}</TableBody></Table>;
}

function SlaTable({ items, onEdit, onDelete }: { items: SlaRule[]; onEdit: (item: SlaRule) => void; onDelete: (item: SlaRule) => void }) {
  if (items.length === 0) return <EmptyState title="Chưa có SLA" description="Thêm SLA để kiểm soát thời hạn xử lý." />;
  return <Table><TableHeader><TableRow><TableHead className="px-5">SLA</TableHead><TableHead>Module</TableHead><TableHead>Thời hạn</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="px-5"><div className="font-medium">{item.name}</div><div className="text-sm text-muted-foreground">{item.action ?? "-"}</div></TableCell><TableCell>{item.module ?? "-"}</TableCell><TableCell>{item.durationMinutes} phút</TableCell><TableCell><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Đang bật" : "Tắt"}</Badge></TableCell><TableCell className="text-right"><RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} /></TableCell></TableRow>)}</TableBody></Table>;
}

function ExportTable({ items, onEdit, onDelete }: { items: ExportSetting[]; onEdit: (item: ExportSetting) => void; onDelete: (item: ExportSetting) => void }) {
  if (items.length === 0) return <EmptyState title="Chưa có cấu hình export" description="Thêm cấu hình report/export để dùng lại bộ lọc." />;
  return <Table><TableHeader><TableRow><TableHead className="px-5">Tên</TableHead><TableHead>Loại report</TableHead><TableHead>Trạng thái</TableHead><TableHead>Cập nhật</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="px-5 font-medium">{item.name}</TableCell><TableCell>{item.reportType}</TableCell><TableCell><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Đang bật" : "Tắt"}</Badge></TableCell><TableCell>{formatDate(item.updatedAt)}</TableCell><TableCell className="text-right"><RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} /></TableCell></TableRow>)}</TableBody></Table>;
}

function RowActions({ onEdit, onDelete, disableDelete = false }: { onEdit: () => void; onDelete: () => void; disableDelete?: boolean }) {
  return <div className="inline-flex gap-2"><Button type="button" size="sm" variant="outline" onClick={onEdit}><Pencil aria-hidden="true" />Sửa</Button><Button type="button" size="sm" variant="outline" disabled={disableDelete} onClick={onDelete}><Trash2 aria-hidden="true" />Xóa</Button></div>;
}

function SettingForm({ initialValues, isPending, error, onSubmit }: { initialValues: SettingInput; isPending: boolean; error: Error | null; onSubmit: (input: SettingInput) => void }) {
  const [values, setValues] = useState(initialValues);
  const [formError, setFormError] = useState("");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setFormError(""); if (values.key.trim().length < 2) { setFormError("Key cần tối thiểu 2 ký tự."); return; } onSubmit({ ...values, key: values.key.trim(), value: values.value.trim() }); }}>{error && <MutationError error={error} />}{formError && <p className="text-sm text-destructive">{formError}</p>}<TextField id="setting-key" label="Key *" value={values.key} onChange={(key) => setValues((current) => ({ ...current, key }))} /><Field><FieldLabel>Type</FieldLabel><Select value={values.type || "string"} onValueChange={(type) => setValues((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["string", "number", "boolean", "json", "secret"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></Field><TextField id="setting-value" label="Value" value={values.value} onChange={(value) => setValues((current) => ({ ...current, value }))} /><DialogFooter showCloseButton><Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu setting"}</Button></DialogFooter></form>;
}

function SlaForm({ initialValues, isPending, error, onSubmit }: { initialValues: SlaRuleInput; isPending: boolean; error: Error | null; onSubmit: (input: SlaRuleInput) => void }) {
  const [values, setValues] = useState(initialValues);
  return <form className="grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit({ ...values, name: values.name.trim(), module: values.module.trim(), action: values.action.trim() }); }}>{error && <MutationError error={error} />}<TextField id="sla-name" label="Tên SLA *" value={values.name} onChange={(name) => setValues((current) => ({ ...current, name }))} /><TextField id="sla-module" label="Module" value={values.module} onChange={(module) => setValues((current) => ({ ...current, module }))} /><Field><FieldLabel htmlFor="sla-duration">Thời hạn phút *</FieldLabel><Input id="sla-duration" type="number" min={1} value={values.durationMinutes} onChange={(event) => setValues((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /><FieldError /></Field><TextField id="sla-action" label="Hành động" value={values.action} onChange={(action) => setValues((current) => ({ ...current, action }))} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={values.isActive} onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked === true }))} />Đang bật</label><DialogFooter showCloseButton><Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu SLA"}</Button></DialogFooter></form>;
}

function ExportForm({ initialValues, isPending, error, onSubmit }: { initialValues: ExportSettingInput; isPending: boolean; error: Error | null; onSubmit: (input: ExportSettingInput) => void }) {
  const [values, setValues] = useState({ ...initialValues, filtersText: JSON.stringify(initialValues.filters ?? {}, null, 2) });
  const [formError, setFormError] = useState("");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); try { onSubmit({ name: values.name.trim(), reportType: values.reportType.trim(), filters: JSON.parse(values.filtersText || "{}"), isActive: values.isActive }); } catch { setFormError("Filters cần là JSON hợp lệ."); } }}>{error && <MutationError error={error} />}{formError && <p className="text-sm text-destructive">{formError}</p>}<TextField id="export-name" label="Tên export *" value={values.name} onChange={(name) => setValues((current) => ({ ...current, name }))} /><TextField id="export-type" label="Loại report *" value={values.reportType} onChange={(reportType) => setValues((current) => ({ ...current, reportType }))} /><TextField id="export-filters" label="Filters JSON" value={values.filtersText} onChange={(filtersText) => setValues((current) => ({ ...current, filtersText }))} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={values.isActive} onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked === true }))} />Đang bật</label><DialogFooter showCloseButton><Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu export"}</Button></DialogFooter></form>;
}

function TextField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function ConfirmDelete({ open, title, isPending, error, onClose, onConfirm }: { open: boolean; title: string; isPending: boolean; error: Error | null; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Thao tác này sẽ xóa cấu hình khỏi hệ thống.</DialogDescription></DialogHeader>{error && <MutationError error={error} />}<DialogFooter showCloseButton><Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>{isPending ? "Đang xóa..." : "Xóa"}</Button></DialogFooter></DialogContent></Dialog>;
}

function MutationError({ error }: { error: Error }) {
  return <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}</p>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";
}

function toSettingInput(setting: SystemSetting): SettingInput {
  return { key: setting.key, value: setting.value ?? "", type: setting.type ?? "string" };
}
function toSlaInput(rule: SlaRule): SlaRuleInput {
  return { name: rule.name, module: rule.module ?? "", durationMinutes: rule.durationMinutes, action: rule.action ?? "", isActive: rule.isActive };
}
function toExportInput(config: ExportSetting): ExportSettingInput {
  return { name: config.name, reportType: config.reportType, filters: config.filters ?? {}, isActive: config.isActive };
}
