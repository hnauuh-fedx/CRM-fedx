import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeft, CalendarDays, ChevronDown, ExternalLink, FileText, History, Network, Pencil, StickyNote, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  addLeadNote,
  assignLead,
  attachLeadFile,
  deleteLead,
  getLead,
  getLeadActionOptions,
  updateLead,
  updateLeadCustomFields,
} from "@/services/lead.service";
import { LeadForm } from "../components/lead-form";
import { LeadCustomFieldsCard } from "../components/lead-custom-fields-card";
import { toLeadFormOptions, toLeadFormValues } from "../lead-form.helpers";
import type { LeadActionOptions, LeadDetail, LeadFormInput } from "../lead.types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const activityLabels: Record<string, string> = {
  lead_created: "Tạo lead",
  lead_updated: "Cập nhật thông tin",
  pipeline_stage_changed: "Chuyển giai đoạn",
  note_created: "Ghi chú chăm sóc",
  file_attached: "Đính kèm tệp",
  lead_assigned: "Phân công phụ trách",
  lead_deleted: "Xóa lead",
  reminder_created: "Tạo nhắc việc",
  reminder_updated: "Cập nhật nhắc việc",
  reminder_completed: "Hoàn tất nhắc việc",
  reminder_due: "Nhắc việc đến hạn",
  reminder_overdue: "Nhắc việc quá hạn",
  call: "Cuộc gọi",
  email: "Email",
  meeting: "Cuộc hẹn",
  consultation: "Tư vấn",
  follow_up: "Theo dõi tiếp",
  other: "Hoạt động khác",
  source_received: "Ghi nhận nguồn mới",
};

function getLeadWorkflowLabel(lead: LeadDetail) {
  return lead.pipelineStage?.name ?? "Chưa chọn tiến trình";
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}
function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

type LeadDetailPageProps = {
  listPath?: string;
  listLabel?: string;
  eyebrow?: string;
};

