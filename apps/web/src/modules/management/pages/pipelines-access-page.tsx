import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, GitBranch, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedPipeline,
  createManagedPipelineStage,
  deleteManagedPipeline,
  deleteManagedPipelineStage,
  getManagedPipelines,
  getPipelineManagementOptions,
  updateManagedPipeline,
  updateManagedPipelineStage,
} from "@/services/pipeline-management.service";
import type { ManagedPipeline, ManagedPipelineStage, PipelineInput, PipelineStageInput } from "../pipeline-management.types";

const pageSize = 20;
const emptyFilters = { search: "", module: "" };
const emptyPipelineForm: PipelineInput = { name: "", module: "lead" };
const emptyStageForm: PipelineStageInput = { name: "", position: 1, color: "#2563EB", isFinal: false };

type DialogState =
  | { type: "create-pipeline" }
  | { type: "edit-pipeline"; pipeline: ManagedPipeline }
  | { type: "delete-pipeline"; pipeline: ManagedPipeline }
  | { type: "create-stage"; pipeline: ManagedPipeline }
  | { type: "edit-stage"; pipeline: ManagedPipeline; stage: ManagedPipelineStage }
  | { type: "delete-stage"; pipeline: ManagedPipeline; stage: ManagedPipelineStage }
  | null;

