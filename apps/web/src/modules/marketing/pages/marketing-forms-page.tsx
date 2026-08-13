import { type MouseEvent, useEffect, useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FilePlus2, HelpCircle, Home, KeyRound, ListChecks, Monitor, Pencil, Plus, Rocket, Search, Settings, Smartphone, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import {
  createMarketingForm,
  deleteMarketingForm,
  duplicateMarketingForm,
  getMarketingForm,
  getMarketingFormFilterOptions,
  getMarketingForms,
  getMarketingFormSubmissions,
  publishMarketingForm,
  rotateMarketingFormWebhookSecret,
  updateMarketingForm,
} from "@/services/marketing-reference.service";
import type {
  MarketingFormField,
  MarketingFormFieldType,
  MarketingFormFilterOptions,
  MarketingFormFilters,
  MarketingFormInput,
  MarketingFormItem,
  MarketingFormLeadField,
  MarketingFormListResponse,
  MarketingFormSortField,
  MarketingFormSubmission,
  MarketingFormSubmissionListResponse,
  MarketingFormTemplate,
  MarketingFormType,
} from "../marketing-reference.types";

const pageSize = 20;
const submissionPageSize = 10;
const emptyFilters: MarketingFormFilters = { search: "", status: "", platform: "", campaignId: "" };
const defaultFields: MarketingFormField[] = [
  { fieldKey: "full_name", label: "Họ và tên", placeholder: "Họ và tên", fieldType: "text", isRequired: true, options: [], leadField: "full_name", crmMappingField: "full_name", sortOrder: 0, isActive: true },
  { fieldKey: "email", label: "Email", placeholder: "Email", fieldType: "email", isRequired: false, options: [], leadField: "email", crmMappingField: "email", sortOrder: 1, isActive: true },
  { fieldKey: "phone", label: "Số điện thoại", placeholder: "Số điện thoại", fieldType: "phone", isRequired: true, options: [], leadField: "phone", crmMappingField: "phone", sortOrder: 2, isActive: true },
  { fieldKey: "major_id", label: "Ngành đăng ký", placeholder: "Chọn ngành đăng ký", fieldType: "select", isRequired: false, options: [], leadField: "major_id", crmMappingField: "major_id", sortOrder: 3, isActive: true },
  { fieldKey: "graduation_type", label: "Bằng tốt nghiệp", placeholder: "Chọn bằng tốt nghiệp", fieldType: "select", isRequired: false, options: ["THPT", "Trung cấp", "Cao đẳng", "Đại học"], leadField: null, crmMappingField: null, sortOrder: 4, isActive: true },
  { fieldKey: "current_address", label: "Nơi ở hiện tại", placeholder: "Nơi ở hiện tại", fieldType: "province", isRequired: false, options: [], leadField: null, crmMappingField: null, sortOrder: 5, isActive: true },
];
const emptyForm: MarketingFormInput = {
  name: "",
  platform: "website",
  formCode: "",
  campaignId: "",
  sourceId: "",
  formType: "lead_form",
  title: "Đăng ký tư vấn",
  subtitle: "",
  description: "Để lại thông tin, cán bộ tư vấn tuyển sinh sẽ liên hệ tư vấn chi tiết cho Quý Anh, Chị.",
  submitButtonLabel: "Tìm hiểu lộ trình",
  templateId: "",
  primaryColor: "#0f62fe",
  backgroundColor: "#f8fafc",
  webhookEnabled: true,
  status: "draft",
  displaySettings: {},
  duplicateSettings: {},
  successSettings: {},
  accessSettings: {},
  closeSettings: {},
  advancedSettings: {},
  fields: defaultFields,
  mappings: [],
};
const leadFieldLabels: Record<MarketingFormLeadField, string> = {
  full_name: "Họ và tên",
  phone: "Số điện thoại",
  email: "Email",
  gender: "Giới tính",
  date_of_birth: "Ngày sinh",
  note: "Ghi chú",
  source_id: "Nguồn lead",
  institution_program_id: "Chương trình",
  major_id: "Ngành đăng ký",
};
const fieldTypeLabels: Record<MarketingFormFieldType, string> = {
  text: "Văn bản",
  textarea: "Nội dung dài",
  phone: "Số điện thoại",
  email: "Email",
  number: "Số",
  select: "Danh sách chọn",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Ngày",
  province: "Tỉnh/Thành phố",
  file: "Tệp đính kèm",
  hidden: "Ẩn",
  single_select: "Một lựa chọn",
  multi_select: "Nhiều lựa chọn",
  rating: "Đánh giá",
};
const optionFieldTypes = new Set<MarketingFormFieldType>(["select", "single_select", "multi_select", "radio", "checkbox"]);
type FieldDependencyConfig = {
  parentFieldKey: string;
  optionMap: Record<string, string[]>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getFieldDependency(validationRules: unknown): FieldDependencyConfig | null {
  const dependency = asRecord(asRecord(validationRules).dependency);
  const parentFieldKey = typeof dependency.parentFieldKey === "string" ? dependency.parentFieldKey : "";
  const rawOptionMap = asRecord(dependency.optionMap);
  if (!parentFieldKey) return null;
  const optionMap: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawOptionMap)) {
    optionMap[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
  return { parentFieldKey, optionMap };
}

function setFieldDependency(
  form: ReturnType<typeof useForm<MarketingFormInput>>,
  index: number,
  dependency: FieldDependencyConfig | null,
) {
  const validationRules = asRecord(form.getValues(`fields.${index}.validationRules`));
  if (!dependency) {
    const rest = { ...validationRules };
    delete rest.dependency;
    form.setValue(`fields.${index}.validationRules`, rest, { shouldDirty: true, shouldValidate: true });
    return;
  }
  form.setValue(`fields.${index}.validationRules`, { ...validationRules, dependency }, { shouldDirty: true, shouldValidate: true });
}

function getEffectiveFieldOptions(field: Pick<MarketingFormField, "options" | "validationRules">, fields: MarketingFormField[], values: Record<string, string>) {
  const dependency = getFieldDependency(field.validationRules);
  if (!dependency) return field.options;
  const parentValue = values[dependency.parentFieldKey] ?? "";
  if (!parentValue) return [];
  return dependency.optionMap[parentValue] ?? [];
}
const formTypeLabels: Record<MarketingFormType, string> = {
  lead_form: "Form tư vấn",
  survey: "Khảo sát",
  external_webhook: "Webhook ngoài",
};
const statusLabels: Record<string, string> = {
  published: "Đã xuất bản",
  archived: "Lưu trữ",
  active: "Đang hoạt động",
  inactive: "Ngừng hoạt động",
  draft: "Nháp",
  closed: "Đã đóng",
};
const submissionStatusLabels: Record<string, string> = {
  processed: "Đã xử lý",
  duplicate: "Trùng lead",
  failed: "Lỗi",
  received: "Đã nhận",
};
const sortableColumns = new Set<MarketingFormSortField>(["createdAt", "name", "platform", "status"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
type DialogState =
  | { type: "create" }
  | { type: "edit"; form: MarketingFormItem }
  | { type: "delete"; form: MarketingFormItem }
  | { type: "submissions"; form: MarketingFormItem }
  | { type: "secret"; form: MarketingFormItem; secret: string }
  | null;

const fieldSchema = z.object({
  fieldKey: z.string().trim().min(1, "Vui lòng nhập mã trường.").regex(/^[A-Za-z0-9_.-]+$/, "Chỉ dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới."),
  label: z.string().trim().min(1, "Vui lòng nhập nhãn trường."),
  placeholder: z.string().trim().nullable(),
  fieldType: z.enum(["text", "textarea", "phone", "email", "number", "select", "radio", "checkbox", "date", "province", "file", "hidden", "single_select", "multi_select", "rating"]),
  isRequired: z.boolean(),
  options: z.array(z.string()),
  leadField: z.enum(["full_name", "phone", "email", "gender", "date_of_birth", "note", "source_id", "institution_program_id", "major_id"]).nullable().optional(),
  crmMappingField: z.enum(["full_name", "phone", "email", "gender", "date_of_birth", "note", "source_id", "institution_program_id", "major_id"]).nullable().optional(),
  validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultValue: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});
const formSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập tên biểu mẫu."),
  slug: z.string().trim().max(160, "Slug tối đa 160 ký tự.").optional(),
  platform: z.string().trim().max(100, "Nền tảng tối đa 100 ký tự."),
  formCode: z.string().trim().max(255, "Mã biểu mẫu tối đa 255 ký tự."),
  campaignId: z.string(),
  sourceId: z.string().optional(),
  formType: z.enum(["lead_form", "survey", "external_webhook"]),
  title: z.string().trim().min(2, "Vui lòng nhập tiêu đề public form."),
  subtitle: z.string().trim().max(500, "Phụ đề tối đa 500 ký tự.").optional(),
  description: z.string().trim().max(2000, "Mô tả tối đa 2000 ký tự."),
  submitButtonLabel: z.string().trim().min(2, "Vui lòng nhập nhãn nút gửi."),
  templateId: z.string().optional(),
  primaryColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  webhookEnabled: z.boolean(),
  status: z.enum(["draft", "published", "archived", "active", "inactive", "closed"]),
  displaySettings: z.record(z.string(), z.unknown()).optional(),
  duplicateSettings: z.record(z.string(), z.unknown()).optional(),
  successSettings: z.record(z.string(), z.unknown()).optional(),
  accessSettings: z.record(z.string(), z.unknown()).optional(),
  closeSettings: z.record(z.string(), z.unknown()).optional(),
  advancedSettings: z.record(z.string(), z.unknown()).optional(),
  fields: z.array(fieldSchema).min(1, "Cần ít nhất một trường dữ liệu."),
  mappings: z.array(z.object({ sourceField: z.string(), leadField: z.enum(["full_name", "phone", "email", "gender", "date_of_birth", "note", "source_id", "institution_program_id", "major_id"]), isRequired: z.boolean() })),
}).superRefine((input, context) => {
  const keys = new Set<string>();
  const mapped = new Set<MarketingFormLeadField>();
  input.fields.forEach((field, index) => {
    if (keys.has(field.fieldKey)) {
      context.addIssue({ code: "custom", path: ["fields", index, "fieldKey"], message: "Mã trường không được trùng." });
    }
    keys.add(field.fieldKey);
    if (field.crmMappingField ?? field.leadField) mapped.add((field.crmMappingField ?? field.leadField)!);
  });
  if (input.formType !== "survey" && (!mapped.has("full_name") || !mapped.has("phone"))) {
    context.addIssue({ code: "custom", path: ["fields"], message: "Form tạo lead cần ánh xạ Họ và tên và Số điện thoại." });
  }
});

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

function displaySubmissionStatus(status: string) {
  return submissionStatusLabels[status] ?? status;
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function buildWebUrl(path: string | null) {
  if (!path) return "";
  return `${window.location.origin}${path}`;
}

function buildIframeUrl(publicUrl: string) {
  if (!publicUrl) return "";
  const url = new URL(publicUrl);
  url.searchParams.set("embed", "1");
  return url.toString();
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildIframeCode(form: MarketingFormItem, publicUrl: string) {
  if (!publicUrl) return "";
  const iframeUrl = buildIframeUrl(publicUrl);
  const title = escapeHtmlAttribute(`Form & Survey - ${form.name}`);
  return `<iframe src="${escapeHtmlAttribute(iframeUrl)}" title="${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;min-height:720px;border:0;border-radius:12px;overflow:hidden;"></iframe>`;
}

function toEditorValues(form: MarketingFormItem): MarketingFormInput {
  const fields = form.fields.length > 0
    ? form.fields.map((field, index) => ({ ...field, sortOrder: field.sortOrder ?? index, placeholder: field.placeholder ?? "" }))
    : form.mappings.flatMap((mapping, index) => {
        const leadField = mapping.targetColumn ?? mapping.leadField;
        if (!leadField) return [];
        return [{
          fieldKey: mapping.sourceField,
          label: leadFieldLabels[leadField],
          placeholder: "",
          fieldType: leadField === "phone" ? "phone" : leadField === "email" ? "email" : "text",
          isRequired: mapping.isRequired,
          options: [],
          leadField,
          crmMappingField: leadField,
          sortOrder: index,
          isActive: true,
        } satisfies MarketingFormField];
      });
  return {
    name: form.name,
    slug: form.slug ?? "",
    platform: form.platform ?? "",
    formCode: form.formCode ?? "",
    campaignId: form.campaignId ?? form.campaign?.id ?? "",
    sourceId: form.sourceId ?? form.source?.id ?? "",
    formType: form.formType,
    title: form.title ?? form.name,
    subtitle: form.subtitle ?? "",
    description: form.description ?? "",
    submitButtonLabel: form.submitButtonLabel ?? "Gửi thông tin",
    templateId: form.templateId ?? form.template?.id ?? "",
    primaryColor: form.primaryColor ?? "#0f62fe",
    backgroundColor: form.backgroundColor ?? "#f8fafc",
    webhookEnabled: form.webhookEnabled,
    status: (form.status as MarketingFormInput["status"]) ?? "draft",
    displaySettings: form.displaySettings ?? {},
    duplicateSettings: form.duplicateSettings ?? {},
    successSettings: form.successSettings ?? {},
    accessSettings: form.accessSettings ?? {},
    closeSettings: form.closeSettings ?? {},
    advancedSettings: form.advancedSettings ?? {},
    fields,
    mappings: form.mappings,
  };
}

function normalizeInput(values: MarketingFormInput): MarketingFormInput {
  const fields = values.fields.map((field, index) => ({
    ...field,
    fieldKey: field.fieldKey.trim(),
    label: field.label.trim(),
    placeholder: field.placeholder?.trim() || "",
    leadField: field.leadField || undefined,
    crmMappingField: field.crmMappingField || undefined,
    defaultValue: field.defaultValue?.trim() || undefined,
    options: field.options.flatMap((option) => {
      const trimmed = option.trim();
      return trimmed ? [trimmed] : [];
    }),
    sortOrder: index,
  }));
  return {
    ...values,
    templateId: values.templateId?.startsWith("preset-") ? "" : values.templateId,
    fields,
    mappings: fields.flatMap((field) => {
      const targetColumn = field.crmMappingField ?? field.leadField;
      return targetColumn
        ? [{ sourceField: field.fieldKey, leadField: targetColumn, targetTable: "leads", targetColumn, isRequired: field.isRequired }]
        : [];
    }),
  };
}

async function copyText(value: string) {
  if (!value) return;
  await navigator.clipboard?.writeText(value);
}

export function MarketingFormsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { programs, selectedProgramId } = useInstitutionProgram();
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [dialog, setDialog] = useReducer((_current: DialogState, next: DialogState) => next, null);
  const editingForm = dialog?.type === "edit" ? dialog.form : null;
  const deletingForm = dialog?.type === "delete" ? dialog.form : null;
  const submissionsForm = dialog?.type === "submissions" ? dialog.form : null;
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as MarketingFormSortField) ? (selectedSort.id as MarketingFormSortField) : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["marketing-forms", "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getMarketingForms({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["marketing-forms", "options"],
    queryFn: () => getMarketingFormFilterOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: MarketingFormInput) => createMarketingForm(normalizeInput(input), auth.accessToken!),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      setDialog(result.webhookSecret
        ? { type: "secret", form: { ...emptyFormItem(result.id), publicKey: result.public_key ?? null }, secret: result.webhookSecret }
        : null);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: MarketingFormInput) => updateMarketingForm(editingForm!.id, normalizeInput(input), auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteMarketingForm(deletingForm!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const rotateSecretMutation = useMutation({
    mutationFn: (form: MarketingFormItem) => rotateMarketingFormWebhookSecret(form.id, auth.accessToken!),
    onSuccess: (result, form) => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      setDialog({ type: "secret", form, secret: result.webhookSecret });
    },
  });
  const publishMutation = useMutation({
    mutationFn: (form: MarketingFormItem) => publishMarketingForm(form.id, auth.accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: (form: MarketingFormItem) => duplicateMarketingForm(form.id, auth.accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const canManage = auth.can("marketing_form.manage");
  const canCreate = canManage || auth.can("marketing_form.create");
  const canEdit = canManage || auth.can("marketing_form.update_own");
  const table = useReactTable({
    data,
    columns: useColumns({
      canEdit,
      canDelete: canManage,
      onOpenDetail: (form) => navigate(`/marketing/form-survey/${form.id}`),
      onEdit: (form) => { updateMutation.reset(); setDialog({ type: "edit", form }); },
      onDelete: (form) => { deleteMutation.reset(); setDialog({ type: "delete", form }); },
      onSubmissions: (form) => setDialog({ type: "submissions", form }),
      onRotateSecret: (form) => rotateSecretMutation.mutate(form),
      onPublish: (form) => publishMutation.mutate(form),
      onDuplicate: (form) => duplicateMutation.mutate(form),
    }),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? next.slice(0, 1) : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Form & Survey"
        scopeLabel={selectedProgram ? `${selectedProgram.institutionName} - ${selectedProgram.name}` : "Phạm vi được cấp"}
        description="Quản lý form public, survey, field mapping CRM, preview và link chia sẻ để thu lead từ website, landing page hoặc nguồn bên ngoài."
        actions={canCreate ? (
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />Tạo Form & Survey
          </Button>
        ) : undefined}
      />
      <Filters filters={draftFilters} options={optionsQuery.data} onChange={(field, value) => setDraftFilters((current) => ({ ...current, [field]: value }))} onApply={() => { setFilters(draftFilters); setPage(1); }} onReset={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); setPage(1); }} />
      {rotateSecretMutation.isError && <MutationError error={rotateSecretMutation.error} />}
      {publishMutation.isError && <MutationError error={publishMutation.error} />}
      {duplicateMutation.isError && <MutationError error={duplicateMutation.error} />}
      <Results table={table} data={data} pagination={listQuery.data?.pagination} page={page} isLoading={listQuery.isLoading} isError={listQuery.isError} isFetching={listQuery.isFetching} onReload={() => listQuery.refetch()} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => current + 1)} />
      <Dialog open={dialog?.type === "create"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tạo Form & Survey</DialogTitle>
            <DialogDescription>Cấu hình public form, survey, field mapping CRM và link chia sẻ.</DialogDescription>
          </DialogHeader>
          <MarketingFormEditor defaultValues={emptyForm} options={optionsQuery.data} error={createMutation.error} isPending={createMutation.isPending} submitLabel="Tạo biểu mẫu" onSubmit={(input) => createMutation.mutate(input)} />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingForm)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa Form & Survey</DialogTitle>
            <DialogDescription>Cập nhật thông tin, trường dữ liệu, giao diện và trạng thái xuất bản.</DialogDescription>
          </DialogHeader>
          {editingForm && <MarketingFormEditor savedForm={editingForm} defaultValues={toEditorValues(editingForm)} options={optionsQuery.data} error={updateMutation.error} isPending={updateMutation.isPending} submitLabel="Lưu thay đổi" onSubmit={(input) => updateMutation.mutate(input)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deletingForm)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa biểu mẫu</DialogTitle>
            <DialogDescription>{deletingForm ? `Bạn có chắc muốn xóa biểu mẫu "${deletingForm.name}" cùng cấu hình trường và submission?` : ""}</DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa biểu mẫu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(submissionsForm)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Dữ liệu gửi vào</DialogTitle>
            <DialogDescription>{submissionsForm ? `Submission gần nhất của "${submissionsForm.name}".` : ""}</DialogDescription>
          </DialogHeader>
          {submissionsForm && <SubmissionList formId={submissionsForm.id} />}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog?.type === "secret"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook secret</DialogTitle>
            <DialogDescription>Secret chỉ hiển thị một lần. Hãy lưu lại để cấu hình nguồn gửi webhook.</DialogDescription>
          </DialogHeader>
          {dialog?.type === "secret" && (
            <div className="space-y-3">
              <Input readOnly value={dialog.secret} />
              <Button type="button" variant="outline" onClick={() => copyText(dialog.secret)}><Copy aria-hidden="true" />Copy secret</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MarketingFormDetailPage() {
  const auth = useAuth();
  const { formId = "" } = useParams();
  const queryClient = useQueryClient();
  const [saveMessage, setSaveMessage] = useState("");
  const formQuery = useQuery({
    queryKey: ["marketing-forms", "detail", formId],
    queryFn: () => getMarketingForm(formId, auth.accessToken!),
    enabled: Boolean(formId && auth.accessToken),
  });
  const optionsQuery = useQuery({
    queryKey: ["marketing-forms", "options"],
    queryFn: () => getMarketingFormFilterOptions(auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });
  const updateMutation = useMutation({
    mutationFn: (input: MarketingFormInput) => updateMarketingForm(formId, normalizeInput(input), auth.accessToken!),
    onMutate: () => {
      setSaveMessage("");
    },
    onSuccess: () => {
      setSaveMessage("Đã lưu cấu hình Form & Survey thành công.");
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms", "detail", formId] });
    },
  });

  if (formQuery.isLoading) return <TableLoadingState label="Đang tải chi tiết Form & Survey" />;
  if (formQuery.isError || !formQuery.data) {
    return <ErrorState title="Không thể tải Form & Survey" description="Vui lòng quay lại danh sách và thử mở lại form." onReload={() => formQuery.refetch()} />;
  }

  return (
    <FormDetailBuilder
      key={formQuery.data.id}
      formItem={formQuery.data}
      defaultValues={toEditorValues(formQuery.data)}
      options={optionsQuery.data}
      error={updateMutation.error}
      successMessage={saveMessage}
      isPending={updateMutation.isPending}
      onSubmit={(input) => updateMutation.mutate(input)}
    />
  );
}

function FormDetailBuilder({ formItem, defaultValues, options, error, successMessage, isPending, onSubmit }: {
  formItem: MarketingFormItem;
  defaultValues: MarketingFormInput;
  options?: MarketingFormFilterOptions;
  error: Error | null;
  successMessage: string;
  isPending: boolean;
  onSubmit: (input: MarketingFormInput) => void;
}) {
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "settings" | "share" | "results">("settings");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const form = useForm<MarketingFormInput>({ defaultValues });
  const fields = useFieldArray({ control: form.control, name: "fields" });
  const publicUrl = formItem.publicPath ? buildWebUrl(formItem.publicPath) : formItem.publicKey ? `${window.location.origin}/bieu-mau/${formItem.publicKey}` : "";
  const iframeCode = buildIframeCode(formItem, publicUrl);
  const watchedTitle = form.watch("title") || form.watch("name") || formItem.name;
  const hasUnsavedChanges = form.formState.isDirty;

  function confirmLeaveWithUnsavedChanges(event: MouseEvent<HTMLAnchorElement>) {
    if (!hasUnsavedChanges) return;
    const canLeave = window.confirm("Bạn có thay đổi chưa lưu. Rời trang lúc này sẽ mất cấu hình vừa chỉnh.");
    if (!canLeave) {
      event.preventDefault();
    }
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (successMessage) {
      form.reset(form.getValues());
    }
  }, [form, successMessage]);

  function removeField(index: number) {
    fields.remove(index);
    setEditingIndex((current) => current === index ? null : current && current > index ? current - 1 : current);
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit({ ...values, customFieldValues: form.getValues("customFieldValues") }))}>
      <div className="flex flex-col gap-3 border-b bg-background px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="Đường dẫn Form & Survey">
          <Link to="/tong-quan" className="inline-flex items-center gap-1 text-foreground hover:text-primary" onClick={confirmLeaveWithUnsavedChanges}><Home aria-hidden="true" />Trang chủ</Link>
          <span>/</span>
          <Link to="/marketing/form-survey" className="hover:text-primary" onClick={confirmLeaveWithUnsavedChanges}>Quản lý khảo sát</Link>
          <span>/</span>
          <span className="text-foreground">{formItem.name}</span>
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="default" className="bg-green-600 hover:bg-green-700">
            <Link to="/marketing/form-survey" onClick={confirmLeaveWithUnsavedChanges}><ListChecks aria-hidden="true" />Xem tất cả kết quả khảo sát</Link>
          </Button>
          <Button type="submit" disabled={isPending || !hasUnsavedChanges}>
            {isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
          <Button type="button" onClick={() => setFieldPickerOpen(true)}><FilePlus2 aria-hidden="true" />Thêm khảo sát mới</Button>
        </div>
      </div>

      <div className="mx-5 rounded-sm border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 text-sm">
          {[
            { key: "overview", label: "Tổng quan" },
            { key: "settings", label: "Cài đặt" },
            { key: "share", label: "Xuất bản & chia sẻ" },
            { key: "results", label: "Danh sách kết quả" },
          ].map((tab, index) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as typeof activeTab)} className={`inline-flex min-h-11 items-center gap-3 border-b-2 px-2 ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-foreground"}`}>
              {tab.label}{index < 3 && <ArrowRight className="text-muted-foreground" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {activeTab === "share" ? (
          <TemplateSharePanel formItem={formItem} form={form} options={options} fields={fields.fields.map((field, index) => form.watch(`fields.${index}`))} publicUrl={publicUrl} iframeCode={iframeCode} isPending={isPending} onBackSettings={() => setActiveTab("settings")} />
        ) : activeTab === "results" ? (
          <div className="p-5"><SubmissionList formId={formItem.id} /></div>
        ) : (
        <div className="grid min-h-125 gap-6 bg-muted/20 p-5 lg:grid-cols-[minmax(420px,1fr)_76px_120px]">
          <main className="mx-auto w-full max-w-3xl">
            <div className="border bg-background">
              <div className="h-3" style={{ backgroundColor: form.watch("primaryColor") || "#673ab7" }} />
              <div className="px-8 py-4 text-center">{watchedTitle}</div>
            </div>
            <FieldError errors={[form.formState.errors.fields as { message?: string } | undefined]} />
            <p className="mt-3 text-sm text-muted-foreground">Bấm vào nút Cấu hình trên từng câu hỏi để chỉnh label, mapping CRM, validation và các lựa chọn của field.</p>
            {hasUnsavedChanges && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                Có thay đổi chưa lưu. Bấm Lưu cấu hình trước khi thoát hoặc tải lại để giữ ngành quan tâm, trình độ học vấn và các lựa chọn liên quan.
              </div>
            )}
            <div className="mt-4 space-y-3">
              {fields.fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border bg-background px-6 py-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {(() => {
                        const currentField = form.watch(`fields.${index}`);
                        const currentFields = fields.fields.map((item, fieldIndex) => form.watch(`fields.${fieldIndex}`));
                        const previewValues = Object.fromEntries(currentFields.map((item) => [item.fieldKey, item.defaultValue ?? ""]));
                        const effectiveOptions = getEffectiveFieldOptions(currentField, currentFields, previewValues);
                        return (
                          <>
                            <h3 className="text-base font-semibold">{index + 1}. {currentField.label || "Câu hỏi"} {currentField.isRequired && <span>*</span>}</h3>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {optionFieldTypes.has(currentField.fieldType) && <Badge variant="outline">Có cấu hình lựa chọn</Badge>}
                              {getFieldDependency(currentField.validationRules) && <Badge variant="secondary">Có câu hỏi liên quan</Badge>}
                            </div>
                            <PreviewField field={currentField} options={effectiveOptions} />
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 text-muted-foreground">
                      <Button type="button" variant={editingIndex === index ? "default" : "outline"} size="sm" onClick={() => setEditingIndex(editingIndex === index ? null : index)} aria-label={`Cấu hình câu hỏi ${index + 1}`}><Pencil aria-hidden="true" />Cấu hình</Button>
                      <Button type="button" variant="ghost" size="icon" disabled={fields.fields.length <= 1} onClick={() => removeField(index)} aria-label={`Xóa câu hỏi ${index + 1}`}><Trash2 aria-hidden="true" /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => fields.move(index, Math.max(0, index - 1))} aria-label={`Đưa câu hỏi ${index + 1} lên`}><ArrowUp aria-hidden="true" /></Button>
                    </div>
                  </div>
                  {editingIndex === index && (
                    <div className="mt-4">
                      <FormFieldRow
                        index={index}
                        form={form}
                        options={options}
                        onMoveUp={() => fields.move(index, Math.max(0, index - 1))}
                        onMoveDown={() => fields.move(index, Math.min(fields.fields.length - 1, index + 1))}
                        onRemove={() => removeField(index)}
                        canMoveUp={index > 0}
                        canMoveDown={index < fields.fields.length - 1}
                        canRemove={fields.fields.length > 1}
                        defaultOpen
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </main>

          <aside className="h-fit rounded-lg border bg-background p-2 shadow-sm">
            <Button type="button" variant="ghost" className="h-auto w-full flex-col gap-1 py-3" onClick={() => setFieldPickerOpen(true)}><Plus aria-hidden="true" />Câu hỏi</Button>
            <Button type="button" variant="ghost" className="h-auto w-full flex-col gap-1 py-3" disabled><FilePlus2 aria-hidden="true" />Trang</Button>
            <Button type="button" variant="ghost" className="h-auto w-full flex-col gap-1 py-3" disabled><FilePlus2 aria-hidden="true" />Nhóm</Button>
          </aside>

          <aside className="space-y-3">
            <Button type="submit" className="w-full" disabled={isPending || !hasUnsavedChanges}>{isPending ? "Đang lưu..." : "Lưu cấu hình"}</Button>
            <Button type="button" className="w-full" disabled={isPending} onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" />Thiết lập</Button>
            <Button asChild type="button" variant="default" className="w-full bg-green-600 hover:bg-green-700" disabled={!publicUrl}><a href={publicUrl || "#"} target="_blank" rel="noreferrer"><Eye aria-hidden="true" />Xem thử</a></Button>
            <Button type="button" variant="default" className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => iframeCode && copyText(iframeCode)} disabled={!iframeCode}><HelpCircle aria-hidden="true" />Copy iframe</Button>
          </aside>
        </div>
        )}
      </div>

      <RuntimeCustomFieldsSection entityType="MARKETING_FORM" entityId={formItem.id} disabled={isPending} onChange={(values) => form.setValue("customFieldValues", values, { shouldDirty: true })} />

      {error && <MutationError error={error} />}
      {successMessage && <MutationSuccess message={successMessage} />}
      <FormSettingsDrawer
        open={settingsOpen}
        form={form}
        fields={fields.fields.map((field, index) => form.watch(`fields.${index}`))}
        isPending={isPending}
        onClose={() => setSettingsOpen(false)}
        onSave={() => form.handleSubmit((values) => {
          onSubmit(values);
          setSettingsOpen(false);
        })()}
      />
      <AddFieldPickerDialog open={fieldPickerOpen} options={options} onOpenChange={setFieldPickerOpen} onAdd={(field) => {
        fields.append({ ...field, sortOrder: fields.fields.length });
        setEditingIndex(fields.fields.length);
      }} />
    </form>
  );
}

function PreviewField({ field, options = field.options }: { field: MarketingFormField; options?: string[] }) {
  if (field.fieldType === "textarea") return <Textarea readOnly className="mt-4 rounded-none" rows={3} placeholder={field.placeholder || `Vui lòng nhập ${field.label.toLowerCase()} vào đây`} />;
  if (field.fieldType === "select" || field.fieldType === "single_select" || field.fieldType === "province") {
    return <Input readOnly className="mt-4 rounded-none" placeholder={options.length ? options[0] : field.placeholder || `Vui lòng chọn ${field.label.toLowerCase()}`} />;
  }
  if (field.fieldType === "radio" || field.fieldType === "checkbox" || field.fieldType === "multi_select") {
    return <div className="mt-4 grid gap-2">{(options.length ? options : ["Lựa chọn 1", "Lựa chọn 2"]).map((option) => <label key={option} className="flex items-center gap-2 text-sm text-muted-foreground"><input type={field.fieldType === "radio" ? "radio" : "checkbox"} disabled />{option}</label>)}</div>;
  }
  return <Input readOnly className="mt-4 rounded-none" placeholder={field.placeholder || `Vui lòng nhập ${field.label.toLowerCase()} vào đây`} />;
}

type SettingsGroupName = "displaySettings" | "duplicateSettings" | "successSettings" | "accessSettings" | "closeSettings" | "advancedSettings";

function getSettingValue<T>(form: ReturnType<typeof useForm<MarketingFormInput>>, group: SettingsGroupName, key: string, fallback: T): T {
  const settings = form.getValues(group) ?? {};
  const value = settings[key];
  return value === undefined || value === null ? fallback : value as T;
}

function setSettingValue(form: ReturnType<typeof useForm<MarketingFormInput>>, group: SettingsGroupName, key: string, value: unknown) {
  form.setValue(group, { ...(form.getValues(group) ?? {}), [key]: value }, { shouldDirty: true, shouldValidate: true });
}

function FormSettingsDrawer({ open, form, fields, isPending, onClose, onSave }: {
  open: boolean;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  fields: MarketingFormField[];
  isPending: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "duplicate" | "success" | "access" | "close" | "advanced" | "mapping">("basic");
  if (!open) return null;
  const duplicateFields = getSettingValue<string[]>(form, "duplicateSettings", "fields", ["phone"]);
  const duplicateChoices = fields.filter((field) => ["phone", "email"].includes(field.crmMappingField ?? field.leadField ?? field.fieldKey));
  const tabs = [
    ["basic", "Cơ bản"],
    ["duplicate", "Kiểm tra trùng"],
    ["success", "Sau khi gửi thành công"],
    ["access", "Phân quyền"],
    ["close", "Đóng form"],
    ["advanced", "Nâng cao"],
    ["mapping", "Mapping"],
  ] as const;

  return (
    <div className="fixed inset-0 z-50 bg-black/55">
      <aside className="ml-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-bold uppercase">Cài đặt khảo sát</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Đóng cài đặt khảo sát"><X aria-hidden="true" /></Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b px-5 pt-3">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-10 border-b-2 px-3 text-sm ${tab === key ? "border-primary text-primary" : "border-transparent"}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && (
            <div className="grid gap-4">
              <Field><FieldLabel>Tiêu đề</FieldLabel><Input value={form.watch("name")} onChange={(event) => form.setValue("name", event.target.value, { shouldDirty: true })} /></Field>
              <Field><FieldLabel>Heading</FieldLabel><Input value={form.watch("title")} onChange={(event) => form.setValue("title", event.target.value, { shouldDirty: true })} /></Field>
              <Field><FieldLabel>Mô tả ngắn</FieldLabel><Textarea rows={5} value={form.watch("description")} onChange={(event) => form.setValue("description", event.target.value, { shouldDirty: true })} /></Field>
              <Field><FieldLabel>Note ghi chú</FieldLabel><Input value={getSettingValue(form, "displaySettings", "note", "")} onChange={(event) => setSettingValue(form, "displaySettings", "note", event.target.value)} placeholder="Nhập nội dung ghi chú ngắn" /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "displaySettings", "useCaptcha", false)} onCheckedChange={(checked) => setSettingValue(form, "displaySettings", "useCaptcha", Boolean(checked))} />Sử dụng Captcha</label>
              <Field><FieldLabel>Điểm captcha tối thiểu</FieldLabel><Input type="number" step="0.1" value={getSettingValue(form, "displaySettings", "captchaScore", "0.6")} onChange={(event) => setSettingValue(form, "displaySettings", "captchaScore", event.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "displaySettings", "showConfirmBeforeSubmit", true)} onCheckedChange={(checked) => setSettingValue(form, "displaySettings", "showConfirmBeforeSubmit", Boolean(checked))} />Hiện màn hình xác nhận trước khi gửi</label>
              <Field><FieldLabel>Hiển thị số thứ tự</FieldLabel><Select value={getSettingValue(form, "displaySettings", "numbering", "auto")} onValueChange={(value) => setSettingValue(form, "displaySettings", "numbering", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Số thứ tự tự động</SelectItem><SelectItem value="manual">Số thứ tự nhập vào</SelectItem><SelectItem value="none">Không hiện</SelectItem></SelectContent></Select></Field>
              <Field><FieldLabel>Text nút thực hiện khảo sát</FieldLabel><Input value={form.watch("submitButtonLabel")} onChange={(event) => form.setValue("submitButtonLabel", event.target.value, { shouldDirty: true })} /></Field>
              <Field><FieldLabel>Text nút tiếp tục sang trang khác</FieldLabel><Input value={getSettingValue(form, "displaySettings", "nextButtonText", "Về trang chủ")} onChange={(event) => setSettingValue(form, "displaySettings", "nextButtonText", event.target.value)} /></Field>
              <Field><FieldLabel>Ngôn ngữ form</FieldLabel><Select value={getSettingValue(form, "displaySettings", "language", "vi")} onValueChange={(value) => setSettingValue(form, "displaySettings", "language", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vi">Tiếng Việt</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></Field>
            </div>
          )}

          {tab === "duplicate" && (
            <div className="grid gap-5">
              <Field><FieldLabel>Check trùng theo khảo sát</FieldLabel><div className="flex min-h-10 flex-wrap gap-2 rounded border px-2 py-1">{duplicateChoices.map((field) => {
                const key = field.crmMappingField ?? field.leadField ?? field.fieldKey;
                return <Button key={field.fieldKey} type="button" size="sm" variant={duplicateFields.includes(key) ? "default" : "outline"} onClick={() => setSettingValue(form, "duplicateSettings", "fields", duplicateFields.includes(key) ? duplicateFields.filter((item) => item !== key) : [...duplicateFields, key])}>{field.label}</Button>;
              })}</div></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "duplicateSettings", "disableDuplicateCheck", false)} onCheckedChange={(checked) => setSettingValue(form, "duplicateSettings", "disableDuplicateCheck", Boolean(checked))} />Không check trùng dữ liệu</label>
              <Field><FieldLabel>Hành vi khi trùng</FieldLabel><Select value={getSettingValue(form, "duplicateSettings", "action", "update")} onValueChange={(value) => setSettingValue(form, "duplicateSettings", "action", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="update">Ghi/cập nhật Lead theo trường liên kết</SelectItem><SelectItem value="skip">Không ghi vào Lead khi trùng</SelectItem></SelectContent></Select></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "duplicateSettings", "oneResponseOnly", false)} onCheckedChange={(checked) => setSettingValue(form, "duplicateSettings", "oneResponseOnly", Boolean(checked))} />Chỉ trả lời một lần</label>
              <Field><FieldLabel>Thông báo khi đã gửi rồi</FieldLabel><Input value={getSettingValue(form, "duplicateSettings", "oneResponseMessage", "Thông tin của Anh/Chị đã được gửi đến nhà trường!")} onChange={(event) => setSettingValue(form, "duplicateSettings", "oneResponseMessage", event.target.value)} /></Field>
            </div>
          )}

          {tab === "success" && (
            <div className="grid gap-5">
              <Field><FieldLabel>Thông báo thành công</FieldLabel><Input value={getSettingValue(form, "successSettings", "message", "Thông tin của Anh/Chị đã được gửi đến nhà trường.")} onChange={(event) => setSettingValue(form, "successSettings", "message", event.target.value)} /></Field>
              <Field><FieldLabel>Link chuyển hướng nếu có</FieldLabel><Input value={getSettingValue(form, "successSettings", "redirectUrl", "")} onChange={(event) => setSettingValue(form, "successSettings", "redirectUrl", event.target.value)} /></Field>
              <Field><FieldLabel>Gửi email</FieldLabel><Select value={getSettingValue(form, "successSettings", "emailMode", "none")} onValueChange={(value) => setSettingValue(form, "successSettings", "emailMode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không gửi email</SelectItem><SelectItem value="confirmation">Cho phép gửi email xác nhận thông tin</SelectItem><SelectItem value="automation">Cho phép gửi vào automation</SelectItem></SelectContent></Select></Field>
              <Field><FieldLabel>Thông báo cho sale</FieldLabel><Input value={getSettingValue(form, "successSettings", "saleNotifyTitle", "")} onChange={(event) => setSettingValue(form, "successSettings", "saleNotifyTitle", event.target.value)} placeholder="Tiêu đề..." /></Field>
              <Textarea rows={3} value={getSettingValue(form, "successSettings", "saleNotifyContent", "")} onChange={(event) => setSettingValue(form, "successSettings", "saleNotifyContent", event.target.value)} placeholder="Nội dung..." />
            </div>
          )}

          {tab === "access" && <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "accessSettings", "enabled", false)} onCheckedChange={(checked) => setSettingValue(form, "accessSettings", "enabled", Boolean(checked))} />Bật tính năng phân quyền</label>}

          {tab === "close" && (
            <div className="grid gap-5">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "closeSettings", "isActive", true)} onCheckedChange={(checked) => setSettingValue(form, "closeSettings", "isActive", Boolean(checked))} />Kích hoạt Form</label>
              <Field><FieldLabel>Thời gian đóng Form</FieldLabel><Input type="datetime-local" value={getSettingValue(form, "closeSettings", "closeAt", "")} onChange={(event) => setSettingValue(form, "closeSettings", "closeAt", event.target.value)} /></Field>
              <Field><FieldLabel>Đường dẫn điều hướng khi đóng</FieldLabel><Input value={getSettingValue(form, "closeSettings", "redirectUrl", "")} onChange={(event) => setSettingValue(form, "closeSettings", "redirectUrl", event.target.value)} placeholder="Đường dẫn điều hướng nếu có..." /></Field>
              <Field><FieldLabel>Thông báo tạm dừng khảo sát</FieldLabel><Input value={getSettingValue(form, "closeSettings", "closedMessage", "Biểu mẫu đã tạm dừng nhận thông tin.")} onChange={(event) => setSettingValue(form, "closeSettings", "closedMessage", event.target.value)} /></Field>
            </div>
          )}

          {tab === "advanced" && (
            <div className="grid gap-5">
              <Field><FieldLabel>Link API xử lý</FieldLabel><Input value={getSettingValue(form, "advancedSettings", "handlerUrl", "")} onChange={(event) => setSettingValue(form, "advancedSettings", "handlerUrl", event.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "advancedSettings", "disableAutofill", false)} onCheckedChange={(checked) => setSettingValue(form, "advancedSettings", "disableAutofill", Boolean(checked))} />Tắt chế độ tự động điền dữ liệu</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={getSettingValue(form, "advancedSettings", "allowSaleAssignment", false)} onCheckedChange={(checked) => setSettingValue(form, "advancedSettings", "allowSaleAssignment", Boolean(checked))} />Cho phép gán sale vào form và bản ghi liên quan</label>
              <Field><FieldLabel>Nguồn form</FieldLabel><Input value={getSettingValue(form, "advancedSettings", "source", "")} onChange={(event) => setSettingValue(form, "advancedSettings", "source", event.target.value)} placeholder="chat website" /></Field>
              <Field><FieldLabel>Giới hạn thực hiện khảo sát</FieldLabel><Select value={getSettingValue(form, "advancedSettings", "limitMode", "none")} onValueChange={(value) => setSettingValue(form, "advancedSettings", "limitMode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không giới hạn</SelectItem><SelectItem value="minutes">Giới hạn theo phút</SelectItem><SelectItem value="submissions">Giới hạn theo số lần submit</SelectItem></SelectContent></Select></Field>
            </div>
          )}

          {tab === "mapping" && (
            <div className="space-y-4">
              <Button type="button" size="sm" onClick={() => setTab("basic")}>Thêm</Button>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm font-medium"><span>Bảng</span><span>Trường</span><span>Bảng giá trị</span></div>
              {fields.map((field, index) => (
                <div key={field.fieldKey} className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                  <Input readOnly value="leads" />
                  <Input readOnly value={field.label} />
                  <Select value={field.crmMappingField ?? field.leadField ?? "__none__"} onValueChange={(value) => {
                    const next = value === "__none__" ? null : value as MarketingFormLeadField;
                    form.setValue(`fields.${index}.crmMappingField`, next, { shouldDirty: true });
                    form.setValue(`fields.${index}.leadField`, next, { shouldDirty: true });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Không mapping</SelectItem>{Object.entries(leadFieldLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t bg-muted/30 px-6 py-4 text-right">
          <Button type="button" disabled={isPending} onClick={onSave}>{isPending ? "Đang lưu..." : "Lưu và thoát"}</Button>
        </div>
      </aside>
    </div>
  );
}

const fallbackTemplatePresets = Array.from({ length: 12 }, (_, index) => {
  const palettes = [
    ["#673ab7", "#f0eaf8"],
    ["#22c55e", "#f4f6f8"],
    ["#0f62fe", "#eef4ff"],
    ["#8b5cf6", "#f4efff"],
    ["#14b8a6", "#edfafa"],
    ["#ec4899", "#fff1f7"],
    ["#f97316", "#fff4ec"],
    ["#ef4444", "#fff1f1"],
    ["#1f2937", "#f3f4f6"],
    ["#10b981", "#edfdf6"],
    ["#06b6d4", "#eefcff"],
    ["#fb923c", "#fff7ed"],
  ];
  return { id: `preset-${index + 1}`, name: index === 0 ? "Webform Mặc định" : `Webform #${index + 1}`, primaryColor: palettes[index][0], backgroundColor: palettes[index][1] };
});

function TemplateSharePanel({ formItem, form, options, fields, publicUrl, iframeCode, isPending, onBackSettings }: {
  formItem: MarketingFormItem;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  options?: MarketingFormFilterOptions;
  fields: MarketingFormField[];
  publicUrl: string;
  iframeCode: string;
  isPending: boolean;
  onBackSettings: () => void;
}) {
  const templates = options?.templates?.length ? options.templates : [];
  const watchedTemplateId = form.watch("templateId");
  const currentTemplateId = watchedTemplateId && !watchedTemplateId.startsWith("preset-")
    ? watchedTemplateId
    : getSettingValue(form, "displaySettings", "templatePresetId", templates.find((template) => template.isDefault)?.id || fallbackTemplatePresets[0].id);
  const activePreset = fallbackTemplatePresets.find((preset) => preset.id === currentTemplateId) ?? fallbackTemplatePresets[0];
  const primaryColor = form.watch("primaryColor") || activePreset.primaryColor;
  const backgroundColor = form.watch("backgroundColor") || activePreset.backgroundColor;
  const title = form.watch("title") || form.watch("name") || formItem.name;
  const submitText = form.watch("submitButtonLabel") || "Thực hiện khảo sát";

  function selectTemplate(template: MarketingFormTemplate | null, preset = activePreset) {
    form.setValue("templateId", template?.id ?? "", { shouldDirty: true });
    setSettingValue(form, "displaySettings", "templatePresetId", template?.id ?? preset.id);
    form.setValue("primaryColor", preset.primaryColor, { shouldDirty: true });
    form.setValue("backgroundColor", preset.backgroundColor, { shouldDirty: true });
  }

  return (
    <div className="grid min-h-180 bg-[#eee8f8] lg:grid-cols-[300px_1fr]">
      <aside className="border-r bg-background">
        <div className="border-b p-3">
          <div className="flex items-center gap-2 text-lg font-medium">Chọn mẫu có sẵn <Badge variant="secondary" className="bg-orange-600 text-white">SURVEY</Badge></div>
        </div>
        <div className="grid grid-cols-2 border-b text-sm">
          <button type="button" className="min-h-10 border-r px-3 text-left">Survey</button>
          <button type="button" className="min-h-10 bg-primary px-3 text-left text-primary-foreground">WebForms</button>
        </div>
        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-4">
          {(templates.length ? templates : fallbackTemplatePresets).map((templateLike, index) => {
            const template = "previewImage" in templateLike ? templateLike : null;
            const preset = fallbackTemplatePresets[index % fallbackTemplatePresets.length];
            const id = template?.id ?? preset.id;
            const name = template?.name ?? preset.name;
            const selected = currentTemplateId === id;
            return (
              <button key={id} type="button" onClick={() => selectTemplate(template, preset)} className={`overflow-hidden rounded border bg-background text-left shadow-sm transition hover:border-primary ${selected ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
                <TemplateThumbnail template={template} preset={preset} />
                <span className="block truncate px-1 pb-1 text-primary">{name}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBackSettings}><ChevronLeft aria-hidden="true" />Quay về cài đặt</Button>
            <Button type="submit" disabled={isPending}><Settings aria-hidden="true" />{isPending ? "Đang lưu" : "Lưu giao diện"}</Button>
          </div>
          <div className="flex items-center gap-3 text-primary">
            <Monitor aria-label="Preview desktop" />
            <Smartphone aria-label="Preview mobile" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => selectTemplate(null, fallbackTemplatePresets[0])}>Mặc định</Button>
            <Button type="button" className="bg-orange-600 hover:bg-orange-700" onClick={() => copyText(iframeCode || publicUrl)} disabled={!iframeCode && !publicUrl}><Copy aria-hidden="true" />Lấy link chia sẻ</Button>
          </div>
        </div>

        <div className="px-4 py-2" style={{ backgroundColor }}>
          <div className="mx-auto w-full max-w-2xl space-y-3 py-2">
            <div className="rounded-lg border bg-background shadow-xs">
              <div className="h-3 rounded-t-lg" style={{ backgroundColor: primaryColor }} />
              <h2 className="px-6 py-4 text-3xl font-medium">{title}</h2>
            </div>
            {fields.filter((field) => field.isActive !== false && field.fieldType !== "hidden").map((field, index) => (
              <div key={`${field.fieldKey}-${index}`} className="rounded-lg border bg-background px-6 py-4 shadow-xs">
                <h3 className="text-lg font-semibold">{index + 1}. {field.label} {field.isRequired && <span className="text-red-500">*</span>}</h3>
                <PreviewField field={field} />
              </div>
            ))}
            <div className="pt-2 text-center">
              <Button type="button" style={{ backgroundColor: primaryColor }} onClick={() => copyText(iframeCode)} disabled={!iframeCode}><Copy aria-hidden="true" />{submitText}</Button>
              <p className="mt-4 text-xs text-muted-foreground">Bằng cách nhấn Thực hiện khảo sát, bạn xác nhận đã đọc và đồng ý với chính sách bảo vệ dữ liệu cá nhân.</p>
              <p className="mt-2 text-xs text-muted-foreground">Đừng bao giờ gửi mật khẩu qua Form này!</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplateThumbnail({ template, preset }: { template: MarketingFormTemplate | null; preset: { primaryColor: string; backgroundColor: string } }) {
  if (template?.previewImage) return <img src={template.previewImage} alt="" className="h-28 w-full object-cover" loading="lazy" />;
  return (
    <div className="flex h-28 items-start justify-center bg-muted p-3">
      <div className="w-14 rounded-sm bg-background shadow-sm">
        <div className="h-1.5 rounded-t-sm" style={{ backgroundColor: preset.primaryColor }} />
        <div className="space-y-1.5 p-1.5">
          <div className="h-2 rounded-sm bg-muted" />
          <div className="h-2 rounded-sm bg-muted" />
          <div className="h-2 rounded-sm bg-muted" />
          <div className="mx-auto h-2 w-8 rounded-sm" style={{ backgroundColor: preset.primaryColor }} />
        </div>
      </div>
    </div>
  );
}

function emptyFormItem(id: string): MarketingFormItem {
  return {
    id,
    name: "",
    slug: null,
    platform: null,
    formCode: null,
    formType: "lead_form",
    title: null,
    description: null,
    submitButtonLabel: null,
    publicKey: null,
    publicPath: null,
    webhookEnabled: false,
    webhookPath: null,
    submissionCount: 0,
    status: null,
    createdAt: null,
    updatedAt: null,
    creator: null,
    campaign: null,
    fields: [],
    mappings: [],
  };
}

function useColumns({ canEdit, canDelete, onOpenDetail, onEdit, onDelete, onSubmissions, onRotateSecret, onPublish, onDuplicate }: {
  canEdit: boolean;
  canDelete: boolean;
  onOpenDetail: (form: MarketingFormItem) => void;
  onEdit: (form: MarketingFormItem) => void;
  onDelete: (form: MarketingFormItem) => void;
  onSubmissions: (form: MarketingFormItem) => void;
  onRotateSecret: (form: MarketingFormItem) => void;
  onPublish: (form: MarketingFormItem) => void;
  onDuplicate: (form: MarketingFormItem) => void;
}) {
  return useMemo<ColumnDef<MarketingFormItem>[]>(() => [
    { id: "select", header: () => <Checkbox aria-label="Chọn tất cả Form & Survey" />, enableSorting: false, cell: ({ row }) => <Checkbox aria-label={`Chọn ${row.original.name}`} /> },
    { id: "index", header: "", enableSorting: false, cell: ({ row }) => <span className="text-primary">{row.index + 1}</span> },
    {
      accessorKey: "name",
      header: "Tên Form và Survey",
      cell: ({ row }) => <Button type="button" variant="link" className="h-auto justify-start px-0 text-primary" onClick={() => onOpenDetail(row.original)}>{row.original.name}</Button>,
    },
    { id: "submissions", header: "Lượt phản hồi", enableSorting: false, cell: ({ row }) => <Button type="button" variant="link" className="h-auto px-0 text-foreground" onClick={() => onSubmissions(row.original)}>{row.original.submissionCount}</Button> },
    { id: "fields", header: "Số câu hỏi", enableSorting: false, cell: ({ row }) => row.original.fields.length || row.original.mappings.length },
    { id: "creator", header: "Người tạo", enableSorting: false, cell: ({ row }) => <CreatorCell form={row.original} date={row.original.createdAt} /> },
    { id: "updatedAt", header: "Ngày cập nhật", enableSorting: false, cell: ({ row }) => <CreatorCell form={row.original} date={row.original.updatedAt ?? row.original.createdAt} /> },
    { accessorKey: "status", header: "Trạng thái/Loại", cell: ({ row }) => <StatusTypeCell form={row.original} /> },
    {
      id: "actions",
      header: () => <span className="flex justify-center"><Settings aria-label="Hành động" /></span>,
      enableSorting: false,
      cell: ({ row }) => <FormActionMenu form={row.original} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} onPublish={onPublish} onRotateSecret={onRotateSecret} onSubmissions={onSubmissions} />,
    },
  ], [canDelete, canEdit, onDelete, onDuplicate, onEdit, onOpenDetail, onPublish, onRotateSecret, onSubmissions]);
}

function CreatorCell({ form, date }: { form: MarketingFormItem; date: string | null | undefined }) {
  const creator = form.creator?.email ?? form.creator?.fullName ?? "-";
  return (
    <div className="min-w-56 leading-6">
      <div>{creator}</div>
      <div>{formatDate(date ?? null)}</div>
    </div>
  );
}

function StatusTypeCell({ form }: { form: MarketingFormItem }) {
  return (
    <div className="min-w-40 leading-6">
      <div><span className="font-semibold">Trạng thái:</span> {displayStatus(form.status)}</div>
      <div><span className="font-semibold">Loại:</span> {formTypeLabels[form.formType]}</div>
    </div>
  );
}

function FormActionMenu({ form, canEdit, canDelete, onEdit, onDelete, onSubmissions, onRotateSecret, onPublish, onDuplicate }: {
  form: MarketingFormItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (form: MarketingFormItem) => void;
  onDelete: (form: MarketingFormItem) => void;
  onSubmissions: (form: MarketingFormItem) => void;
  onRotateSecret: (form: MarketingFormItem) => void;
  onPublish: (form: MarketingFormItem) => void;
  onDuplicate: (form: MarketingFormItem) => void;
}) {
  const publicUrl = form.publicPath ? buildWebUrl(form.publicPath) : form.publicKey ? `${window.location.origin}/bieu-mau/${form.publicKey}` : "";
  const iframeCode = buildIframeCode(form, publicUrl);
  return (
    <details className="relative flex justify-center">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center gap-1 rounded-md px-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <Settings aria-hidden="true" />
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid min-w-48 gap-1 rounded-md border bg-background p-2 shadow-lg">
        {canEdit && <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onEdit(form)}><Pencil aria-hidden="true" />Sửa</Button>}
        <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onSubmissions(form)}><Eye aria-hidden="true" />Xem kết quả</Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" disabled={!iframeCode} onClick={() => copyText(iframeCode)}><Copy aria-hidden="true" />Copy iframe</Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" disabled={!publicUrl} onClick={() => copyText(publicUrl)}><Copy aria-hidden="true" />Copy link</Button>
        {canEdit && form.status !== "published" && <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onPublish(form)}><Rocket aria-hidden="true" />Xuất bản</Button>}
        {canEdit && <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onDuplicate(form)}><FilePlus2 aria-hidden="true" />Nhân bản</Button>}
        {canEdit && <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onRotateSecret(form)}><KeyRound aria-hidden="true" />Đổi secret</Button>}
        {canDelete && <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={() => onDelete(form)}><Trash2 aria-hidden="true" />Xóa</Button>}
      </div>
    </details>
  );
}

function MarketingFormEditor({ savedForm, defaultValues, options, error, isPending, submitLabel, onSubmit }: {
  savedForm?: MarketingFormItem;
  defaultValues: MarketingFormInput;
  options?: MarketingFormFilterOptions;
  error: Error | null;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (values: MarketingFormInput) => void;
}) {
  const savedPublicUrl = savedForm?.publicPath ? buildWebUrl(savedForm.publicPath) : savedForm?.publicKey ? `${window.location.origin}/bieu-mau/${savedForm.publicKey}` : "";
  const savedIframeCode = savedForm ? buildIframeCode(savedForm, savedPublicUrl) : "";
  const form = useForm<MarketingFormInput>({ defaultValues });
  const fields = useFieldArray({ control: form.control, name: "fields" });
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  useEffect(() => form.reset(defaultValues), [defaultValues, form]);
  return (
    <form className="flex flex-col gap-5" onSubmit={form.handleSubmit((values) => {
      const normalized = normalizeInput(values);
      const parsed = formSchema.safeParse(normalized);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => form.setError(issue.path.join(".") as never, { message: issue.message }));
        return;
      }
      onSubmit({ ...parsed.data, customFieldValues: form.getValues("customFieldValues") });
    })}>
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="marketing-form-name">Tên biểu mẫu *</FieldLabel>
          <Input id="marketing-form-name" aria-invalid={Boolean(form.formState.errors.name)} placeholder="Ví dụ: Form đăng ký tư vấn 2026" {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.formType)}>
          <FieldLabel htmlFor="marketing-form-type">Loại biểu mẫu *</FieldLabel>
          <Select value={form.watch("formType")} onValueChange={(value) => form.setValue("formType", value as MarketingFormType, { shouldValidate: true })}>
            <SelectTrigger id="marketing-form-type" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(formTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-form-state">Trạng thái *</FieldLabel>
          <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value as MarketingFormInput["status"])}>
            <SelectTrigger id="marketing-form-state" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <FieldGroup className="grid gap-4">
        <Field data-invalid={Boolean(form.formState.errors.title)}>
          <FieldLabel htmlFor="marketing-form-title">Tiêu đề public form *</FieldLabel>
          <Input id="marketing-form-title" aria-invalid={Boolean(form.formState.errors.title)} {...form.register("title")} />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.subtitle)}>
          <FieldLabel htmlFor="marketing-form-subtitle">Phụ đề</FieldLabel>
          <Input id="marketing-form-subtitle" aria-invalid={Boolean(form.formState.errors.subtitle)} {...form.register("subtitle")} />
          <FieldError errors={[form.formState.errors.subtitle]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.description)}>
          <FieldLabel htmlFor="marketing-form-description">Mô tả</FieldLabel>
          <Textarea id="marketing-form-description" rows={3} aria-invalid={Boolean(form.formState.errors.description)} {...form.register("description")} />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.submitButtonLabel)}>
          <FieldLabel htmlFor="marketing-form-submit-label">Nhãn nút gửi *</FieldLabel>
          <Input id="marketing-form-submit-label" aria-invalid={Boolean(form.formState.errors.submitButtonLabel)} {...form.register("submitButtonLabel")} />
          <FieldError errors={[form.formState.errors.submitButtonLabel]} />
        </Field>
      </FieldGroup>
      <details className="rounded-lg border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Cài đặt nâng cao</summary>
        <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.slug)}>
            <FieldLabel htmlFor="marketing-form-slug">Slug public</FieldLabel>
            <Input id="marketing-form-slug" aria-invalid={Boolean(form.formState.errors.slug)} placeholder="dang-ky-tu-van" {...form.register("slug")} />
            <FieldError errors={[form.formState.errors.slug]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.platform)}>
            <FieldLabel htmlFor="marketing-form-platform-input">Nền tảng</FieldLabel>
            <Input id="marketing-form-platform-input" aria-invalid={Boolean(form.formState.errors.platform)} placeholder="website, facebook..." {...form.register("platform")} />
            <FieldError errors={[form.formState.errors.platform]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.formCode)}>
            <FieldLabel htmlFor="marketing-form-code">Mã biểu mẫu</FieldLabel>
            <Input id="marketing-form-code" aria-invalid={Boolean(form.formState.errors.formCode)} placeholder="WEB-LEAD-2026" {...form.register("formCode")} />
            <FieldError errors={[form.formState.errors.formCode]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.campaignId)}>
            <FieldLabel htmlFor="marketing-form-linked-campaign">Chiến dịch liên kết</FieldLabel>
            <Select value={form.watch("campaignId") || "__empty__"} onValueChange={(value) => form.setValue("campaignId", value === "__empty__" ? "" : value, { shouldValidate: true })}>
              <SelectTrigger id="marketing-form-linked-campaign" className="w-full" aria-invalid={Boolean(form.formState.errors.campaignId)}><SelectValue placeholder="Chọn chiến dịch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">Chọn chiến dịch</SelectItem>
                {(options?.campaigns ?? []).map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError errors={[form.formState.errors.campaignId]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="marketing-form-template">Template giao diện</FieldLabel>
            <Select value={form.watch("templateId") || "__empty__"} onValueChange={(value) => form.setValue("templateId", value === "__empty__" ? "" : value)}>
              <SelectTrigger id="marketing-form-template" className="w-full"><SelectValue placeholder="Chọn template" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">Template mặc định</SelectItem>
                {(options?.templates ?? []).map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <label htmlFor="marketing-form-webhook-enabled" className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox id="marketing-form-webhook-enabled" checked={form.watch("webhookEnabled")} onCheckedChange={(checked) => form.setValue("webhookEnabled", Boolean(checked))} />
            Bật webhook URL
          </label>
          <Field>
            <FieldLabel htmlFor="marketing-form-primary-color">Màu chính</FieldLabel>
            <Input id="marketing-form-primary-color" type="color" className="h-11 p-1" {...form.register("primaryColor")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="marketing-form-background-color">Màu nền</FieldLabel>
            <Input id="marketing-form-background-color" type="color" className="h-11 p-1" {...form.register("backgroundColor")} />
          </Field>
        </FieldGroup>
      </details>
      <section className="space-y-3 rounded-lg border p-4" aria-label="Trường dữ liệu biểu mẫu">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Trường dữ liệu</h3>
            <p className="text-sm text-muted-foreground">Form tạo lead cần ánh xạ tối thiểu Họ và tên và Số điện thoại.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFieldPickerOpen(true)}><Plus aria-hidden="true" />Thêm trường</Button>
        </div>
        <FieldError errors={[form.formState.errors.fields as { message?: string } | undefined]} />
        <div className="space-y-3">
          {fields.fields.map((field, index) => (
            <FormFieldRow
              key={field.id}
              index={index}
              form={form}
              options={options}
              onMoveUp={() => fields.move(index, Math.max(0, index - 1))}
              onMoveDown={() => fields.move(index, Math.min(fields.fields.length - 1, index + 1))}
              onRemove={() => fields.remove(index)}
              canMoveUp={index > 0}
              canMoveDown={index < fields.fields.length - 1}
              canRemove={fields.fields.length > 1}
            />
          ))}
        </div>
      </section>
      {savedIframeCode && (
        <section className="rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Nhúng vào landing page</h3>
              <p className="text-sm text-muted-foreground">Copy iframe để dùng giao diện form đã custom và đổ dữ liệu về CRM.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => copyText(savedIframeCode)} aria-label="Copy iframe nhúng landing page">
              <Copy aria-hidden="true" />Copy iframe
            </Button>
          </div>
          <code className="mt-3 block overflow-x-auto rounded bg-background px-3 py-2 text-xs text-muted-foreground">{savedIframeCode}</code>
        </section>
      )}
      <RuntimeCustomFieldsSection entityType="MARKETING_FORM" entityId={savedForm?.id} disabled={isPending} onChange={(values) => form.setValue("customFieldValues", values, { shouldDirty: false })} />
      <DialogFooter>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : submitLabel}</Button>
      </DialogFooter>
      <AddFieldPickerDialog
        open={fieldPickerOpen}
        options={options}
        onOpenChange={setFieldPickerOpen}
        onAdd={(field) => fields.append({ ...field, sortOrder: fields.fields.length })}
      />
    </form>
  );
}

function FormFieldRow({ index, form, options, onMoveUp, onMoveDown, onRemove, canMoveUp, canMoveDown, canRemove, defaultOpen = false }: {
  index: number;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  options?: MarketingFormFilterOptions;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  defaultOpen?: boolean;
}) {
  const fieldType = form.watch(`fields.${index}.fieldType`);
  const label = form.watch(`fields.${index}.label`) || `Trường ${index + 1}`;
  const fieldKey = form.watch(`fields.${index}.fieldKey`) || "chưa có mã";
  const mapping = form.watch(`fields.${index}.crmMappingField`) ?? form.watch(`fields.${index}.leadField`);
  return (
    <details className="rounded-md border bg-background" open={defaultOpen}>
      <summary className="grid cursor-pointer items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_140px_180px_auto]">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{fieldKey}</p>
        </div>
        <Badge variant="secondary">{fieldTypeLabels[fieldType]}</Badge>
        <span className="text-sm text-muted-foreground">{mapping ? leadFieldLabels[mapping] : "Không mapping"}</span>
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveUp} onClick={(event) => { event.preventDefault(); onMoveUp(); }} aria-label={`Đưa trường ${index + 1} lên`}><ArrowUp aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveDown} onClick={(event) => { event.preventDefault(); onMoveDown(); }} aria-label={`Đưa trường ${index + 1} xuống`}><ArrowDown aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" disabled={!canRemove} onClick={(event) => { event.preventDefault(); onRemove(); }} aria-label={`Xóa trường ${index + 1}`}><Trash2 aria-hidden="true" /></Button>
        </div>
      </summary>
      <div className="grid items-end gap-3 border-t bg-muted/30 p-4 lg:grid-cols-[1fr_1fr_160px_180px_110px]">
        <Field data-invalid={Boolean(form.formState.errors.fields?.[index]?.fieldKey)}>
          <FieldLabel htmlFor={`marketing-field-key-${index}`}>Mã trường *</FieldLabel>
          <Input id={`marketing-field-key-${index}`} placeholder="phone" aria-invalid={Boolean(form.formState.errors.fields?.[index]?.fieldKey)} {...form.register(`fields.${index}.fieldKey`)} />
          <FieldError errors={[form.formState.errors.fields?.[index]?.fieldKey]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.fields?.[index]?.label)}>
          <FieldLabel htmlFor={`marketing-field-label-${index}`}>Nhãn *</FieldLabel>
          <Input id={`marketing-field-label-${index}`} placeholder="Số điện thoại" aria-invalid={Boolean(form.formState.errors.fields?.[index]?.label)} {...form.register(`fields.${index}.label`)} />
          <FieldError errors={[form.formState.errors.fields?.[index]?.label]} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`marketing-field-type-${index}`}>Kiểu</FieldLabel>
          <Select value={fieldType} onValueChange={(value) => form.setValue(`fields.${index}.fieldType`, value as MarketingFormFieldType, { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger id={`marketing-field-type-${index}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(fieldTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`marketing-field-lead-${index}`}>Mapping CRM</FieldLabel>
          <Select value={form.watch(`fields.${index}.crmMappingField`) ?? form.watch(`fields.${index}.leadField`) ?? "__none__"} onValueChange={(value) => {
            const nextValue = value === "__none__" ? null : value as MarketingFormLeadField;
            form.setValue(`fields.${index}.crmMappingField`, nextValue, { shouldDirty: true, shouldValidate: true });
            form.setValue(`fields.${index}.leadField`, nextValue, { shouldDirty: true, shouldValidate: true });
          }}>
            <SelectTrigger id={`marketing-field-lead-${index}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Không mapping</SelectItem>
              {(options?.leadFields ?? Object.keys(leadFieldLabels) as MarketingFormLeadField[]).map((field) => <SelectItem key={field} value={field}>{leadFieldLabels[field]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <label htmlFor={`marketing-field-required-${index}`} className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox id={`marketing-field-required-${index}`} checked={form.watch(`fields.${index}.isRequired`)} onCheckedChange={(checked) => form.setValue(`fields.${index}.isRequired`, Boolean(checked), { shouldDirty: true, shouldValidate: true })} />
          Bắt buộc
        </label>
        <Field className="lg:col-span-2">
          <FieldLabel htmlFor={`marketing-field-placeholder-${index}`}>Placeholder</FieldLabel>
          <Input id={`marketing-field-placeholder-${index}`} placeholder="Gợi ý nhập liệu" {...form.register(`fields.${index}.placeholder`)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`marketing-field-default-${index}`}>Giá trị mặc định</FieldLabel>
          <Input id={`marketing-field-default-${index}`} placeholder="utm_source..." {...form.register(`fields.${index}.defaultValue`)} />
        </Field>
        <Field className="lg:col-span-2">
          <FieldLabel htmlFor={`marketing-field-validation-${index}`}>Validation rule</FieldLabel>
          <Input id={`marketing-field-validation-${index}`} placeholder='Ví dụ: {"minLength":8}' onChange={(event) => {
            try {
              form.setValue(`fields.${index}.validationRules`, event.target.value.trim() ? JSON.parse(event.target.value) : {}, { shouldDirty: true, shouldValidate: true });
            } catch {
              form.setValue(`fields.${index}.validationRules`, { raw: event.target.value }, { shouldDirty: true, shouldValidate: true });
            }
          }} />
        </Field>
        {optionFieldTypes.has(fieldType) && <ChoiceOptionsEditor index={index} form={form} fieldType={fieldType} />}
      </div>
    </details>
  );
}

function ChoiceOptionsEditor({ index, form, fieldType }: {
  index: number;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  fieldType: MarketingFormFieldType;
}) {
  const fields = form.watch("fields");
  const options = form.watch(`fields.${index}.options`) ?? [];
  const defaultValue = form.watch(`fields.${index}.defaultValue`) ?? "";
  const validationRules = form.watch(`fields.${index}.validationRules`) ?? {};
  const dependency = getFieldDependency(validationRules);
  const dependencyParent = fields.find((field) => field.fieldKey === dependency?.parentFieldKey);
  const parentChoices = fields.filter((field, fieldIndex) => fieldIndex !== index && Boolean(field.fieldKey) && optionFieldTypes.has(field.fieldType) && field.options.length > 0);
  const supportsMultipleDefaults = fieldType === "checkbox" || fieldType === "multi_select";
  const defaultValues = defaultValue.split(",").map((value) => value.trim()).filter(Boolean);

  function setOptions(nextOptions: string[]) {
    form.setValue(`fields.${index}.options`, nextOptions, { shouldDirty: true, shouldValidate: true });
    const validDefaults = defaultValues.filter((value) => nextOptions.includes(value));
    form.setValue(`fields.${index}.defaultValue`, validDefaults.join(", "), { shouldDirty: true });
  }

  function updateOption(optionIndex: number, value: string) {
    const nextOptions = options.map((option, currentIndex) => currentIndex === optionIndex ? value : option);
    const oldValue = options[optionIndex];
    const nextDefaults = defaultValues.map((item) => item === oldValue ? value : item).filter(Boolean);
    form.setValue(`fields.${index}.options`, nextOptions, { shouldDirty: true, shouldValidate: true });
    form.setValue(`fields.${index}.defaultValue`, nextDefaults.join(", "), { shouldDirty: true });
  }

  function addOption(afterIndex?: number) {
    const nextLabel = `Lựa chọn ${options.length + 1}`;
    const insertAt = afterIndex === undefined ? options.length : afterIndex + 1;
    setOptions([...options.slice(0, insertAt), nextLabel, ...options.slice(insertAt)]);
  }

  function removeOption(optionIndex: number) {
    setOptions(options.filter((_, currentIndex) => currentIndex !== optionIndex));
  }

  function moveOption(optionIndex: number, direction: -1 | 1) {
    const nextIndex = optionIndex + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    const nextOptions = [...options];
    [nextOptions[optionIndex], nextOptions[nextIndex]] = [nextOptions[nextIndex], nextOptions[optionIndex]];
    setOptions(nextOptions);
  }

  function toggleDefault(value: string) {
    if (!value.trim()) return;
    if (!supportsMultipleDefaults) {
      form.setValue(`fields.${index}.defaultValue`, defaultValue === value ? "" : value, { shouldDirty: true });
      return;
    }
    const nextDefaults = defaultValues.includes(value)
      ? defaultValues.filter((item) => item !== value)
      : [...defaultValues, value];
    form.setValue(`fields.${index}.defaultValue`, nextDefaults.join(", "), { shouldDirty: true });
  }

  function replaceFromBulk(value: string) {
    setOptions(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
  }

  function setDependencyParent(parentFieldKey: string) {
    if (parentFieldKey === "__none__") {
      setFieldDependency(form, index, null);
      return;
    }
    const parent = fields.find((field) => field.fieldKey === parentFieldKey);
    const nextMap: Record<string, string[]> = {};
    for (const option of parent?.options ?? []) {
      nextMap[option] = dependency?.optionMap[option] ?? options;
    }
    setFieldDependency(form, index, { parentFieldKey, optionMap: nextMap });
  }

  function setDependentOptions(parentOption: string, value: string) {
    if (!dependency) return;
    setFieldDependency(form, index, {
      parentFieldKey: dependency.parentFieldKey,
      optionMap: {
        ...dependency.optionMap,
        [parentOption]: value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
      },
    });
  }

  function copyBaseOptionsToParent(parentOption: string) {
    if (!dependency) return;
    setFieldDependency(form, index, {
      parentFieldKey: dependency.parentFieldKey,
      optionMap: { ...dependency.optionMap, [parentOption]: options },
    });
  }

  return (
    <section className="lg:col-span-5 rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold">Cấu hình lựa chọn</h4>
          <p className="text-xs text-muted-foreground">Tùy chỉnh từng option, đặt mặc định và sắp xếp thứ tự hiển thị trên public form.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => addOption()}>
          <Plus aria-hidden="true" />Thêm lựa chọn
        </Button>
      </div>
      <div className="grid gap-3 p-4">
        {options.length === 0 && (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có lựa chọn. Bấm thêm lựa chọn để bắt đầu cấu hình.
          </div>
        )}
        {options.map((option, optionIndex) => {
          const optionId = `marketing-field-${index}-option-${optionIndex}`;
          const defaultChecked = defaultValues.includes(option);
          return (
            <div key={optionIndex} className="grid gap-2 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(180px,1fr)_130px_160px_auto]">
              <Field>
                <FieldLabel htmlFor={optionId}>Tên lựa chọn {optionIndex + 1}</FieldLabel>
                <Input id={optionId} value={option} onChange={(event) => updateOption(optionIndex, event.target.value)} placeholder="Nhập nội dung lựa chọn" />
              </Field>
              <Field>
                <FieldLabel>Giá trị lưu</FieldLabel>
                <Input readOnly value={option || `option_${optionIndex + 1}`} className="bg-background/70 text-muted-foreground" />
              </Field>
              <label className="flex min-h-10 items-end gap-2 pb-2 text-sm">
                <Checkbox checked={defaultChecked} disabled={!option.trim()} onCheckedChange={() => toggleDefault(option)} />
                Mặc định
              </label>
              <div className="flex items-end justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" disabled={optionIndex === 0} onClick={() => moveOption(optionIndex, -1)} aria-label={`Đưa lựa chọn ${optionIndex + 1} lên`}><ArrowUp aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={optionIndex === options.length - 1} onClick={() => moveOption(optionIndex, 1)} aria-label={`Đưa lựa chọn ${optionIndex + 1} xuống`}><ArrowDown aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => addOption(optionIndex)} aria-label={`Thêm lựa chọn sau dòng ${optionIndex + 1}`}><Plus aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(optionIndex)} aria-label={`Xóa lựa chọn ${optionIndex + 1}`}><Trash2 aria-hidden="true" /></Button>
              </div>
            </div>
          );
        })}
        <Field>
          <FieldLabel htmlFor={`marketing-field-options-bulk-${index}`}>Nhập nhanh nhiều lựa chọn</FieldLabel>
          <Textarea
            id={`marketing-field-options-bulk-${index}`}
            rows={3}
            value={options.join("\n")}
            onChange={(event) => replaceFromBulk(event.target.value)}
            placeholder={"Mỗi dòng một lựa chọn\nVí dụ: THPT\nCao đẳng\nĐại học"}
          />
        </Field>
        <section className="rounded-md border bg-muted/20">
          <div className="border-b px-4 py-3">
            <h4 className="text-sm font-semibold">Câu hỏi liên quan</h4>
            <p className="text-xs text-muted-foreground">Dùng khi option của câu hỏi này thay đổi theo câu hỏi khác, ví dụ trình độ học vấn phụ thuộc ngành học.</p>
          </div>
          <div className="grid gap-3 p-4">
            <Field>
              <FieldLabel htmlFor={`marketing-field-dependency-parent-${index}`}>Câu hỏi cha</FieldLabel>
              <Select value={dependency?.parentFieldKey ?? "__none__"} onValueChange={setDependencyParent}>
                <SelectTrigger id={`marketing-field-dependency-parent-${index}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không phụ thuộc</SelectItem>
                  {parentChoices.map((field) => <SelectItem key={field.fieldKey} value={field.fieldKey}>{field.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {dependency && dependencyParent && (
              <div className="grid gap-3">
                {dependencyParent.options.map((parentOption) => (
                  <Field key={parentOption}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <FieldLabel htmlFor={`marketing-field-${index}-dependency-${parentOption}`}>Khi chọn: {parentOption}</FieldLabel>
                      <Button type="button" size="sm" variant="outline" onClick={() => copyBaseOptionsToParent(parentOption)}>Sao chép lựa chọn mặc định</Button>
                    </div>
                    <Textarea
                      id={`marketing-field-${index}-dependency-${parentOption}`}
                      rows={3}
                      value={(dependency.optionMap[parentOption] ?? []).join("\n")}
                      onChange={(event) => setDependentOptions(parentOption, event.target.value)}
                      placeholder={`Mỗi dòng một lựa chọn cho ${parentOption}`}
                    />
                  </Field>
                ))}
              </div>
            )}
            {dependency && !dependencyParent && <p role="alert" className="text-sm text-destructive">Câu hỏi cha không còn tồn tại hoặc không có lựa chọn.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

type FieldPickerChoice = {
  value: MarketingFormLeadField | "__custom__" | "__education_level__";
  label: string;
  defaultType: MarketingFormFieldType;
  required?: boolean;
  fieldKey?: string;
  placeholder?: string;
  options?: string[];
};
const crmFieldChoices: FieldPickerChoice[] = [
  { value: "full_name", label: "Tên khách hàng", defaultType: "text", required: true },
  { value: "email", label: "Email", defaultType: "email" },
  { value: "phone", label: "Số điện thoại", defaultType: "phone", required: true },
  { value: "date_of_birth", label: "Ngày sinh", defaultType: "date" },
  { value: "gender", label: "Giới tính", defaultType: "radio", options: ["Nam", "Nữ", "Khác"] },
  { value: "major_id", label: "Ngành quan tâm", defaultType: "select" },
  { value: "__education_level__", label: "Trình độ học vấn hiện tại", fieldKey: "education_level", placeholder: "Bằng tốt nghiệp", defaultType: "select", options: ["Đã tốt nghiệp THPT", "Đã tốt nghiệp Trung cấp", "Đã tốt nghiệp Cao đẳng", "Đã tốt nghiệp Đại học"] },
  { value: "source_id", label: "Nguồn lead", defaultType: "select" },
  { value: "institution_program_id", label: "Chương trình", defaultType: "select" },
  { value: "note", label: "Ghi chú", defaultType: "textarea" },
  { value: "__custom__", label: "Trường tùy chỉnh", defaultType: "text" },
];

const compactQuestionTypes: Array<{ value: MarketingFormFieldType; label: string }> = [
  { value: "text", label: "Một dòng" },
  { value: "textarea", label: "Nhiều dòng" },
  { value: "select", label: "Chọn một" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Check box" },
  { value: "date", label: "Ngày tháng" },
  { value: "number", label: "Số" },
  { value: "province", label: "Tỉnh thành" },
  { value: "file", label: "File" },
];

const extendedQuestionTypes: Array<{ value: MarketingFormFieldType; label: string }> = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "hidden", label: "Ẩn" },
  { value: "rating", label: "Star" },
  { value: "multi_select", label: "Chọn nhiều" },
];

function AddFieldPickerDialog({ open, options, onOpenChange, onAdd }: {
  open: boolean;
  options?: MarketingFormFilterOptions;
  onOpenChange: (open: boolean) => void;
  onAdd: (field: MarketingFormField) => void;
}) {
  const [selectedField, setSelectedField] = useState<FieldPickerChoice["value"]>("full_name");
  const [selectedType, setSelectedType] = useState<MarketingFormFieldType>("text");
  const [showMore, setShowMore] = useState(false);
  const [search, setSearch] = useState("");
  const selectedChoice = crmFieldChoices.find((field) => field.value === selectedField) ?? crmFieldChoices[0];
  const fieldChoices = crmFieldChoices.filter((field) => field.label.toLowerCase().includes(search.trim().toLowerCase()));
  const typeChoices = showMore ? [...compactQuestionTypes, ...extendedQuestionTypes] : compactQuestionTypes;
  const extraLeadFields: MarketingFormLeadField[] = [];
  for (const field of options?.leadFields ?? []) {
    if (!crmFieldChoices.some((choice) => choice.value === field)) extraLeadFields.push(field);
  }

  function handleSelectField(value: FieldPickerChoice["value"]) {
    const nextChoice = crmFieldChoices.find((field) => field.value === value);
    setSelectedField(value);
    if (nextChoice) setSelectedType(nextChoice.defaultType);
  }

  function addField() {
    const mappedField: MarketingFormLeadField | null = selectedChoice.value === "__custom__" || selectedChoice.value === "__education_level__" ? null : selectedChoice.value;
    const key = mappedField ?? selectedChoice.fieldKey ?? `custom_${Date.now().toString(36)}`;
    onAdd({
      fieldKey: key,
      label: selectedChoice.label,
      placeholder: selectedChoice.placeholder ?? selectedChoice.label,
      fieldType: selectedType,
      isRequired: Boolean(selectedChoice.required),
      options: selectedChoice.options ?? [],
      leadField: mappedField,
      crmMappingField: mappedField,
      validationRules: {},
      defaultValue: "",
      sortOrder: 0,
      isActive: true,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Thêm câu hỏi - chọn kiểu câu hỏi</DialogTitle>
          <DialogDescription>Chọn trường dữ liệu và kiểu câu hỏi trước, sau đó mở từng field để chỉnh chi tiết nếu cần.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="field-picker-group">Trường trong</FieldLabel>
            <Select value="customer">
              <SelectTrigger id="field-picker-group"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="customer">Khách hàng</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="field-picker-crm-field">Chọn trường dữ liệu</FieldLabel>
            <Select value={selectedField} onValueChange={(value) => handleSelectField(value as FieldPickerChoice["value"])}>
              <SelectTrigger id="field-picker-crm-field"><SelectValue placeholder="Chọn trường dữ liệu" /></SelectTrigger>
              <SelectContent className="max-h-80">
                <div className="p-2">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trường dữ liệu" />
                </div>
                <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Thông tin cơ bản</div>
                {fieldChoices.map((field) => (
                  <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                ))}
                {extraLeadFields.map((field) => (
                  <SelectItem key={field} value={field}>{leadFieldLabels[field]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Kiểu câu hỏi của trường</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-3">
              {typeChoices.map((type) => (
                <label key={type.value} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="radio" name="field-question-type" checked={selectedType === type.value} onChange={() => setSelectedType(type.value)} />
                  {type.label}
                </label>
              ))}
            </div>
          </Field>
          {!showMore && (
            <Button type="button" variant="link" className="h-auto justify-start px-0" onClick={() => setShowMore(true)}>Xem thêm</Button>
          )}
          {(selectedField === "email" || selectedField === "phone") && selectedType !== selectedChoice.defaultType && (
            <p role="alert" className="text-sm text-red-600">Nên chọn kiểu câu hỏi {selectedChoice.defaultType === "email" ? "Email" : "Phone"} trong phần chọn trường dữ liệu bên trên.</p>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button type="button" onClick={addField}>Cấu hình trường</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Filters({ filters, options, onChange, onApply, onReset }: {
  filters: MarketingFormFilters;
  options?: MarketingFormFilterOptions;
  onChange: (field: keyof MarketingFormFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5"><CardTitle>Bộ lọc biểu mẫu</CardTitle><CardDescription>Tìm theo tên, mã biểu mẫu hoặc chiến dịch liên kết.</CardDescription></CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(155px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="marketing-form-search">Tìm kiếm</FieldLabel>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="marketing-form-search" className="pl-9" placeholder="Nhập tên hoặc mã form" value={filters.search} onChange={(event) => onChange("search", event.target.value)} /></div>
            </Field>
            <FilterSelect id="marketing-form-status" label="Trạng thái" value={filters.status} onChange={(value) => onChange("status", value)} options={(options?.statuses ?? []).map((status) => ({ value: status, label: displayStatus(status) }))} />
            <FilterSelect id="marketing-form-platform" label="Nền tảng" value={filters.platform} onChange={(value) => onChange("platform", value)} options={(options?.platforms ?? []).map((platform) => ({ value: platform, label: platform }))} />
            <FilterSelect id="marketing-form-campaign" label="Chiến dịch" value={filters.campaignId} onChange={(value) => onChange("campaignId", value)} options={(options?.campaigns ?? []).map((campaign) => ({ value: campaign.id, label: campaign.name }))} />
            <div className="flex items-end gap-2"><Button type="submit">Áp dụng</Button><Button type="button" variant="outline" onClick={onReset}>Xóa lọc</Button></div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Results(props: {
  table: DataTable<MarketingFormItem>;
  data: MarketingFormItem[];
  pagination?: MarketingFormListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { table, data, pagination, page, isLoading, isError, isFetching, onReload, onPrevious, onNext } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5"><CardTitle>Form & Survey</CardTitle><CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} form/survey` : "Đang lấy dữ liệu Form & Survey..."}</CardDescription></CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải Form & Survey" description="Vui lòng thử lại để cập nhật danh sách form/survey." onReload={onReload} /> : isLoading ? <TableLoadingState label="Đang tải Form & Survey" /> : data.length === 0 ? <EmptyState title="Chưa có Form & Survey phù hợp với bộ lọc" description="Tạo form/survey hoặc điều chỉnh bộ lọc để tiếp tục." /> : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && <Pager page={page} pagination={pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<MarketingFormItem> }) {
  return (
    <Table className="min-w-7xl">
      <caption className="sr-only">Danh sách Form & Survey</caption>
      <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
        {table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => {
          const direction = header.column.getIsSorted();
          return <TableHead key={header.id} scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
        })}</TableRow>)}
      </TableHeader>
      <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
  );
}

function SubmissionList({ formId }: { formId: string }) {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["marketing-forms", formId, "submissions", page],
    queryFn: () => getMarketingFormSubmissions(formId, auth.accessToken!, { page, limit: submissionPageSize }),
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  return (
    <div className="space-y-4">
      {query.isError ? <ErrorState title="Không thể tải submission" description="Vui lòng thử lại để cập nhật dữ liệu gửi vào." onReload={() => query.refetch()} /> : query.isLoading ? <TableLoadingState label="Đang tải submission" /> : data.length === 0 ? <EmptyState title="Chưa có dữ liệu gửi vào" description="Submission từ public form hoặc webhook sẽ hiển thị tại đây." /> : <SubmissionTable data={data} />}
      {pagination && pagination.totalPages > 1 && <Pager page={page} pagination={pagination} isFetching={query.isFetching} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => current + 1)} />}
    </div>
  );
}

function SubmissionTable({ data }: { data: MarketingFormSubmission[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-240">
        <TableHeader className="bg-muted/55">
          <TableRow>
            <TableHead>Thời gian</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Nguồn</TableHead>
            <TableHead>Lỗi</TableHead>
            <TableHead>Dữ liệu chuẩn hóa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>{formatDate(submission.createdAt)}</TableCell>
              <TableCell><Badge variant={submission.status === "failed" ? "destructive" : "secondary"}>{displaySubmissionStatus(submission.status)}</Badge></TableCell>
              <TableCell>{submission.lead ? <div><div>{submission.lead.fullName}</div><div className="text-sm text-muted-foreground">{submission.lead.phone}</div></div> : "-"}</TableCell>
              <TableCell>{submission.source ?? "-"}</TableCell>
              <TableCell className="max-w-64 whitespace-normal text-destructive">{submission.errorMessage ?? "-"}</TableCell>
              <TableCell><pre className="max-w-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(submission.normalizedPayload ?? submission.answers ?? {}, null, 2)}</pre></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Pager({ page, pagination, isFetching, onPrevious, onNext }: { page: number; pagination: MarketingFormListResponse["pagination"] | MarketingFormSubmissionListResponse["pagination"]; isFetching: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>;
}

function MutationError({ error }: { error: Error }) {
  return <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}</p>;
}

function MutationSuccess({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 className="size-4" aria-hidden="true" />
      {message}
    </p>
  );
}