export function LeadDetailPage({
  listPath = "/sale/leads",
  listLabel = "Danh sách lead",
  eyebrow = "CRM Sale / Chi tiết lead",
}: LeadDetailPageProps = {}) {
  const auth = useAuth();
  const { leadId = "" } = useParams();
  const canUpdate = ["lead.update_all", "lead.update_department", "lead.update_assigned"].some(auth.can);
  const canNote = canUpdate || auth.can("lead_note.create");
  const canFile = canUpdate || auth.can("file.upload");
  const canAssign = auth.can("lead.assign") || auth.can("lead.reassign");
  const canDelete = auth.can("lead.delete");
  const canAct = canUpdate || canNote || canFile || canAssign;
  const leadQuery = useQuery({
    queryKey: ["leads", "detail", leadId],
    queryFn: () => getLead(leadId, auth.accessToken!),
    enabled: Boolean(leadId),
  });
  const optionsQuery = useQuery({
    queryKey: ["leads", "action-options"],
    queryFn: () => getLeadActionOptions(auth.accessToken!),
    enabled: canAct,
  });
  const [isEditing, setIsEditing] = useState(false);

  if (leadQuery.isLoading) {
    return (
      <output className="mx-auto flex max-w-7xl flex-col gap-6" aria-label="Đang tải chi tiết lead">
        <Skeleton className="h-20 max-w-md" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </output>
    );
  }
  if (leadQuery.isError || !leadQuery.data) {
    return (
      <Card className="mx-auto max-w-xl border-border/70 shadow-xs">
        <Empty className="border-0 py-12">
          <EmptyHeader>
            <EmptyTitle>Không thể mở chi tiết lead</EmptyTitle>
            <EmptyDescription>Lead không tồn tại hoặc nằm ngoài phạm vi truy cập của bạn.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button asChild variant="outline"><Link to={listPath}><ArrowLeft aria-hidden="true" />Quay lại danh sách</Link></Button></EmptyContent>
        </Empty>
      </Card>
    );
  }

  const lead = leadQuery.data.data;
  const options = optionsQuery.data;

  return (
    <div className="mx-auto flex max-w-400 flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="mr-auto -ml-3">
        <Link to={listPath}><ArrowLeft aria-hidden="true" />{listLabel}</Link>
      </Button>
      <PageHeader
        eyebrow={eyebrow}
        title={lead.fullName}
        description={`${lead.leadCode ?? "Chưa có mã lead"} · Tạo ngày ${formatDate(lead.createdAt)}`}
        actions={<div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{getLeadWorkflowLabel(lead)}</Badge>{canUpdate && <Button type="button" size="sm" variant={isEditing ? "secondary" : "default"} onClick={() => setIsEditing((value) => !value)}><Pencil aria-hidden="true" />{isEditing ? "Đóng chỉnh sửa" : "Chỉnh sửa"}</Button>}</div>}
      />

      <PipelineProgressCard lead={lead} options={options} />
      {isEditing && canUpdate && <Card className="border-primary/30 shadow-xs"><CardHeader><CardTitle>Cập nhật hồ sơ ứng viên</CardTitle><CardDescription>Cập nhật thông tin cá nhân, học vấn, tuyển sinh và chăm sóc trong cùng hồ sơ.</CardDescription></CardHeader><CardContent><EditLeadForm lead={lead} options={options} accessToken={auth.accessToken!} /></CardContent></Card>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.48fr)]">
        <aside className="flex min-w-0 flex-col gap-6">
          <LeadSummaryCard lead={lead} canUpdate={canUpdate} onEdit={() => setIsEditing(true)} />
          <SourceOccurrencesCard lead={lead} />
          <LeadCustomFieldsCard leadId={lead.id} />
          {canAssign && <AssignmentActionCard key={lead.assignee?.id ?? "unassigned"} lead={lead} options={options} accessToken={auth.accessToken!} />}
          {canDelete && <DeleteLeadCard lead={lead} accessToken={auth.accessToken!} listPath={listPath} />}
          {!canUpdate && <LeadOwnershipCard lead={lead} />}
        </aside>
        <ActivityWorkspace lead={lead} canNote={canNote} canFile={canFile} accessToken={auth.accessToken!} />
      </div>
    </div>
  );
}

export function PipelineProgressCard({ lead, options, fallbackStages = [], onStageChange, isChanging = false }: { lead: LeadDetail; options?: LeadActionOptions; fallbackStages?: Array<{ id: string; name: string; color: string | null }>; onStageChange?: (stageId: string) => void; isChanging?: boolean }) {
  const currentStage = options?.stages.find((stage) => stage.id === lead.pipelineStage?.id);
  const availableStages = options?.stages.length ? options.stages : fallbackStages.map((stage) => ({ ...stage, pipelineId: null, pipelineName: null }));
  const stages = availableStages.filter((stage) => !currentStage?.pipelineId || stage.pipelineId === currentStage.pipelineId);
  const visibleStages = stages.length > 0 ? stages : lead.pipelineStage ? [{ ...lead.pipelineStage, pipelineId: null, pipelineName: null }] : [];
  const currentIndex = visibleStages.findIndex((stage) => stage.id === lead.pipelineStage?.id);
  return <Card className="overflow-hidden border-border/70 shadow-xs"><CardHeader className="pb-3"><CardTitle className="text-base">Tiến trình</CardTitle></CardHeader><CardContent>{visibleStages.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có tiến trình áp dụng cho Lead này.</p> : <ol className="flex min-w-max gap-2 overflow-x-auto pb-2" aria-label="Tiến trình xử lý Lead">{visibleStages.map((stage, index) => { const isCurrent = index === currentIndex; const isCompleted = currentIndex >= 0 && index < currentIndex; return <li key={stage.id} className="min-w-40"><button type="button" className={`min-h-10 w-full rounded-md border px-4 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${isCurrent ? "border-primary bg-primary text-primary-foreground" : isCompleted ? "border-primary/30 bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"} ${onStageChange && !isCurrent ? "hover:border-primary/60 hover:text-primary" : ""}`} aria-current={isCurrent ? "step" : undefined} disabled={!onStageChange || isCurrent || isChanging} onClick={() => onStageChange?.(stage.id)}>{stage.name}</button></li>; })}</ol>}</CardContent></Card>;
}