export function PipelinesAccessPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingPipeline = dialog?.type === "edit-pipeline" ? dialog.pipeline : null;
  const deletingPipeline = dialog?.type === "delete-pipeline" ? dialog.pipeline : null;
  const editingStage = dialog?.type === "edit-stage" ? dialog.stage : null;
  const stagePipeline = dialog?.type === "create-stage" || dialog?.type === "edit-stage" || dialog?.type === "delete-stage" ? dialog.pipeline : null;
  const deletingStage = dialog?.type === "delete-stage" ? dialog.stage : null;

  const listQuery = useQuery({
    queryKey: ["pipelines", "management", page, appliedFilters],
    queryFn: () =>
      getManagedPipelines(
        { page, limit: pageSize, sortBy: "name", sortOrder: "asc", ...appliedFilters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["pipelines", "management", "options"],
    queryFn: () => getPipelineManagementOptions(auth.accessToken!),
  });
  const createPipelineMutation = useMutation({
    mutationFn: (input: PipelineInput) => createManagedPipeline(input, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });
  const updatePipelineMutation = useMutation({
    mutationFn: (input: PipelineInput) => updateManagedPipeline(editingPipeline!.id, input, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });
  const deletePipelineMutation = useMutation({
    mutationFn: () => deleteManagedPipeline(deletingPipeline!.id, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });
  const createStageMutation = useMutation({
    mutationFn: (input: PipelineStageInput) => createManagedPipelineStage(stagePipeline!.id, input, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });
  const updateStageMutation = useMutation({
    mutationFn: (input: PipelineStageInput) => updateManagedPipelineStage(stagePipeline!.id, editingStage!.id, input, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });
  const deleteStageMutation = useMutation({
    mutationFn: () => deleteManagedPipelineStage(stagePipeline!.id, deletingStage!.id, auth.accessToken!),
    onSuccess: () => closeAndRefresh(),
  });

  function closeAndRefresh() {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: ["pipelines", "management"] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  }

  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;
  const modules = Array.from(new Set(["lead", ...(optionsQuery.data?.modules ?? [])]));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản lý pipeline"
        scopeLabel="Quyền quản trị"
        description="Quản lý pipeline, stage, thứ tự hiển thị, màu nhận diện và các stage kết thúc dùng trong lead và báo cáo."
        actions={
          <Button type="button" onClick={() => { createPipelineMutation.reset(); setDialog({ type: "create-pipeline" }); }}>
            <Plus aria-hidden="true" />
            Thêm pipeline
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="size-5 text-muted-foreground" aria-hidden="true" />
            Bộ lọc pipeline
          </CardTitle>
          <CardDescription>Tìm theo tên pipeline, module hoặc tên stage.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ ...filters, search: filters.search.trim() });
              setPage(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="pipeline-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="pipeline-search" className="pl-9" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="Pipeline hoặc stage" />
              </div>
            </Field>
            <Field>
              <FieldLabel>Module</FieldLabel>
              <Select value={filters.module || "__all__"} onValueChange={(module) => setFilters((value) => ({ ...value, module: module === "__all__" ? "" : module }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tất cả</SelectItem>
                  {modules.map((module) => <SelectItem key={module} value={module}>{module}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }}>
              Xóa lọc
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Danh sách pipeline</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} pipeline` : "Đang lấy dữ liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách pipeline" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách pipeline" />
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có pipeline phù hợp" description="Thêm pipeline mới hoặc điều chỉnh bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh sách pipeline và stage</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-64 px-5">Pipeline</TableHead>
                    <TableHead className="min-w-105">Stage</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((pipeline) => (
                    <TableRow key={pipeline.id} className="align-top">
                      <TableCell className="px-5">
                        <div className="font-medium">{pipeline.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {pipeline.module && <Badge variant="outline">{pipeline.module}</Badge>}
                          <Badge variant="secondary">{pipeline.stageCount} stage</Badge>
                          <Badge variant="secondary">{pipeline.finalStageCount} final</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-2">
                          {pipeline.stages.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Chưa có stage</span>
                          ) : (
                            pipeline.stages.map((stage) => (
                              <div key={stage.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                                <span className="size-3 rounded-full border" style={{ backgroundColor: stage.color ?? "#94A3B8" }} aria-hidden="true" />
                                <span className="font-medium">{stage.position}. {stage.name}</span>
                                {stage.isFinal && <Badge variant="outline"><CheckCircle2 className="size-3" aria-hidden="true" /> Final</Badge>}
                                <Badge variant="secondary">{stage.leadCount} lead</Badge>
                                <div className="ml-auto flex gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => { updateStageMutation.reset(); setDialog({ type: "edit-stage", pipeline, stage }); }}>
                                    <Pencil aria-hidden="true" />
                                    Sửa
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" disabled={stage.leadCount > 0 || stage.historyCount > 0} onClick={() => { deleteStageMutation.reset(); setDialog({ type: "delete-stage", pipeline, stage }); }}>
                                    <Trash2 aria-hidden="true" />
                                    Xóa
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{pipeline.leadCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { createStageMutation.reset(); setDialog({ type: "create-stage", pipeline }); }}>
                            <Plus aria-hidden="true" />
                            Stage
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => { updatePipelineMutation.reset(); setDialog({ type: "edit-pipeline", pipeline }); }}>
                            <Pencil aria-hidden="true" />
                            Sửa
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={pipeline.leadCount > 0 || pipeline.historyCount > 0} onClick={() => { deletePipelineMutation.reset(); setDialog({ type: "delete-pipeline", pipeline }); }}>
                            <Trash2 aria-hidden="true" />
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pagination && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft aria-hidden="true" />
              Trước
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>
              Sau
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialog?.type === "create-pipeline" || dialog?.type === "edit-pipeline"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPipeline ? "Cập nhật pipeline" : "Thêm pipeline"}</DialogTitle>
            <DialogDescription>Pipeline gom các stage dùng cho lead và báo cáo chuyển đổi.</DialogDescription>
          </DialogHeader>
          <PipelineForm
            initialValues={editingPipeline ? { name: editingPipeline.name, module: editingPipeline.module ?? "" } : emptyPipelineForm}
            isPending={createPipelineMutation.isPending || updatePipelineMutation.isPending}
            error={createPipelineMutation.error ?? updatePipelineMutation.error}
            mode={editingPipeline ? "edit" : "create"}
            onSubmit={(input) => {
              if (editingPipeline) updatePipelineMutation.mutate(input);
              else createPipelineMutation.mutate(input);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "create-stage" || dialog?.type === "edit-stage"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStage ? "Cập nhật stage" : "Thêm stage"}</DialogTitle>
            <DialogDescription>{stagePipeline ? `Pipeline: ${stagePipeline.name}` : "Thiết lập stage trong pipeline."}</DialogDescription>
          </DialogHeader>
          <StageForm
            initialValues={editingStage ? toStageFormValues(editingStage) : { ...emptyStageForm, position: (stagePipeline?.stages.length ?? 0) + 1 }}
            isPending={createStageMutation.isPending || updateStageMutation.isPending}
            error={createStageMutation.error ?? updateStageMutation.error}
            mode={editingStage ? "edit" : "create"}
            onSubmit={(input) => {
              if (editingStage) updateStageMutation.mutate(input);
              else createStageMutation.mutate(input);
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={dialog?.type === "delete-pipeline"}
        title="Xóa pipeline"
        description={`Pipeline "${deletingPipeline?.name ?? ""}" sẽ bị xóa cùng các stage chưa có dữ liệu sử dụng.`}
        isPending={deletePipelineMutation.isPending}
        error={deletePipelineMutation.error}
        actionLabel="Xóa pipeline"
        onClose={() => setDialog(null)}
        onConfirm={() => deletePipelineMutation.mutate()}
      />
      <ConfirmDeleteDialog
        open={dialog?.type === "delete-stage"}
        title="Xóa stage"
        description={`Stage "${deletingStage?.name ?? ""}" sẽ bị xóa khỏi pipeline "${stagePipeline?.name ?? ""}".`}
        isPending={deleteStageMutation.isPending}
        error={deleteStageMutation.error}
        actionLabel="Xóa stage"
        onClose={() => setDialog(null)}
        onConfirm={() => deleteStageMutation.mutate()}
      />
    </div>
  );
}

function toStageFormValues(stage: ManagedPipelineStage): PipelineStageInput {
  return { name: stage.name, position: stage.position, color: stage.color ?? "#2563EB", isFinal: stage.isFinal };
}

function PipelineForm({ initialValues, isPending, error, mode, onSubmit }: { initialValues: PipelineInput; isPending: boolean; error: Error | null; mode: "create" | "edit"; onSubmit: (input: PipelineInput) => void }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof PipelineInput, string>>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof PipelineInput, string>> = {};
    if (values.name.trim().length < 2) nextErrors.name = "Tên pipeline cần tối thiểu 2 ký tự.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({ name: values.name.trim(), module: values.module.trim() });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField id="pipeline-name" label="Tên pipeline *" value={values.name} error={errors.name} onChange={(name) => setValues((current) => ({ ...current, name }))} />
        <TextField id="pipeline-module" label="Module" value={values.module} error={errors.module} onChange={(module) => setValues((current) => ({ ...current, module }))} placeholder="VD: lead" />
      </FieldGroup>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : mode === "create" ? "Thêm pipeline" : "Lưu thay đổi"}</Button>
      </DialogFooter>
    </form>
  );
}

function StageForm({ initialValues, isPending, error, mode, onSubmit }: { initialValues: PipelineStageInput; isPending: boolean; error: Error | null; mode: "create" | "edit"; onSubmit: (input: PipelineStageInput) => void }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof PipelineStageInput, string>>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof PipelineStageInput, string>> = {};
    if (values.name.trim().length < 2) nextErrors.name = "Tên stage cần tối thiểu 2 ký tự.";
    if (!Number.isInteger(values.position) || values.position < 0) nextErrors.position = "Thứ tự cần là số nguyên không âm.";
    if (!/^#[0-9A-Fa-f]{6}$/.test(values.color)) nextErrors.color = "Màu cần có dạng #RRGGBB.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({ ...values, name: values.name.trim(), color: values.color.trim() });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField id="stage-name" label="Tên stage *" value={values.name} error={errors.name} onChange={(name) => setValues((current) => ({ ...current, name }))} />
        <Field data-invalid={Boolean(errors.position)}>
          <FieldLabel htmlFor="stage-position">Thứ tự *</FieldLabel>
          <Input id="stage-position" type="number" min={0} value={values.position} aria-invalid={Boolean(errors.position)} onChange={(event) => setValues((current) => ({ ...current, position: Number(event.target.value) }))} />
          <FieldError>{errors.position}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.color)}>
          <FieldLabel htmlFor="stage-color">Màu *</FieldLabel>
          <div className="flex gap-2">
            <Input id="stage-color" type="color" className="h-10 w-14 p-1" value={values.color} aria-invalid={Boolean(errors.color)} onChange={(event) => setValues((current) => ({ ...current, color: event.target.value }))} />
            <Input value={values.color} onChange={(event) => setValues((current) => ({ ...current, color: event.target.value }))} />
          </div>
          <FieldError>{errors.color}</FieldError>
        </Field>
        <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <Checkbox checked={values.isFinal} onCheckedChange={(checked) => setValues((current) => ({ ...current, isFinal: checked === true }))} aria-label="Đánh dấu là stage kết thúc" />
          <span>Stage kết thúc</span>
        </label>
      </FieldGroup>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : mode === "create" ? "Thêm stage" : "Lưu thay đổi"}</Button>
      </DialogFooter>
    </form>
  );
}

function TextField({ id, label, value, error, onChange, placeholder }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={value} aria-invalid={Boolean(error)} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function ConfirmDeleteDialog({ open, title, description, isPending, error, actionLabel, onClose, onConfirm }: { open: boolean; title: string; description: string; isPending: boolean; error: Error | null; actionLabel: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <MutationError error={error} />}
        <DialogFooter showCloseButton>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Đang xóa..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}
    </p>
  );
}