type ActivityTab = "activities" | "notes" | "changes" | "files";

export function ActivityWorkspace({ lead, canNote, canFile, accessToken }: { lead: LeadDetail; canNote: boolean; canFile: boolean; accessToken: string }) {
  const [activeTab, setActiveTab] = useState<ActivityTab>("activities");
  const tabs: Array<{ id: ActivityTab; label: string; count: number; icon: typeof Activity }> = [
    { id: "activities", label: "Hoạt động", count: lead.activities.length, icon: Activity },
    { id: "notes", label: "Ghi chú", count: lead.notes.length, icon: StickyNote },
    { id: "changes", label: "Thay đổi gần đây", count: lead.recentChanges.length, icon: History },
    { id: "files", label: "Tệp đính kèm", count: lead.files.length, icon: FileText },
  ];
  return <Card className="min-w-0 border-border/70 shadow-xs"><CardHeader className="border-b pb-0"><div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Thông tin hoạt động của Lead">{tabs.map((tab) => { const Icon = tab.icon; const selected = activeTab === tab.id; return <button key={tab.id} type="button" role="tab" aria-selected={selected} aria-controls={`lead-tab-${tab.id}`} id={`lead-tab-button-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" aria-hidden="true" />{tab.label}<Badge variant="secondary" className="min-w-6 justify-center px-1.5">{tab.count}</Badge></button>; })}</div></CardHeader><CardContent className="pt-6" role="tabpanel" id={`lead-tab-${activeTab}`} aria-labelledby={`lead-tab-button-${activeTab}`}>{activeTab === "activities" && <ActivityPanel lead={lead} />}{activeTab === "notes" && <NotesPanel lead={lead} canNote={canNote} accessToken={accessToken} />}{activeTab === "changes" && <RecentChangesPanel lead={lead} />}{activeTab === "files" && <FilesPanel lead={lead} canFile={canFile} accessToken={accessToken} />}</CardContent></Card>;
}

function ActivityPanel({ lead }: { lead: LeadDetail }) {
  return <div className="flex flex-col gap-6"><TimelineCard lead={lead} embedded /><HistoryCard lead={lead} embedded /></div>;
}

function NotesPanel({ lead, canNote, accessToken }: { lead: LeadDetail; canNote: boolean; accessToken: string }) {
  return <div className="flex flex-col gap-5">{canNote && <NoteComposer leadId={lead.id} accessToken={accessToken} />}{lead.notes.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có ghi chú chăm sóc.</p> : <ol className="flex flex-col gap-4">{lead.notes.map((note) => <li key={note.id} className="rounded-lg border bg-muted/20 p-4"><p className="whitespace-pre-wrap text-sm">{note.content}</p><p className="mt-2 text-xs text-muted-foreground">{note.author?.fullName ?? "Hệ thống"} · {formatDateTime(note.createdAt)}</p></li>)}</ol>}</div>;
}

function RecentChangesPanel({ lead }: { lead: LeadDetail }) {
  if (lead.recentChanges.length === 0) return <p className="text-sm text-muted-foreground">Chưa ghi nhận thay đổi nào trên Lead này.</p>;
  return <ol className="flex flex-col gap-3">{lead.recentChanges.map((change, index) => <li key={change.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">{index + 1}</span><div className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Nhật ký</Badge><p className="text-sm font-semibold">{change.description}</p></div><p className="mt-2 text-xs text-muted-foreground">{change.actor?.fullName ?? "Hệ thống"} · {formatDateTime(change.createdAt)}</p></div></li>)}</ol>;
}

function FilesPanel({ lead, canFile, accessToken }: { lead: LeadDetail; canFile: boolean; accessToken: string }) {
  return <div className="flex flex-col gap-5">{canFile && <FileComposer leadId={lead.id} accessToken={accessToken} />}{lead.files.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có tệp đính kèm.</p> : <ul className="flex flex-col gap-3">{lead.files.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="flex min-w-0 items-center gap-3"><FileText className="shrink-0" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-sm font-medium">{file.fileName}</p><p className="text-xs text-muted-foreground">{formatDate(file.createdAt)}</p></div></div><Button asChild size="sm" variant="outline"><a href={file.fileUrl} target="_blank" rel="noreferrer" aria-label={`Mở tệp ${file.fileName}`}><ExternalLink aria-hidden="true" />Mở</a></Button></li>)}</ul>}</div>;
}

export function SourceOccurrencesCard({ lead }: { lead: LeadDetail }) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network aria-hidden="true" />Nguồn khách hàng</CardTitle>
        <CardDescription>Mỗi lần Lead phát sinh từ một form hoặc webhook được lưu thành một mục riêng.</CardDescription>
      </CardHeader>
      <CardContent>
        {lead.sourceOccurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lịch sử nguồn.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {lead.sourceOccurrences.map((occurrence, index) => (
              <details key={occurrence.id} className="group rounded-lg border bg-card open:border-primary/40">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{occurrence.sourceName}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(occurrence.receivedAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                    {index === 0 ? "Mới nhất" : "Xem thêm"}
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>
                <dl className="grid gap-2 border-t px-4 py-3 text-sm">
                  <DetailValue label="Nhóm nguồn" value={occurrence.sourceGroup.name} />
                  <DetailValue label="Nguồn" value={occurrence.sourceName} />
                  <DetailValue label="Thời gian" value={formatDateTime(occurrence.receivedAt)} />
                  <DetailValue label="Ghi chú" value={occurrence.note ?? "-"} />
                </dl>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeadSummaryCard({ lead, canUpdate, onEdit }: { lead: LeadDetail; canUpdate: boolean; onEdit: () => void }) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>Thông tin cơ bản</CardTitle><CardDescription>Thông tin liên hệ và nghiệp vụ hiện tại.</CardDescription></div>{canUpdate && <Button type="button" size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Chỉnh sửa thông tin Lead"><Pencil aria-hidden="true" /></Button>}</CardHeader>
      <CardContent><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <DetailValue label="Họ và tên" value={lead.fullName} />
        <DetailValue label="Số điện thoại" value={lead.phone ?? "Chưa cập nhật"} />
        <DetailValue label="Email" value={lead.email ?? "Chưa cập nhật"} />
        <DetailValue label="Ngày sinh" value={formatDate(lead.dateOfBirth)} />
        <DetailValue label="Địa chỉ" value={lead.currentAddress ?? lead.specificAddress ?? "Chưa cập nhật"} />
        <DetailValue label="Nhóm nguồn" value={lead.origin?.name ?? "Chưa cập nhật"} />
        <DetailValue label="Nguồn học viên" value={lead.source?.name ?? "Chưa chọn"} />
        <DetailValue label="Tiến trình" value={lead.pipelineStage?.name ?? "Chưa cập nhật"} />
        <DetailValue label="Nhân viên phụ trách" value={lead.assignee?.fullName ?? "Chưa phân công"} />
        <DetailValue label="Mức độ quan tâm" value={lead.temperature ?? "-"} />
        <DetailValue label="Chương trình" value={lead.institutionProgram ? `${lead.institutionProgram.name} · ${lead.institutionProgram.institutionName}` : "Chưa chọn"} />
        <DetailValue label="Ngành đăng ký" value={lead.majorName ?? "Chưa chọn"} />
        <DetailValue label="Ghi chú" value={lead.note ?? "-"} />
      </dl></CardContent>
    </Card>
  );
}

function LeadOwnershipCard({ lead }: { lead: LeadDetail }) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader><CardTitle>Phụ trách hiện tại</CardTitle></CardHeader>
      <CardContent><dl className="grid gap-4">
        <DetailValue label="Nhân viên phụ trách" value={lead.assignee?.fullName ?? "Chưa phân công"} />
        <DetailValue label="Người sở hữu" value={lead.owner?.fullName ?? "-"} />
      </dl></CardContent>
    </Card>
  );
}

function EditLeadForm({ lead, options, accessToken }: { lead: LeadDetail; options?: LeadActionOptions; accessToken: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: async (input: LeadFormInput) => { const result = await updateLead(lead.id, input, accessToken); const values = Object.entries(input.customFieldValues).map(([fieldId, value]) => ({ fieldId, value })); if (values.length > 0) await updateLeadCustomFields(lead.id, { values }, accessToken); return result; }, onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["sale"] });
  } });
  return <div className="flex flex-col gap-4">{mutation.isError && <MutationError error={mutation.error} />}<LeadForm leadId={lead.id} defaultValues={toLeadFormValues(lead)} options={toLeadFormOptions(lead, options)} submitLabel="Lưu thay đổi" isPending={mutation.isPending} onSubmit={(input) => mutation.mutate(input)} /></div>;
}

function AssignmentActionCard({ lead, options, accessToken }: { lead: LeadDetail; options?: LeadActionOptions; accessToken: string }) {
  const queryClient = useQueryClient();
  const [assigneeId, setAssigneeId] = useState(lead.assignee?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const mutation = useMutation({ mutationFn: () => assignLead(lead.id, { assigneeId, departmentId: departmentId || undefined }, accessToken), onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["sale"] });
  } });
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader><CardTitle>Phân công phụ trách</CardTitle><CardDescription>Chuyển người phụ trách và gửi thông báo cho nhân viên nhận lead.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutation.isError && <MutationError error={mutation.error} />}
        <FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="lead-assignment-user">Nhân viên</FieldLabel><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="lead-assignment-user" className="w-full"><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger><SelectContent><SelectGroup>{(options?.assignees ?? []).map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="lead-assignment-department">Phòng ban</FieldLabel><Select value={departmentId || "__empty__"} onValueChange={(value) => setDepartmentId(value === "__empty__" ? "" : value)}><SelectTrigger id="lead-assignment-department" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__empty__">Không chọn phòng ban</SelectItem>{(options?.departments ?? []).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </FieldGroup>
        <Button type="button" disabled={!assigneeId || mutation.isPending} onClick={() => mutation.mutate()}>Xác nhận phân công</Button>
      </CardContent>
    </Card>
  );
}

function DeleteLeadCard({ lead, accessToken, listPath }: { lead: LeadDetail; accessToken: string; listPath: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteLead(lead.id, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      navigate(listPath, { replace: true });
    },
  });

  return (
    <Card className="border-destructive/30 shadow-xs">
      <CardHeader>
        <CardTitle>Xóa lead</CardTitle>
        <CardDescription>Lead sẽ bị ẩn khỏi danh sách làm việc; lịch sử và audit vẫn được lưu để truy vết.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutation.isError && <MutationError error={mutation.error} />}
        {isConfirming ? (
          <Alert variant="destructive">
            <Trash2 aria-hidden="true" />
            <AlertTitle>Xác nhận xóa lead?</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>Lead {lead.fullName} sẽ không còn hiển thị trong danh sách đang hoạt động.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}
                </Button>
                <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setIsConfirming(false)}>
                  Hủy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Button type="button" variant="destructive" onClick={() => setIsConfirming(true)}>
            <Trash2 data-icon="inline-start" aria-hidden="true" />Xóa lead
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NoteComposer({ leadId, accessToken }: { leadId: string; accessToken: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const mutation = useMutation({ mutationFn: () => addLeadNote(leadId, content, accessToken), onSuccess: () => {
    setContent("");
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["sale"] });
  } });
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (content.trim()) mutation.mutate(); }}>
      {mutation.isError && <MutationError error={mutation.error} />}
      <Field><FieldLabel htmlFor="lead-care-note">Thêm ghi chú chăm sóc</FieldLabel><Textarea id="lead-care-note" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Nội dung cuộc gọi, nhu cầu hoặc bước tiếp theo..." rows={3} /></Field>
      <Button className="self-end" type="submit" disabled={!content.trim() || mutation.isPending}>Lưu ghi chú</Button>
    </form>
  );
}

function FileComposer({ leadId, accessToken }: { leadId: string; accessToken: string }) {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const mutation = useMutation({ mutationFn: () => attachLeadFile(leadId, { fileName, fileUrl }, accessToken), onSuccess: () => {
    setFileName("");
    setFileUrl("");
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["sale"] });
  } });
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (fileName.trim() && fileUrl.trim()) mutation.mutate(); }}>
      {mutation.isError && <MutationError error={mutation.error} />}
      <Alert><FileText aria-hidden="true" /><AlertDescription>Nhập liên kết tệp đã được tải lên kho lưu trữ an toàn của đơn vị.</AlertDescription></Alert>
      <FieldGroup className="gap-3">
        <Field><FieldLabel htmlFor="lead-file-name">Tên tệp</FieldLabel><Input id="lead-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="lead-file-url">Liên kết tệp</FieldLabel><Input id="lead-file-url" type="url" value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} placeholder="https://..." /></Field>
      </FieldGroup>
      <Button className="self-end" type="submit" disabled={!fileName.trim() || !fileUrl.trim() || mutation.isPending}>Gắn tệp</Button>
    </form>
  );
}

function TimelineCard({ lead, embedded = false }: { lead: LeadDetail; embedded?: boolean }) {
  const content = lead.activities.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có hoạt động chăm sóc.</p> : <ol className="flex flex-col gap-4">{lead.activities.map((activity) => <li key={activity.id} className="flex gap-3"><CalendarDays className="shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-medium">{activityLabels[activity.type] ?? activity.type}</p>{activity.content && <p className="text-sm text-muted-foreground">{activity.content}</p>}<p className="text-xs text-muted-foreground">{activity.actor?.fullName ?? "Hệ thống"} · {formatDateTime(activity.createdAt)}</p></div></li>)}</ol>;
  if (embedded) return <section aria-labelledby="lead-activity-title"><h3 id="lead-activity-title" className="mb-4 font-semibold">Lịch sử chăm sóc</h3>{content}</section>;
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader><CardTitle className="flex items-center gap-2"><History aria-hidden="true" />Lịch sử chăm sóc</CardTitle><CardDescription>Hoạt động nghiệp vụ gần nhất của lead.</CardDescription></CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function HistoryCard({ lead, embedded = false }: { lead: LeadDetail; embedded?: boolean }) {
  const content = <div className="flex flex-col gap-5">{lead.stageHistory.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có thay đổi tiến trình.</p> : <ol className="flex flex-col gap-3">{lead.stageHistory.map((history) => <li key={history.id} className="text-sm"><span className="font-medium">{history.fromStage?.name ?? "Khởi tạo"} → {history.toStage?.name ?? "Chưa xác định"}</span><p className="text-muted-foreground">{formatDateTime(history.changedAt)}{history.changedBy ? ` · ${history.changedBy.fullName}` : ""}</p></li>)}</ol>}<Separator />{lead.assignments.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu phân công.</p> : <ol className="flex flex-col gap-3">{lead.assignments.map((assignment) => <li key={assignment.id} className="flex gap-3 text-sm"><UserRound className="shrink-0 text-primary" aria-hidden="true" /><div><p className="font-medium">{assignment.assignee?.fullName ?? "Chưa xác định"}</p><p className="text-muted-foreground">{assignment.department?.name ?? "Không có phòng ban"} · {formatDateTime(assignment.assignedAt)}</p></div></li>)}</ol>}</div>;
  if (embedded) return <section aria-labelledby="lead-history-title" className="border-t pt-6"><h3 id="lead-history-title" className="mb-4 font-semibold">Tiến trình và phân công</h3>{content}</section>;
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader><CardTitle>Lịch sử tiến trình và phân công</CardTitle><CardDescription>Dữ liệu truy vết xử lý lead gần nhất.</CardDescription></CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function MutationError({ error }: { error: Error }) {
  return <p role="alert" className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Không thể lưu thay đổi. Vui lòng thử lại."}</p>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>;
}
