import { sourceGroupSettingsSchema } from "@admission-crm/shared/source-group";
import { SourceGroupField } from "../source-group-field";
import { PageLoadingState } from "@/components/shared/page-loading-state";
import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
const pageSize = 20;
import { ServerDataTable } from "@/components/shared/server-data-table";
import { StaticTableHeader } from "@/components/shared/static-table-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { TabsContent } from "@/components/ui/tabs";
import {
  normalizeMarketingFormOptions,
  validateMarketingFormConfig,
  type MarketingFormOption,
} from "@admission-crm/shared/marketing-form-config";
import { resolveMarketingFormRedirect } from "@admission-crm/shared/marketing-form-embed";
import { describeMarketingFormAnswers } from "@admission-crm/shared/marketing-form-snapshot";
import {
  marketingFormPublicationType,
  newMarketingFormSubmissionSettings,
} from "@admission-crm/shared/marketing-form-submission-policy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  Eye,
  FilePlus2,
  GripVertical,
  HelpCircle,
  Home,
  KeyRound,
  ListChecks,
  Monitor,
  Pencil,
  Plus,
  Rocket,
  Search,
  Settings,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { duplicateMarketingFormField } from "../marketing-form-builder-model";
import {
  MarketingFormCrmPanel,
  MarketingFormProcessingPanel,
  MarketingFormSharePanel,
} from "../marketing-form-builder-panels";
import { MarketingFormBuilderTabs } from "../marketing-form-builder-tabs";
import {
  getEffectiveFieldOptions,
  getFieldDependency,
  leadFieldLabels,
  marketingLeadFieldOptions,
  optionFieldTypes,
} from "../marketing-form-editor-config";
import { MarketingFormLayoutPanel } from "../marketing-form-layout-panel";
import { MarketingFormLeaveDialog } from "../marketing-form-leave-dialog";
import { acknowledgeMarketingFormSave } from "../marketing-form-leave-model";
import { FormFieldRow } from "../marketing-form-question-editor";
import { marketingFormIndexAfterMove } from "../marketing-form-reorder-model";
import { MarketingFormReport } from "../marketing-form-report";
import { canReviewMarketingFormSubmission } from "../marketing-form-review-permissions";
import { MarketingFormSubmissionReview } from "../marketing-form-submission-review";
import { MarketingFormSubmissionSettings } from "../marketing-form-submission-settings";
import { MarketingFormTestPreview } from "../marketing-form-test-preview";
import { useMarketingFormLeaveGuard } from "../use-marketing-form-leave-guard";
import { useMarketingFormReorder } from "../use-marketing-form-reorder";
import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { GroupedFieldPicker, type GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import { getLeadFieldGroup } from "@admission-crm/shared/lead-field-groups";
import { getMarketingLeadField, marketingLeadFieldLabel, marketingLeadMappingFields } from "@admission-crm/shared/marketing-form-lead-fields";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
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
import { marketingFormQueryKey } from "../marketing-form-query-scope";
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
const submissionPageSize = 10;
const emptyFilters: MarketingFormFilters = {
  search: "",
  status: "",
  platform: "",
  campaignId: "",
};
const defaultFields: MarketingFormField[] = [
  {
    fieldKey: "full_name",
    label: "Họ và tên",
    placeholder: "Họ và tên",
    fieldType: "text",
    isRequired: true,
    options: [],
    leadField: "full_name",
    crmMappingField: "full_name",
    sortOrder: 0,
    isActive: true,
  },
  {
    fieldKey: "email",
    label: "Email",
    placeholder: "Email",
    fieldType: "email",
    isRequired: false,
    options: [],
    leadField: "email",
    crmMappingField: "email",
    sortOrder: 1,
    isActive: true,
  },
  {
    fieldKey: "phone",
    label: "Số điện thoại",
    placeholder: "Số điện thoại",
    fieldType: "phone",
    isRequired: true,
    options: [],
    leadField: "phone",
    crmMappingField: "phone",
    sortOrder: 2,
    isActive: true,
  },
  {
    fieldKey: "major_id",
    label: "Ngành đăng ký",
    placeholder: "Chọn ngành đăng ký",
    fieldType: "select",
    isRequired: false,
    options: [],
    leadField: "major_id",
    crmMappingField: "major_id",
    sortOrder: 3,
    isActive: true,
  },
  {
    fieldKey: "graduation_type",
    label: "Bằng tốt nghiệp",
    placeholder: "Chọn bằng tốt nghiệp",
    fieldType: "select",
    isRequired: false,
    options: ["THPT", "Trung cấp", "Cao đẳng", "Đại học"],
    leadField: null,
    crmMappingField: null,
    sortOrder: 4,
    isActive: true,
  },
  {
    fieldKey: "current_address",
    label: "Nơi ở hiện tại",
    placeholder: "Nơi ở hiện tại",
    fieldType: "province",
    isRequired: false,
    options: [],
    leadField: null,
    crmMappingField: null,
    sortOrder: 5,
    isActive: true,
  },
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
  description:
    "Để lại thông tin, cán bộ tư vấn tuyển sinh sẽ liên hệ tư vấn chi tiết cho Quý Anh, Chị.",
  submitButtonLabel: "Tìm hiểu lộ trình",
  templateId: "",
  primaryColor: "#0f62fe",
  backgroundColor: "#f8fafc",
  webhookEnabled: true,
  status: "draft",
  displaySettings: {},
  duplicateSettings: newMarketingFormSubmissionSettings("lead_form"),
  successSettings: {},
  accessSettings: {},
  closeSettings: {},
  advancedSettings: {},
  fields: defaultFields,
  mappings: [],
};
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
  ignored: "Đã bỏ qua liên kết",
  needs_review: "Cần xử lý trùng",
  updated: "Đã bổ sung Lead",
  linked: "Đã liên kết phản hồi",
  processed: "Đã xử lý",
  duplicate: "Trùng lead",
  failed: "Lỗi",
  received: "Đã nhận",
};
const sortableColumns = new Set<MarketingFormSortField>([
  "createdAt",
  "name",
  "platform",
  "status",
]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
type DialogState =
  | { type: "create" }
  | { type: "edit"; form: MarketingFormItem }
  | { type: "delete"; form: MarketingFormItem }
  | { type: "submissions"; form: MarketingFormItem }
  | { type: "secret"; form: MarketingFormItem; secret: string }
  | null;

const fieldSchema = z.object({
  fieldKey: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã trường.")
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      "Chỉ dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.",
    ),
  label: z.string().trim().min(1, "Vui lòng nhập nhãn trường."),
  placeholder: z.string().trim().nullable(),
  fieldType: z.enum([
    "text",
    "textarea",
    "phone",
    "email",
    "number",
    "select",
    "radio",
    "checkbox",
    "date",
    "province",
    "file",
    "hidden",
    "single_select",
    "multi_select",
    "rating",
  ]),
  isRequired: z.boolean(),
  options: z.array(
    z.union([z.string(), z.object({ value: z.string(), label: z.string() })]),
  ),
  leadField: z.enum(marketingLeadMappingFields)
    .nullable()
    .optional(),
  crmMappingField: z.enum(marketingLeadMappingFields)
    .nullable()
    .optional(),
  validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultValue: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});
const formSchema = z
  .object({
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
    status: z.enum([
      "draft",
      "published",
      "archived",
      "active",
      "inactive",
      "closed",
    ]),
    displaySettings: z.record(z.string(), z.unknown()).optional(),
    duplicateSettings: z.record(z.string(), z.unknown()).optional(),
    successSettings: z.record(z.string(), z.unknown()).optional(),
    accessSettings: z.record(z.string(), z.unknown()).optional(),
    closeSettings: z.record(z.string(), z.unknown()).optional(),
    advancedSettings: sourceGroupSettingsSchema.optional(),
    fields: z.array(fieldSchema).min(1, "Cần ít nhất một trường dữ liệu."),
    mappings: z.array(
      z.object({
        sourceField: z.string(),
        leadField: z.enum(marketingLeadMappingFields),
        isRequired: z.boolean(),
      }),
    ),
  })
  .superRefine((input, context) => {
    const keys = new Set<string>();
    input.fields.forEach((field, index) => {
      if (keys.has(field.fieldKey)) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "fieldKey"],
          message: "Mã trường không được trùng.",
        });
      }
      keys.add(field.fieldKey);
    });
    if (["published", "active"].includes(input.status)) {
      try {
        for (const issue of validateMarketingFormConfig(
          input.fields,
          marketingFormPublicationType(input.formType, input.duplicateSettings),
        ))
          context.addIssue({ code: "custom", ...issue });
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["duplicateSettings", "submissionMode"],
          message:
            error instanceof Error
              ? error.message
              : "Chính sách phản hồi không hợp lệ.",
        });
      }
    }
    const redirectUrl =
      typeof input.successSettings?.redirectUrl === "string"
        ? input.successSettings.redirectUrl.trim()
        : "";
    if (redirectUrl) {
      const publicRoot = buildWebUrl("/");
      if (
        !publicRoot ||
        !resolveMarketingFormRedirect(
          input.successSettings,
          new URL(publicRoot).origin,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["successSettings", "redirectUrl"],
          message: "URL chuyển hướng hoặc danh sách origin chưa hợp lệ.",
        });
      }
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
  try {
    const configuredOrigin = String(
      import.meta.env.VITE_PUBLIC_WEB_URL ??
        (import.meta.env.PROD ? "" : window.location.origin),
    ).trim();
    if (!configuredOrigin) return "";
    const origin = new URL(configuredOrigin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      (!local && origin.protocol !== "https:") ||
      (import.meta.env.PROD && local)
    )
      return "";
    return new URL(path, origin.origin).toString();
  } catch {
    return "";
  }
}

function buildIframeUrl(publicUrl: string) {
  if (!publicUrl) return "";
  const url = new URL(publicUrl);
  url.searchParams.set("embed", "1");
  return url.toString();
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildIframeCode(form: MarketingFormItem, publicUrl: string) {
  if (!publicUrl) return "";
  const iframeUrl = buildIframeUrl(publicUrl);
  const title = escapeHtmlAttribute(`Form & Survey - ${form.name}`);
  return `<iframe src="${escapeHtmlAttribute(iframeUrl)}" title="${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;min-height:720px;border:0;border-radius:12px;overflow:hidden;"></iframe>`;
}

function buildEmbedSnippet(form: MarketingFormItem, publicUrl: string) {
  if (!publicUrl) return "";
  const mountId = `admission-crm-form-${form.id}`;
  const scriptUrl = buildWebUrl("/marketing-form-embed.js");
  const redirect = resolveMarketingFormRedirect(
    form.successSettings,
    new URL(publicUrl).origin,
  );
  const redirectAttribute =
    redirect?.mode === "landing_page"
      ? ` data-redirect-url="${escapeHtmlAttribute(redirect.url)}"`
      : "";
  return `<div id="${escapeHtmlAttribute(mountId)}"></div>\n<script async src="${escapeHtmlAttribute(scriptUrl)}" data-mount-id="${escapeHtmlAttribute(mountId)}" data-form-id="${escapeHtmlAttribute(form.id)}" data-form-url="${escapeHtmlAttribute(publicUrl)}" data-title="${escapeHtmlAttribute(`Form & Survey - ${form.name}`)}"${redirectAttribute}></script>`;
}

function toEditorValues(form: MarketingFormItem): MarketingFormInput {
  const fields =
    form.fields.length > 0
      ? form.fields.map((field, index) => ({
          ...field,
          sortOrder: field.sortOrder ?? index,
          placeholder: field.placeholder ?? "",
        }))
      : form.mappings.flatMap((mapping, index) => {
          const leadField = mapping.targetColumn ?? mapping.leadField;
          if (!leadField) return [];
          return [
            {
              fieldKey: mapping.sourceField,
              label: leadFieldLabels[leadField],
              placeholder: "",
              fieldType:
                leadField === "phone"
                  ? "phone"
                  : leadField === "email"
                    ? "email"
                    : "text",
              isRequired: mapping.isRequired,
              options: [],
              leadField,
              crmMappingField: leadField,
              sortOrder: index,
              isActive: true,
            } satisfies MarketingFormField,
          ];
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
    options: normalizeMarketingFormOptions(field.options).map((option) => ({
      ...option,
      label: option.label.trim(),
    })),
    sortOrder: index,
  }));
  return {
    ...values,
    templateId: values.templateId?.startsWith("preset-")
      ? ""
      : values.templateId,
    fields,
    mappings: fields.flatMap((field) => {
      const targetColumn = field.crmMappingField ?? field.leadField;
      return targetColumn
        ? [
            {
              sourceField: field.fieldKey,
              leadField: targetColumn,
              targetTable: "leads",
              targetColumn,
              isRequired: field.isRequired,
            },
          ]
        : [];
    }),
  };
}

async function copyText(value: string) {
  if (!value) return;
  await navigator.clipboard?.writeText(value);
}

export function MarketingFormsPage() {
  const { selectedProgramId } = useInstitutionProgram();
  return <ProgramMarketingFormsPage key={selectedProgramId ?? "no-program"} />;
}

function ProgramMarketingFormsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { programs, selectedProgramId } = useInstitutionProgram();
  const selectedProgram = programs.find(
    (program) => program.id === selectedProgramId,
  );
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [dialog, setDialog] = useReducer(
    (_current: DialogState, next: DialogState) => next,
    null,
  );
  const editingForm = dialog?.type === "edit" ? dialog.form : null;
  const deletingForm = dialog?.type === "delete" ? dialog.form : null;
  const submissionsForm = dialog?.type === "submissions" ? dialog.form : null;
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as MarketingFormSortField)
    ? (selectedSort.id as MarketingFormSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const { listQuery, optionsQuery } = useProgramMarketingFormQueries(
    { selectedProgramId, page, sortBy, sortOrder, filters },
    auth.accessToken,
  );
  const createMutation = useMutation({
    mutationFn: (input: MarketingFormInput) =>
      createMarketingForm(
        normalizeInput(input),
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      setDialog(
        result.webhookSecret
          ? {
              type: "secret",
              form: {
                ...emptyFormItem(result.id),
                publicKey: result.public_key ?? null,
              },
              secret: result.webhookSecret,
            }
          : null,
      );
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: MarketingFormInput) =>
      updateMarketingForm(
        editingForm!.id,
        normalizeInput(input),
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteMarketingForm(
        deletingForm!.id,
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const rotateSecretMutation = useMutation({
    mutationFn: (form: MarketingFormItem) =>
      rotateMarketingFormWebhookSecret(
        form.id,
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: (result, form) => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      setDialog({ type: "secret", form, secret: result.webhookSecret });
    },
  });
  const publishMutation = useMutation({
    mutationFn: (form: MarketingFormItem) =>
      publishMarketingForm(form.id, auth.accessToken!, selectedProgramId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: (form: MarketingFormItem) =>
      duplicateMarketingForm(form.id, auth.accessToken!, selectedProgramId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
    },
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const canManage = auth.can("marketing_form.manage");
  const canCreate = canManage || auth.can("marketing_form.create");
  const canEdit = canManage || auth.can("marketing_form.update_own");
  const table = useReactTable({
    data,
    columns: useColumns({
      canEdit,
      canDelete: canManage,
      onOpenDetail: (form) => navigate(`/marketing/form-survey/${form.id}`),
      onEdit: (form) => {
        updateMutation.reset();
        setDialog({ type: "edit", form });
      },
      onDelete: (form) => {
        deleteMutation.reset();
        setDialog({ type: "delete", form });
      },
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
        return next.length
          ? next.slice(0, 1)
          : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  if (!selectedProgramId)
    return (
      <EmptyState
        title="Chưa chọn chương trình làm việc"
        description="Chọn chương trình trên thanh phía trên để xem và quản lý Form & Survey."
      />
    );

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery, optionsQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Form & Survey"
        scopeLabel={
          selectedProgram
            ? `${selectedProgram.institutionName} - ${selectedProgram.name}`
            : "Phạm vi được cấp"
        }
        description="Quản lý form public, survey, field mapping CRM, preview và link chia sẻ để thu lead từ website, landing page hoặc nguồn bên ngoài."
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                createMutation.reset();
                setDialog({ type: "create" });
              }}
            >
              <Plus aria-hidden="true" />
              Tạo Form & Survey
            </Button>
          ) : undefined
        }
      />
      <Filters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
        onApply={() => {
          setFilters(draftFilters);
          setPage(1);
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setPage(1);
        }}
      />
      {rotateSecretMutation.isError && (
        <MutationError error={rotateSecretMutation.error} />
      )}
      {publishMutation.isError && (
        <MutationError error={publishMutation.error} />
      )}
      {duplicateMutation.isError && (
        <MutationError error={duplicateMutation.error} />
      )}
      <Results
        table={table}
        data={data}
        pagination={listQuery.data?.pagination}
        page={page}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onReload={() => listQuery.refetch()}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
      <Dialog
        open={dialog?.type === "create"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tạo Form & Survey</DialogTitle>
            <DialogDescription>
              Cấu hình public form, survey, field mapping CRM và link chia sẻ.
            </DialogDescription>
          </DialogHeader>
          <MarketingFormEditor
            defaultValues={emptyForm}
            options={optionsQuery.data}
            error={createMutation.error}
            isPending={createMutation.isPending}
            submitLabel="Tạo biểu mẫu"
            onSubmit={(input) => createMutation.mutate(input)}
          />
        </DialogContent>
      </Dialog>
      <EditMarketingFormDialog
        editingForm={editingForm}
        setDialog={setDialog}
        optionsQuery={optionsQuery}
        updateMutation={updateMutation}
      />
      <DeleteMarketingFormDialog
        deletingForm={deletingForm}
        setDialog={setDialog}
        deleteMutation={deleteMutation}
      />
      <MarketingFormSubmissionsDialog
        submissionsForm={submissionsForm}
        setDialog={setDialog}
      />
      <MarketingFormSecretDialog dialog={dialog} setDialog={setDialog} />
    </div>
    </PageLoadingBoundary>
  );
}

export function MarketingFormDetailPage() {
  const { selectedProgramId } = useInstitutionProgram();
  const { formId = "" } = useParams();
  return (
    <ProgramMarketingFormDetailPage
      key={`${selectedProgramId ?? "no-program"}:${formId}`}
    />
  );
}

function ProgramMarketingFormDetailPage() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const { formId = "" } = useParams();
  const queryClient = useQueryClient();
  const [saveMessage, setSaveMessage] = useState("");
  const [savedInput, setSavedInput] = useState<MarketingFormInput | null>(null);
  const formQuery = useQuery({
    queryKey: marketingFormQueryKey(selectedProgramId, "detail", formId),
    queryFn: ({ signal }) =>
      getMarketingForm(formId, auth.accessToken!, selectedProgramId!, signal),
    enabled: Boolean(formId && auth.accessToken && selectedProgramId),
  });
  const optionsQuery = useQuery({
    queryKey: marketingFormQueryKey(selectedProgramId, "options"),
    queryFn: ({ signal }) =>
      getMarketingFormFilterOptions(
        auth.accessToken!,
        selectedProgramId!,
        signal,
      ),
    enabled: Boolean(auth.accessToken && selectedProgramId),
  });
  const updateMutation = useMutation({
    mutationFn: (input: MarketingFormInput) =>
      updateMarketingForm(
        formId,
        normalizeInput(input),
        auth.accessToken!,
        selectedProgramId!,
      ),
    onMutate: () => {
      setSaveMessage("");
    },
    onSuccess: (_response, input) => {
      setSavedInput(structuredClone(input));
      setSaveMessage("Đã lưu cấu hình Form & Survey thành công.");
      void queryClient.invalidateQueries({ queryKey: ["marketing-forms"] });
      void queryClient.invalidateQueries({
        queryKey: marketingFormQueryKey(selectedProgramId, "detail", formId),
      });
    },
  });

  if (!selectedProgramId)
    return (
      <EmptyState
        title="Chưa chọn chương trình làm việc"
        description="Chọn chương trình trên thanh phía trên để mở Form & Survey."
      />
    );
  if (formQuery.isLoading) return <PageLoadingState variant="settings" label="Đang tải chi tiết Form & Survey" />;
  if (formQuery.isError || !formQuery.data) {
    return (
      <ErrorState
        title="Không thể tải Form & Survey"
        description="Form có thể không thuộc chương trình đang chọn hoặc bạn chưa được cấp quyền. Vui lòng quay lại danh sách của chương trình hiện tại."
        onReload={() => formQuery.refetch()}
      />
    );
  }

  return (
    <FormDetailBuilder
      key={formQuery.data.id}
      formItem={formQuery.data}
      defaultValues={toEditorValues(formQuery.data)}
      options={optionsQuery.data}
      error={updateMutation.error}
      successMessage={saveMessage}
      savedInput={savedInput}
      isPending={updateMutation.isPending}
      onSubmit={(input) => updateMutation.mutate(input)}
    />
  );
}

function marketingFormServerErrors(
  error: Error | null,
): FieldErrors<MarketingFormInput> | undefined {
  if (
    !(error instanceof ApiError) ||
    !error.details ||
    typeof error.details !== "object"
  )
    return undefined;
  const issues = (
    error.details as {
      issues?: Array<{ path?: Array<string | number>; message?: string }>;
    }
  ).issues;
  if (!Array.isArray(issues)) return undefined;
  const result: Record<string, unknown> = {};
  for (const issue of issues) {
    if (!issue.path?.length || typeof issue.message !== "string") continue;
    if (
      !["fields", "name", "duplicateSettings", "displaySettings"].includes(
        String(issue.path[0]),
      )
    )
      continue;
    if (
      issue.path.some(
        (part) =>
          typeof part === "string" &&
          ["__proto__", "constructor", "prototype"].includes(part),
      )
    )
      continue;
    let cursor = result;
    issue.path.forEach((part, index) => {
      if (index === issue.path!.length - 1)
        cursor[String(part)] = { type: "server", message: issue.message };
      else {
        cursor[String(part)] ??= {};
        cursor = cursor[String(part)] as Record<string, unknown>;
      }
    });
  }
  return result as FieldErrors<MarketingFormInput>;
}

type FormDetailBuilderProps = {
  formItem: MarketingFormItem;
  defaultValues: MarketingFormInput;
  options?: MarketingFormFilterOptions;
  error: Error | null;
  successMessage: string;
  savedInput: MarketingFormInput | null;
  isPending: boolean;
  onSubmit: (input: MarketingFormInput) => void;
};

function FormDetailBuilder({
  formItem,
  defaultValues,
  options,
  error,
  successMessage,
  savedInput,
  isPending,
  onSubmit,
}: FormDetailBuilderProps) {
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("questions");
  const [previewInput, setPreviewInput] = useState<MarketingFormInput | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const serverErrors = useMemo(() => marketingFormServerErrors(error), [error]);
  const form = useForm<MarketingFormInput>({
    defaultValues: { customFieldValues: {}, ...defaultValues },
    errors: serverErrors,
  });
  const fields = useFieldArray({ control: form.control, name: "fields" });
  const reorder = useMarketingFormReorder({
    ids: fields.fields.map((field) => field.id),
    label: "câu hỏi",
    disabled: isPending,
    onMove: (from, to) => {
      fields.move(from, to);
      setEditingIndex((current) =>
        marketingFormIndexAfterMove(current, from, to),
      );
    },
  });
  const publicUrl = formItem.publicPath
    ? buildWebUrl(formItem.publicPath)
    : formItem.publicKey
      ? buildWebUrl(`/bieu-mau/${formItem.publicKey}`)
      : "";
  const iframeCode = buildIframeCode(formItem, publicUrl);
  const embedSnippet = buildEmbedSnippet(formItem, publicUrl);
  const watchedTitle =
    form.watch("title") || form.watch("name") || formItem.name;
  const hasUnsavedChanges = form.formState.isDirty;
  const leaveGuard = useMarketingFormLeaveGuard(hasUnsavedChanges, isPending);

  useEffect(() => {
    if (savedInput) {
      acknowledgeMarketingFormSave(form, savedInput);
    }
  }, [form, savedInput]);

  function removeField(index: number) {
    fields.remove(index);
    setEditingIndex((current) =>
      current === index
        ? null
        : current && current > index
          ? current - 1
          : current,
    );
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (fields.fields[target])
      reorder.move(fields.fields[index].id, fields.fields[target].id);
  }

  function submitValidated(values: MarketingFormInput) {
    if (isPending) return false;
    form.clearErrors();
    const parsed = formSchema.safeParse(normalizeInput(values));
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError(issue.path.join(".") as never, {
          message: issue.message,
        });
      const first = parsed.error.issues[0];
      if (first?.path[0] === "fields" && typeof first.path[1] === "number") {
        const index = first.path[1];
        setActiveTab("questions");
        setEditingIndex(index);
        const field = String(first.path[2] ?? "fieldKey");
        const control =
          (
            {
              fieldKey: "key",
              validationRules: "validation",
              options: "options-bulk",
              crmMappingField: "lead",
              leadField: "lead",
            } as Record<string, string>
          )[field] ?? field;
        requestAnimationFrame(() =>
          document
            .getElementById(`marketing-field-${control}-${index}`)
            ?.focus(),
        );
      }
      return false;
    }
    onSubmit({
      ...values,
      customFieldValues: form.getValues("customFieldValues"),
    });
    return true;
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={form.handleSubmit(submitValidated)}
    >
      <div className="flex flex-col gap-3 border-b bg-background px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <nav
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          aria-label="Đường dẫn Form & Survey"
        >
          <Link
            to="/tong-quan"
            className="inline-flex items-center gap-1 text-foreground hover:text-primary"
          >
            <Home aria-hidden="true" />
            Trang chủ
          </Link>
          <span>/</span>
          <Link to="/marketing/form-survey" className="hover:text-primary">
            Quản lý khảo sát
          </Link>
          <span>/</span>
          <span className="text-foreground">{formItem.name}</span>
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            type="button"
            variant="default"
            className="bg-green-600 hover:bg-green-700"
          >
            <Link to="/marketing/form-survey">
              <ListChecks aria-hidden="true" />
              Xem tất cả kết quả khảo sát
            </Link>
          </Button>
          <Button type="submit" disabled={isPending || !hasUnsavedChanges}>
            {isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
          <Button type="button" onClick={() => setFieldPickerOpen(true)}>
            <FilePlus2 aria-hidden="true" />
            Thêm câu hỏi
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewInput(structuredClone(form.getValues()))}
          >
            <Eye data-icon="inline-start" aria-hidden="true" />
            Điền thử
          </Button>
        </div>
      </div>

      <div className="mx-5 rounded-sm border bg-background">
        <MarketingFormBuilderTabs value={activeTab} onChange={setActiveTab}>
          <TabsContent value={activeTab}>
            <MarketingBuilderTabContent
              activeTab={activeTab}
              form={form}
              options={options}
              publicUrl={publicUrl}
              iframeCode={iframeCode}
              embedSnippet={embedSnippet}
              formItem={formItem}
              fields={fields}
              isPending={isPending}
              setActiveTab={setActiveTab}
              watchedTitle={watchedTitle}
              hasUnsavedChanges={hasUnsavedChanges}
              reorder={reorder}
              editingIndex={editingIndex}
              setEditingIndex={setEditingIndex}
              removeField={removeField}
              moveField={moveField}
              setFieldPickerOpen={setFieldPickerOpen}
              setSettingsOpen={setSettingsOpen}
              setPreviewInput={setPreviewInput}
            />
          </TabsContent>
        </MarketingFormBuilderTabs>
      </div>

      <RuntimeCustomFieldsSection
        entityType="MARKETING_FORM"
        entityId={formItem.id}
        disabled={isPending}
        onChange={(values) =>
          form.setValue("customFieldValues", values, { shouldDirty: true })
        }
      />

      {error && <MutationError error={error} />}
      {successMessage && <MutationSuccess message={successMessage} />}
      {previewInput && (
        <MarketingFormTestPreview
          input={previewInput}
          onClose={() => setPreviewInput(null)}
        />
      )}
      <MarketingFormLeaveDialog {...leaveGuard} />
      <FormSettingsDrawer
        open={settingsOpen}
        form={form}
        fields={fields.fields.map((field, index) =>
          form.watch(`fields.${index}`),
        )}
        isPending={isPending}
        onClose={() => setSettingsOpen(false)}
        onSave={() =>
          form.handleSubmit((values) => {
            if (submitValidated(values)) setSettingsOpen(false);
          })()
        }
      />
      <AddFieldPickerDialog
        open={fieldPickerOpen}
        options={options}
        onOpenChange={setFieldPickerOpen}
        onAdd={(field) => {
          fields.append({ ...field, sortOrder: fields.fields.length });
          setEditingIndex(fields.fields.length);
        }}
      />
    </form>
  );
}

function PreviewField({
  field,
  options = normalizeMarketingFormOptions(field.options),
}: {
  field: MarketingFormField;
  options?: MarketingFormOption[];
}) {
  if (field.fieldType === "textarea")
    return (
      <Textarea
        readOnly
        className="mt-4 rounded-none"
        rows={3}
        placeholder={
          field.placeholder ||
          `Vui lòng nhập ${field.label.toLowerCase()} vào đây`
        }
      />
    );
  if (
    field.fieldType === "select" ||
    field.fieldType === "single_select" ||
    field.fieldType === "province"
  ) {
    return (
      <Input
        readOnly
        className="mt-4 rounded-none"
        placeholder={
          options.length
            ? options[0].label
            : field.placeholder || `Vui lòng chọn ${field.label.toLowerCase()}`
        }
      />
    );
  }
  if (
    field.fieldType === "radio" ||
    field.fieldType === "checkbox" ||
    field.fieldType === "multi_select"
  ) {
    return (
      <div className="mt-4 grid gap-2">
        {(options.length
          ? options
          : normalizeMarketingFormOptions(["Lựa chọn 1", "Lựa chọn 2"])
        ).map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <input
              type={field.fieldType === "radio" ? "radio" : "checkbox"}
              disabled
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <Input
      readOnly
      className="mt-4 rounded-none"
      placeholder={
        field.placeholder ||
        `Vui lòng nhập ${field.label.toLowerCase()} vào đây`
      }
    />
  );
}

type SettingsGroupName =
  | "displaySettings"
  | "duplicateSettings"
  | "successSettings"
  | "accessSettings"
  | "closeSettings"
  | "advancedSettings";

function getSettingValue<T>(
  form: ReturnType<typeof useForm<MarketingFormInput>>,
  group: SettingsGroupName,
  key: string,
  fallback: T,
): T {
  const settings = form.getValues(group) ?? {};
  const value = settings[key];
  return value === undefined || value === null ? fallback : (value as T);
}

function setSettingValue(
  form: ReturnType<typeof useForm<MarketingFormInput>>,
  group: SettingsGroupName,
  key: string,
  value: unknown,
) {
  form.setValue(
    group,
    { ...(form.getValues(group) ?? {}), [key]: value },
    { shouldDirty: true, shouldValidate: true },
  );
}

type FormSettingsDrawerProps = {
  open: boolean;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  fields: MarketingFormField[];
  isPending: boolean;
  onClose: () => void;
  onSave: () => void;
};

function FormSettingsDrawer({
  open,
  form,
  fields,
  isPending,
  onClose,
  onSave,
}: FormSettingsDrawerProps) {
  const [tab, setTab] = useState<
    | "basic"
    | "duplicate"
    | "success"
    | "access"
    | "close"
    | "advanced"
    | "mapping"
  >("basic");
  if (!open) return null;
  const duplicateFields = getSettingValue<string[]>(
    form,
    "duplicateSettings",
    "fields",
    ["phone"],
  );
  const selectedDuplicateFields = new Set(duplicateFields);
  const duplicateChoices = fields.filter((field) =>
    ["phone", "email"].includes(
      field.crmMappingField ?? field.leadField ?? field.fieldKey,
    ),
  );
  const tabs = [
    ["basic", "Cơ bản"],
    ["duplicate", "Kiểm tra trùng"],
    ["success", "Sau khi gửi thành công"],
    ["access", "Phân quyền"],
    ["close", "Đóng form"],
    ["advanced", "Nâng cao"],
    ["mapping", "Mapping"],
  ] as const;
  const mappingOptions = marketingLeadFieldOptions(
    Object.keys(leadFieldLabels) as MarketingFormLeadField[],
    { value: "__none__", label: "Không mapping" },
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/55">
      <aside className="ml-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-bold uppercase">Cài đặt khảo sát</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Đóng cài đặt khảo sát"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b px-5 pt-3">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-10 border-b-2 px-3 text-sm ${tab === key ? "border-primary text-primary" : "border-transparent"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && <FormBasicSettings form={form} />}

          {tab === "duplicate" && (
            <FormDuplicateSettings
              form={form}
              duplicateChoices={duplicateChoices}
              selectedDuplicateFields={selectedDuplicateFields}
              duplicateFields={duplicateFields}
            />
          )}

          {tab === "success" && <FormSuccessSettings form={form} />}

          {tab === "access" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={getSettingValue(
                  form,
                  "accessSettings",
                  "enabled",
                  false,
                )}
                onCheckedChange={(checked) =>
                  setSettingValue(
                    form,
                    "accessSettings",
                    "enabled",
                    Boolean(checked),
                  )
                }
              />
              Bật tính năng phân quyền
            </label>
          )}

          {tab === "close" && (
            <div className="grid gap-5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={getSettingValue(
                    form,
                    "closeSettings",
                    "isActive",
                    true,
                  )}
                  onCheckedChange={(checked) =>
                    setSettingValue(
                      form,
                      "closeSettings",
                      "isActive",
                      Boolean(checked),
                    )
                  }
                />
                Kích hoạt Form
              </label>
              <Field>
                <FieldLabel>Thời gian đóng Form</FieldLabel>
                <Input
                  type="datetime-local"
                  value={getSettingValue(form, "closeSettings", "closeAt", "")}
                  onChange={(event) =>
                    setSettingValue(
                      form,
                      "closeSettings",
                      "closeAt",
                      event.target.value,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Đường dẫn điều hướng khi đóng</FieldLabel>
                <Input
                  value={getSettingValue(
                    form,
                    "closeSettings",
                    "redirectUrl",
                    "",
                  )}
                  onChange={(event) =>
                    setSettingValue(
                      form,
                      "closeSettings",
                      "redirectUrl",
                      event.target.value,
                    )
                  }
                  placeholder="Đường dẫn điều hướng nếu có..."
                />
              </Field>
              <Field>
                <FieldLabel>Thông báo tạm dừng khảo sát</FieldLabel>
                <Input
                  value={getSettingValue(
                    form,
                    "closeSettings",
                    "closedMessage",
                    "Biểu mẫu đã tạm dừng nhận thông tin.",
                  )}
                  onChange={(event) =>
                    setSettingValue(
                      form,
                      "closeSettings",
                      "closedMessage",
                      event.target.value,
                    )
                  }
                />
              </Field>
            </div>
          )}

          {tab === "advanced" && <FormAdvancedSettings form={form} />}

          {tab === "mapping" && (
            <div className="space-y-4">
              <Button type="button" size="sm" onClick={() => setTab("basic")}>
                Thêm
              </Button>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm font-medium">
                <span>Bảng</span>
                <span>Trường</span>
                <span>Bảng giá trị</span>
              </div>
              {fields.map((field, index) => (
                <div
                  key={field.fieldKey}
                  className="grid grid-cols-[1fr_1fr_1fr] gap-3"
                >
                  <Input readOnly value="leads" />
                  <Input readOnly value={field.label} />
                  <GroupedFieldPicker
                    value={
                      field.crmMappingField ?? field.leadField ?? "__none__"
                    }
                    options={mappingOptions}
                    aria-label={`Trường CRM cho ${field.label}`}
                    onChange={(value) => {
                      const next =
                        value === "__none__"
                          ? null
                          : (value as MarketingFormLeadField);
                      form.setValue(`fields.${index}.crmMappingField`, next, {
                        shouldDirty: true,
                      });
                      form.setValue(`fields.${index}.leadField`, next, {
                        shouldDirty: true,
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t bg-muted/30 px-6 py-4 text-right">
          <Button type="button" disabled={isPending} onClick={onSave}>
            {isPending ? "Đang lưu..." : "Lưu và thoát"}
          </Button>
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
  return {
    id: `preset-${index + 1}`,
    name: index === 0 ? "Webform Mặc định" : `Webform #${index + 1}`,
    primaryColor: palettes[index][0],
    backgroundColor: palettes[index][1],
  };
});

type TemplateSharePanelProps = {
  formItem: MarketingFormItem;
  form: ReturnType<typeof useForm<MarketingFormInput>>;
  options?: MarketingFormFilterOptions;
  fields: MarketingFormField[];
  publicUrl: string;
  iframeCode: string;
  isPending: boolean;
  onBackSettings: () => void;
};

function TemplateSharePanel({
  formItem,
  form,
  options,
  fields,
  publicUrl,
  iframeCode,
  isPending,
  onBackSettings,
}: TemplateSharePanelProps) {
  const templates = options?.templates?.length ? options.templates : [];
  const watchedTemplateId = form.watch("templateId");
  const currentTemplateId =
    watchedTemplateId && !watchedTemplateId.startsWith("preset-")
      ? watchedTemplateId
      : getSettingValue(
          form,
          "displaySettings",
          "templatePresetId",
          templates.find((template) => template.isDefault)?.id ||
            fallbackTemplatePresets[0].id,
        );
  const activePreset =
    fallbackTemplatePresets.find((preset) => preset.id === currentTemplateId) ??
    fallbackTemplatePresets[0];
  const primaryColor = form.watch("primaryColor") || activePreset.primaryColor;
  const backgroundColor =
    form.watch("backgroundColor") || activePreset.backgroundColor;
  const title = form.watch("title") || form.watch("name") || formItem.name;
  const submitText = form.watch("submitButtonLabel") || "Thực hiện khảo sát";

  function selectTemplate(
    template: MarketingFormTemplate | null,
    preset = activePreset,
  ) {
    form.setValue("templateId", template?.id ?? "", { shouldDirty: true });
    setSettingValue(
      form,
      "displaySettings",
      "templatePresetId",
      template?.id ?? preset.id,
    );
    form.setValue("primaryColor", preset.primaryColor, { shouldDirty: true });
    form.setValue("backgroundColor", preset.backgroundColor, {
      shouldDirty: true,
    });
  }

  return (
    <div className="grid min-h-180 bg-[#eee8f8] lg:grid-cols-[300px_1fr]">
      <aside className="border-r bg-background">
        <div className="border-b p-3">
          <div className="flex items-center gap-2 text-lg font-medium">
            Chọn mẫu có sẵn{" "}
            <Badge variant="secondary" className="bg-orange-600 text-white">
              SURVEY
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 border-b text-sm">
          <button type="button" className="min-h-10 border-r px-3 text-left">
            Survey
          </button>
          <button
            type="button"
            className="min-h-10 bg-primary px-3 text-left text-primary-foreground"
          >
            WebForms
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-4">
          {(templates.length ? templates : fallbackTemplatePresets).map(
            (templateLike, index) => {
              const template =
                "previewImage" in templateLike ? templateLike : null;
              const preset =
                fallbackTemplatePresets[index % fallbackTemplatePresets.length];
              const id = template?.id ?? preset.id;
              const name = template?.name ?? preset.name;
              const selected = currentTemplateId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTemplate(template, preset)}
                  className={`overflow-hidden rounded border bg-background text-left shadow-sm transition hover:border-primary ${selected ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                >
                  <TemplateThumbnail template={template} preset={preset} />
                  <span className="block truncate px-1 pb-1 text-primary">
                    {name}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBackSettings}>
              <ChevronLeft aria-hidden="true" />
              Quay về cài đặt
            </Button>
            <Button type="submit" disabled={isPending}>
              <Settings aria-hidden="true" />
              {isPending ? "Đang lưu" : "Lưu giao diện"}
            </Button>
          </div>
          <div className="flex items-center gap-3 text-primary">
            <Monitor aria-label="Preview desktop" />
            <Smartphone aria-label="Preview mobile" />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => selectTemplate(null, fallbackTemplatePresets[0])}
            >
              Mặc định
            </Button>
            <Button
              type="button"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => copyText(iframeCode || publicUrl)}
              disabled={!iframeCode && !publicUrl}
            >
              <Copy aria-hidden="true" />
              Lấy link chia sẻ
            </Button>
          </div>
        </div>

        <div className="px-4 py-2" style={{ backgroundColor }}>
          <div className="mx-auto w-full max-w-2xl space-y-3 py-2">
            <div className="rounded-lg border bg-background shadow-xs">
              <div
                className="h-3 rounded-t-lg"
                style={{ backgroundColor: primaryColor }}
              />
              <h2 className="px-6 py-4 text-3xl font-medium">{title}</h2>
            </div>
            {fields
              .filter(
                (field) =>
                  field.isActive !== false && field.fieldType !== "hidden",
              )
              .map((field, index) => (
                <div
                  key={field.fieldKey}
                  className="rounded-lg border bg-background px-6 py-4 shadow-xs"
                >
                  <h3 className="text-lg font-semibold">
                    {index + 1}. {field.label}{" "}
                    {field.isRequired && (
                      <span className="text-red-500">*</span>
                    )}
                  </h3>
                  <PreviewField field={field} />
                </div>
              ))}
            <div className="pt-2 text-center">
              <Button
                type="button"
                style={{ backgroundColor: primaryColor }}
                onClick={() => copyText(iframeCode)}
                disabled={!iframeCode}
              >
                <Copy aria-hidden="true" />
                {submitText}
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">
                Bằng cách nhấn Thực hiện khảo sát, bạn xác nhận đã đọc và đồng ý
                với chính sách bảo vệ dữ liệu cá nhân.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Đừng bao giờ gửi mật khẩu qua Form này!
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplateThumbnail({
  template,
  preset,
}: {
  template: MarketingFormTemplate | null;
  preset: { primaryColor: string; backgroundColor: string };
}) {
  if (template?.previewImage)
    return (
      <img
        src={template.previewImage}
        alt=""
        className="h-28 w-full object-cover"
        loading="lazy"
      />
    );
  return (
    <div className="flex h-28 items-start justify-center bg-muted p-3">
      <div className="w-14 rounded-sm bg-background shadow-sm">
        <div
          className="h-1.5 rounded-t-sm"
          style={{ backgroundColor: preset.primaryColor }}
        />
        <div className="space-y-1.5 p-1.5">
          <div className="h-2 rounded-sm bg-muted" />
          <div className="h-2 rounded-sm bg-muted" />
          <div className="h-2 rounded-sm bg-muted" />
          <div
            className="mx-auto h-2 w-8 rounded-sm"
            style={{ backgroundColor: preset.primaryColor }}
          />
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

type useColumnsProps = {
  canEdit: boolean;
  canDelete: boolean;
  onOpenDetail: (form: MarketingFormItem) => void;
  onEdit: (form: MarketingFormItem) => void;
  onDelete: (form: MarketingFormItem) => void;
  onSubmissions: (form: MarketingFormItem) => void;
  onRotateSecret: (form: MarketingFormItem) => void;
  onPublish: (form: MarketingFormItem) => void;
  onDuplicate: (form: MarketingFormItem) => void;
};

function useColumns({
  canEdit,
  canDelete,
  onOpenDetail,
  onEdit,
  onDelete,
  onSubmissions,
  onRotateSecret,
  onPublish,
  onDuplicate,
}: useColumnsProps) {
  return useMemo<ColumnDef<MarketingFormItem>[]>(
    () => [
      {
        id: "select",
        header: () => <Checkbox aria-label="Chọn tất cả Form & Survey" />,
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox aria-label={`Chọn ${row.original.name}`} />
        ),
      },
      {
        id: "index",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-primary">{row.index + 1}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Tên Form và Survey",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="link"
            className="h-auto justify-start px-0 text-primary"
            onClick={() => onOpenDetail(row.original)}
          >
            {row.original.name}
          </Button>
        ),
      },
      {
        id: "submissions",
        header: "Lượt phản hồi",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-foreground"
            onClick={() => onSubmissions(row.original)}
          >
            {row.original.submissionCount}
          </Button>
        ),
      },
      {
        id: "fields",
        header: "Số câu hỏi",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.fields.length || row.original.mappings.length,
      },
      {
        id: "creator",
        header: "Người tạo",
        enableSorting: false,
        cell: ({ row }) => (
          <CreatorCell form={row.original} date={row.original.createdAt} />
        ),
      },
      {
        id: "updatedAt",
        header: "Ngày cập nhật",
        enableSorting: false,
        cell: ({ row }) => (
          <CreatorCell
            form={row.original}
            date={row.original.updatedAt ?? row.original.createdAt}
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Trạng thái/Loại",
        cell: ({ row }) => <StatusTypeCell form={row.original} />,
      },
      {
        id: "actions",
        header: () => (
          <span className="flex justify-center">
            <Settings aria-label="Hành động" />
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <FormActionMenu
            form={row.original}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onPublish={onPublish}
            onRotateSecret={onRotateSecret}
            onSubmissions={onSubmissions}
          />
        ),
      },
    ],
    [
      canDelete,
      canEdit,
      onDelete,
      onDuplicate,
      onEdit,
      onOpenDetail,
      onPublish,
      onRotateSecret,
      onSubmissions,
    ],
  );
}

function CreatorCell({
  form,
  date,
}: {
  form: MarketingFormItem;
  date: string | null | undefined;
}) {
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
      <div>
        <span className="font-semibold">Trạng thái:</span>{" "}
        {displayStatus(form.status)}
      </div>
      <div>
        <span className="font-semibold">Loại:</span>{" "}
        {formTypeLabels[form.formType]}
      </div>
    </div>
  );
}

type FormActionMenuProps = {
  form: MarketingFormItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (form: MarketingFormItem) => void;
  onDelete: (form: MarketingFormItem) => void;
  onSubmissions: (form: MarketingFormItem) => void;
  onRotateSecret: (form: MarketingFormItem) => void;
  onPublish: (form: MarketingFormItem) => void;
  onDuplicate: (form: MarketingFormItem) => void;
};

function FormActionMenu({
  form,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onSubmissions,
  onRotateSecret,
  onPublish,
  onDuplicate,
}: FormActionMenuProps) {
  const publicUrl = form.publicPath
    ? buildWebUrl(form.publicPath)
    : form.publicKey
      ? buildWebUrl(`/bieu-mau/${form.publicKey}`)
      : "";
  const iframeCode = buildIframeCode(form, publicUrl);
  return (
    <details className="relative flex justify-center">
      <summary
        aria-label="Thao tÃ¡c biá»ƒu máº«u"
        className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center gap-1 rounded-md px-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Settings aria-hidden="true" />
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid min-w-48 gap-1 rounded-md border bg-background p-2 shadow-lg">
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onEdit(form)}
          >
            <Pencil aria-hidden="true" />
            Sửa
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => onSubmissions(form)}
        >
          <Eye aria-hidden="true" />
          Xem kết quả
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={!iframeCode}
          onClick={() => copyText(iframeCode)}
        >
          <Copy aria-hidden="true" />
          Copy iframe
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={!publicUrl}
          onClick={() => copyText(publicUrl)}
        >
          <Copy aria-hidden="true" />
          Copy link
        </Button>
        {canEdit && form.status !== "published" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onPublish(form)}
          >
            <Rocket aria-hidden="true" />
            Xuất bản
          </Button>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onDuplicate(form)}
          >
            <FilePlus2 aria-hidden="true" />
            Nhân bản
          </Button>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onRotateSecret(form)}
          >
            <KeyRound aria-hidden="true" />
            Đổi secret
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-destructive hover:text-destructive"
            onClick={() => onDelete(form)}
          >
            <Trash2 aria-hidden="true" />
            Xóa
          </Button>
        )}
      </div>
    </details>
  );
}

type MarketingFormEditorProps = {
  savedForm?: MarketingFormItem;
  defaultValues: MarketingFormInput;
  options?: MarketingFormFilterOptions;
  error: Error | null;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (values: MarketingFormInput) => void;
};

function MarketingFormEditor({
  savedForm,
  defaultValues,
  options,
  error,
  isPending,
  submitLabel,
  onSubmit,
}: MarketingFormEditorProps) {
  const savedPublicUrl = savedForm?.publicPath
    ? buildWebUrl(savedForm.publicPath)
    : savedForm?.publicKey
      ? buildWebUrl(`/bieu-mau/${savedForm.publicKey}`)
      : "";
  const savedIframeCode = savedForm
    ? buildIframeCode(savedForm, savedPublicUrl)
    : "";
  const serverErrors = useMemo(() => marketingFormServerErrors(error), [error]);
  const form = useForm<MarketingFormInput>({
    defaultValues,
    errors: serverErrors,
  });
  const fields = useFieldArray({ control: form.control, name: "fields" });
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const submissionModeChosen = useRef(false);
  useEffect(() => form.reset(defaultValues), [defaultValues, form]);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={form.handleSubmit((values) => {
        const normalized = normalizeInput(values);
        const parsed = formSchema.safeParse(normalized);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) =>
            form.setError(issue.path.join(".") as never, {
              message: issue.message,
            }),
          );
          return;
        }
        onSubmit({
          ...parsed.data,
          customFieldValues: form.getValues("customFieldValues"),
        });
      })}
    >
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          data-invalid={Boolean(form.formState.errors.name)}
        >
          <FieldLabel htmlFor="marketing-form-name">Tên biểu mẫu *</FieldLabel>
          <Input
            id="marketing-form-name"
            aria-invalid={Boolean(form.formState.errors.name)}
            placeholder="Ví dụ: Form đăng ký tư vấn 2026"
            {...form.register("name")}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.formType)}>
          <FieldLabel htmlFor="marketing-form-type">Loại biểu mẫu *</FieldLabel>
          <Select
            value={form.watch("formType")}
            onValueChange={(value) => {
              form.setValue("formType", value as MarketingFormType, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (!savedForm && !submissionModeChosen.current) {
                const settings = {
                  ...(form.getValues("duplicateSettings") ?? {}),
                };
                for (const key of [
                  "submissionMode",
                  "submissionPolicyVersion",
                  "updatePolicy",
                  "overwriteFields",
                ])
                  delete settings[key];
                form.setValue(
                  "duplicateSettings",
                  newMarketingFormSubmissionSettings(value, settings),
                  { shouldDirty: true, shouldValidate: true },
                );
              }
            }}
          >
            <SelectTrigger id="marketing-form-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(formTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-form-state">Trạng thái *</FieldLabel>
          <Select
            value={form.watch("status")}
            onValueChange={(value) =>
              form.setValue("status", value as MarketingFormInput["status"])
            }
          >
            <SelectTrigger id="marketing-form-state" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <MarketingFormSubmissionSettings
        form={form}
        onModeChange={() => {
          submissionModeChosen.current = true;
        }}
      />
      <FieldGroup className="grid gap-4">
        <Field data-invalid={Boolean(form.formState.errors.title)}>
          <FieldLabel htmlFor="marketing-form-title">
            Tiêu đề public form *
          </FieldLabel>
          <Input
            id="marketing-form-title"
            aria-invalid={Boolean(form.formState.errors.title)}
            {...form.register("title")}
          />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.subtitle)}>
          <FieldLabel htmlFor="marketing-form-subtitle">Phụ đề</FieldLabel>
          <Input
            id="marketing-form-subtitle"
            aria-invalid={Boolean(form.formState.errors.subtitle)}
            {...form.register("subtitle")}
          />
          <FieldError errors={[form.formState.errors.subtitle]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.description)}>
          <FieldLabel htmlFor="marketing-form-description">Mô tả</FieldLabel>
          <Textarea
            id="marketing-form-description"
            rows={3}
            aria-invalid={Boolean(form.formState.errors.description)}
            {...form.register("description")}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.submitButtonLabel)}>
          <FieldLabel htmlFor="marketing-form-submit-label">
            Nhãn nút gửi *
          </FieldLabel>
          <Input
            id="marketing-form-submit-label"
            aria-invalid={Boolean(form.formState.errors.submitButtonLabel)}
            {...form.register("submitButtonLabel")}
          />
          <FieldError errors={[form.formState.errors.submitButtonLabel]} />
        </Field>
      </FieldGroup>
      <details className="rounded-lg border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Cài đặt nâng cao
        </summary>
        <MarketingFormCrmFields form={form} options={options} />
      </details>
      <section
        className="space-y-3 rounded-lg border p-4"
        aria-label="Trường dữ liệu biểu mẫu"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Trường dữ liệu</h3>
            <p className="text-sm text-muted-foreground">
              Form tạo lead cần ánh xạ tối thiểu Họ và tên và Số điện thoại.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFieldPickerOpen(true)}
          >
            <Plus aria-hidden="true" />
            Thêm trường
          </Button>
        </div>
        <FieldError
          errors={[
            form.formState.errors.fields as { message?: string } | undefined,
          ]}
        />
        <div className="space-y-3">
          {fields.fields.map((field, index) => (
            <FormFieldRow
              key={field.id}
              index={index}
              form={form}
              options={options}
              onMoveUp={() => fields.move(index, Math.max(0, index - 1))}
              onMoveDown={() =>
                fields.move(
                  index,
                  Math.min(fields.fields.length - 1, index + 1),
                )
              }
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
              <p className="text-sm text-muted-foreground">
                Copy iframe để dùng giao diện form đã custom và đổ dữ liệu về
                CRM.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => copyText(savedIframeCode)}
              aria-label="Copy iframe nhúng landing page"
            >
              <Copy aria-hidden="true" />
              Copy iframe
            </Button>
          </div>
          <code className="mt-3 block overflow-x-auto rounded bg-background px-3 py-2 text-xs text-muted-foreground">
            {savedIframeCode}
          </code>
        </section>
      )}
      <RuntimeCustomFieldsSection
        entityType="MARKETING_FORM"
        entityId={savedForm?.id}
        disabled={isPending}
        onChange={(values) =>
          form.setValue("customFieldValues", values, { shouldDirty: false })
        }
      />
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lưu..." : submitLabel}
        </Button>
      </DialogFooter>
      <AddFieldPickerDialog
        open={fieldPickerOpen}
        options={options}
        onOpenChange={setFieldPickerOpen}
        onAdd={(field) =>
          fields.append({ ...field, sortOrder: fields.fields.length })
        }
      />
    </form>
  );
}

/** Default question type for a Lead form field, from its catalog data type. */
function questionTypeForLeadField(field: string): MarketingFormFieldType {
  const dataType = getMarketingLeadField(field)?.dataType;
  if (dataType === "DATE") return "date";
  if (dataType === "NUMBER") return "number";
  if (dataType === "PHONE") return "phone";
  if (dataType === "TEXTAREA") return "textarea";
  return "text";
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
  {
    value: "full_name",
    label: "Tên khách hàng",
    defaultType: "text",
    required: true,
  },
  { value: "email", label: "Email", defaultType: "email" },
  {
    value: "phone",
    label: "Số điện thoại",
    defaultType: "phone",
    required: true,
  },
  { value: "date_of_birth", label: "Ngày sinh", defaultType: "date" },
  {
    value: "gender",
    label: "Giới tính",
    defaultType: "radio",
    options: ["Nam", "Nữ", "Khác"],
  },
  { value: "major_id", label: "Ngành quan tâm", defaultType: "select" },
  {
    value: "__education_level__",
    label: "Trình độ học vấn hiện tại",
    fieldKey: "education_level",
    placeholder: "Bằng tốt nghiệp",
    defaultType: "select",
    options: [
      "Đã tốt nghiệp THPT",
      "Đã tốt nghiệp Trung cấp",
      "Đã tốt nghiệp Cao đẳng",
      "Đã tốt nghiệp Đại học",
    ],
  },
  { value: "source_id", label: "Nguồn học viên", defaultType: "select" },
  {
    value: "institution_program_id",
    label: "Chương trình",
    defaultType: "select",
  },
  { value: "note", label: "Ghi chú", defaultType: "textarea" },
  { value: "__custom__", label: "Trường tùy chỉnh", defaultType: "text" },
];

const compactQuestionTypes: Array<{
  value: MarketingFormFieldType;
  label: string;
}> = [
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

const extendedQuestionTypes: Array<{
  value: MarketingFormFieldType;
  label: string;
}> = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "hidden", label: "Ẩn" },
  { value: "rating", label: "Star" },
  { value: "multi_select", label: "Chọn nhiều" },
];

function AddFieldPickerDialog({
  open,
  options,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  options?: MarketingFormFilterOptions;
  onOpenChange: (open: boolean) => void;
  onAdd: (field: MarketingFormField) => void;
}) {
  const [selectedField, setSelectedField] =
    useState<FieldPickerChoice["value"]>("__custom__");
  const [selectedType, setSelectedType] =
    useState<MarketingFormFieldType>("text");
  const [showMore, setShowMore] = useState(false);
  const choices = [
    ...crmFieldChoices,
    // Other Lead form fields supported by the API (education, address, relatives, admission...).
    ...(options?.leadFields ?? [])
      .filter((field) => !crmFieldChoices.some((choice) => choice.value === field))
      .map((field): FieldPickerChoice => ({
        value: field,
        label: marketingLeadFieldLabel(field),
        defaultType: questionTypeForLeadField(field),
      })),
  ];
  const selectedChoice =
    choices.find((field) => field.value === selectedField) ?? choices[0];
  const pickerOptions = choices.map((choice): GroupedFieldOption => {
    const group = choice.value.startsWith("__") ? undefined : getLeadFieldGroup(choice.value);
    return {
      value: choice.value,
      label: choice.label,
      groupKey: group?.id ?? "",
      groupLabel: group?.label ?? "",
    };
  });
  const typeChoices = showMore
    ? [...compactQuestionTypes, ...extendedQuestionTypes]
    : compactQuestionTypes;

  function handleSelectField(value: FieldPickerChoice["value"]) {
    const nextChoice = choices.find((field) => field.value === value);
    setSelectedField(value);
    if (nextChoice) setSelectedType(nextChoice.defaultType);
  }

  function addField() {
    const mappedField: MarketingFormLeadField | null =
      selectedChoice.value === "__custom__" ||
      selectedChoice.value === "__education_level__"
        ? null
        : selectedChoice.value;
    const key =
      mappedField ??
      selectedChoice.fieldKey ??
      `custom_${Date.now().toString(36)}`;
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
          <DialogDescription>
            Chọn trường dữ liệu và kiểu câu hỏi trước, sau đó mở từng field để
            chỉnh chi tiết nếu cần.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="field-picker-group">Trường trong</FieldLabel>
            <Select value="customer">
              <SelectTrigger id="field-picker-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Khách hàng</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="field-picker-crm-field">
              Chọn trường dữ liệu
            </FieldLabel>
            <GroupedFieldPicker
              id="field-picker-crm-field"
              value={selectedField}
              options={pickerOptions}
              onChange={(value) =>
                handleSelectField(value as FieldPickerChoice["value"])
              }
            />
          </Field>
          <Field>
            <FieldLabel>Kiểu câu hỏi của trường</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-3">
              {typeChoices.map((type) => (
                <label
                  key={type.value}
                  className="flex min-h-9 items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="field-question-type"
                    checked={selectedType === type.value}
                    onChange={() => setSelectedType(type.value)}
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </Field>
          {!showMore && (
            <Button
              type="button"
              variant="link"
              className="h-auto justify-start px-0"
              onClick={() => setShowMore(true)}
            >
              Xem thêm
            </Button>
          )}
          {(selectedField === "email" || selectedField === "phone") &&
            selectedType !== selectedChoice.defaultType && (
              <p role="alert" className="text-sm text-red-600">
                Nên chọn kiểu câu hỏi{" "}
                {selectedChoice.defaultType === "email" ? "Email" : "Phone"}{" "}
                trong phần chọn trường dữ liệu bên trên.
              </p>
            )}
        </div>
        <DialogFooter showCloseButton>
          <Button type="button" onClick={addField}>
            Cấu hình trường
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FiltersProps = {
  filters: MarketingFormFilters;
  options?: MarketingFormFilterOptions;
  onChange: (field: keyof MarketingFormFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: FiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc biểu mẫu</CardTitle>
        <CardDescription>
          Tìm theo tên, mã biểu mẫu hoặc chiến dịch liên kết.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(155px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="marketing-form-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="marketing-form-search"
                  className="pl-9"
                  placeholder="Nhập tên hoặc mã form"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="marketing-form-status"
              label="Trạng thái"
              value={filters.status}
              onChange={(value) => onChange("status", value)}
              options={(options?.statuses ?? []).map((status) => ({
                value: status,
                label: displayStatus(status),
              }))}
            />
            <FilterSelect
              id="marketing-form-platform"
              label="Nền tảng"
              value={filters.platform}
              onChange={(value) => onChange("platform", value)}
              options={(options?.platforms ?? []).map((platform) => ({
                value: platform,
                label: platform,
              }))}
            />
            <FilterSelect
              id="marketing-form-campaign"
              label="Chiến dịch"
              value={filters.campaignId}
              onChange={(value) => onChange("campaignId", value)}
              options={(options?.campaigns ?? []).map((campaign) => ({
                value: campaign.id,
                label: campaign.name,
              }))}
            />
            <AutoFilterActions
              snapshot={filters}
              onApply={onApply}
              onReset={onReset}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type ResultsProps = {
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
};

function Results(props: ResultsProps) {
  const {
    table,
    data,
    pagination,
    page,
    isLoading,
    isError,
    isFetching,
    onReload,
    onPrevious,
    onNext,
  } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Form & Survey</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} form/survey`
            : "Đang lấy dữ liệu Form & Survey..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải Form & Survey"
            description="Vui lòng thử lại để cập nhật danh sách form/survey."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải Form & Survey" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có Form & Survey phù hợp với bộ lọc"
            description="Tạo form/survey hoặc điều chỉnh bộ lọc để tiếp tục."
          />
        ) : (
          <SortableTable table={table} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <Pager
          page={page}
          pagination={pagination}
          isFetching={isFetching}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<MarketingFormItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Danh sách Form & Survey"
      className="min-w-7xl"
    />
  );
}

function SubmissionList({ formId }: { formId: string }) {
  const { selectedProgramId } = useInstitutionProgram();
  return (
    <ProgramSubmissionList
      key={`${selectedProgramId ?? "no-program"}:${formId}`}
      formId={formId}
    />
  );
}

function ProgramSubmissionList({ formId }: { formId: string }) {
  const auth = useAuth();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const canReview = canReviewMarketingFormSubmission(auth.user);
  const { selectedProgramId } = useInstitutionProgram();
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: marketingFormQueryKey(
      selectedProgramId,
      "submissions",
      formId,
      page,
      search,
      status,
    ),
    queryFn: ({ signal }) =>
      getMarketingFormSubmissions(
        formId,
        auth.accessToken!,
        { page, limit: submissionPageSize, search, status },
        selectedProgramId!,
        signal,
      ),
    enabled: Boolean(formId && auth.accessToken && selectedProgramId),
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  if (!selectedProgramId)
    return (
      <EmptyState
        title="Chưa chọn chương trình làm việc"
        description="Chọn chương trình để xem kết quả khảo sát."
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {auth.accessToken && (
        <MarketingFormReport
          key={`${selectedProgramId}:${formId}`}
          formId={formId}
          programId={selectedProgramId}
          accessToken={auth.accessToken}
          permissions={auth.user?.permissions ?? []}
        />
      )}
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`submission-search-${formId}`}>
            Tên/điện thoại Lead hoặc mã phản hồi
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`submission-search-${formId}`}
              value={draftSearch}
              maxLength={150}
              onChange={(event) => setDraftSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setSearch(draftSearch.trim());
                  setPage(1);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch(draftSearch.trim());
                setPage(1);
              }}
            >
              Tìm
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`submission-status-${formId}`}>
            Trạng thái phản hồi
          </FieldLabel>
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger
              id={`submission-status-${formId}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {Object.entries(submissionStatusLabels).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <SubmissionResults
        data={data}
        isError={query.isError}
        isLoading={query.isLoading}
        onReload={() => query.refetch()}
        onReview={canReview ? setReviewId : undefined}
      />
      {reviewId && canReview && (
        <MarketingFormSubmissionReview
          key={reviewId}
          formId={formId}
          submissionId={reviewId}
          programId={selectedProgramId}
          onClose={() => setReviewId(null)}
        />
      )}
      {pagination && pagination.totalPages > 1 && (
        <Pager
          page={page}
          pagination={pagination}
          isFetching={query.isFetching}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      )}
    </div>
  );
}

function SubmissionResults({
  data,
  isError,
  isLoading,
  onReload,
  onReview,
}: {
  data: MarketingFormSubmission[];
  isError: boolean;
  isLoading: boolean;
  onReload: () => void;
  onReview?: (id: string) => void;
}) {
  if (isError)
    return (
      <ErrorState
        title="Không thể tải phản hồi"
        description="Vui lòng thử lại để cập nhật dữ liệu gửi vào."
        onReload={onReload}
      />
    );
  if (isLoading) return <TableLoadingState label="Đang tải phản hồi" />;
  if (!data.length)
    return (
      <EmptyState
        title="Chưa có dữ liệu gửi vào"
        description="Phản hồi từ form công khai hoặc webhook sẽ hiển thị tại đây."
      />
    );
  return <SubmissionTable data={data} onReview={onReview} />;
}

function SubmissionTable({
  data,
  onReview,
}: {
  data: MarketingFormSubmission[];
  onReview?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-240">
        <StaticTableHeader
          columns={[
            { label: "Thời gian" },
            { label: "Trạng thái" },
            { label: "Lead" },
            { label: "Nguồn" },
            { label: "Lỗi" },
            { label: "Câu trả lời khảo sát" },
          ]}
          className="bg-muted/55"
        />
        <TableBody>
          {data.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>{formatDate(submission.createdAt)}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    submission.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {displaySubmissionStatus(submission.status)}
                </Badge>
                {submission.status === "needs_review" && onReview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => onReview(submission.id)}
                  >
                    Xử lý trùng
                  </Button>
                )}
              </TableCell>
              <TableCell>
                {submission.lead ? (
                  <div>
                    <div>{submission.lead.fullName}</div>
                    <div className="text-sm text-muted-foreground">
                      {submission.lead.phone}
                    </div>
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>{submission.source ?? "-"}</TableCell>
              <TableCell className="max-w-64 whitespace-normal text-destructive">
                {submission.errorMessage ?? "-"}
              </TableCell>
              <TableCell className="max-w-96 whitespace-normal">
                <p className="mb-2 text-xs text-muted-foreground">
                  {submission.configurationSnapshot
                    ? "Theo cấu hình tại thời điểm gửi"
                    : "Phản hồi cũ — không có snapshot cấu hình"}
                </p>
                <dl className="flex flex-col gap-2">
                  {describeMarketingFormAnswers(
                    submission.answers ?? submission.normalizedPayload,
                    submission.configurationSnapshot,
                  ).map((item) => (
                    <div key={item.fieldKey}>
                      <dt className="font-medium">{item.label}</dt>
                      <dd>{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type PagerProps = {
  page: number;
  pagination:
    | MarketingFormListResponse["pagination"]
    | MarketingFormSubmissionListResponse["pagination"];
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function Pager({
  page,
  pagination,
  isFetching,
  onPrevious,
  onNext,
}: PagerProps) {
  return (
    <TablePagination
      page={page}
      pagination={pagination}
      isFetching={isFetching}
      className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"
      labels={{ previous: "Trang trước", next: "Trang sau" }}
      onPrevious={onPrevious}
      onNext={onNext}
    />
  );
}

function MutationError({ error }: { error: Error }) {
  const details =
    error instanceof ApiError &&
    error.details &&
    typeof error.details === "object"
      ? (error.details as {
          issues?: Array<{ path?: Array<string | number>; message?: string }>;
        })
      : null;
  const issues = Array.isArray(details?.issues)
    ? [
        ...new Map(
          details.issues.map((issue) => [
            JSON.stringify([issue.path, issue.message]),
            issue,
          ]),
        ).entries(),
      ]
    : [];
  return (
    <div
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p>
        {error instanceof ApiError
          ? error.message
          : "Không thể thực hiện thao tác. Vui lòng thử lại."}
      </p>
      {issues.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {issues.map(([key, issue]) => (
            <li key={key}>
              {issue.path?.[0] === "fields" && typeof issue.path[1] === "number"
                ? `Câu hỏi ${issue.path[1] + 1}: `
                : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MutationSuccess({ message }: { message: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200"
    >
      <CheckCircle2 className="size-4" aria-hidden="true" />
      {message}
    </p>
  );
}

type EditMarketingFormDialogProps = {
  editingForm: MarketingFormItem | null;
  setDialog: import("react").ActionDispatch<[next: DialogState]>;
  optionsQuery: import("@tanstack/react-query").UseQueryResult<
    NoInfer<MarketingFormFilterOptions>,
    Error
  >;
  updateMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string; slug?: string },
    Error,
    MarketingFormInput,
    unknown
  >;
};

function EditMarketingFormDialog({
  editingForm,
  setDialog,
  optionsQuery,
  updateMutation,
}: EditMarketingFormDialogProps) {
  return (
    <Dialog
      open={Boolean(editingForm)}
      onOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa Form & Survey</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin, trường dữ liệu, giao diện và trạng thái xuất
            bản.
          </DialogDescription>
        </DialogHeader>
        {editingForm && (
          <MarketingFormEditor
            savedForm={editingForm}
            defaultValues={toEditorValues(editingForm)}
            options={optionsQuery.data}
            error={updateMutation.error}
            isPending={updateMutation.isPending}
            submitLabel="Lưu thay đổi"
            onSubmit={(input) => updateMutation.mutate(input)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type MarketingQuestionCardProps = {
  field: import("react-hook-form").FieldArrayWithId<
    MarketingFormInput,
    "fields",
    "id"
  >;
  reorder: {
    instructionsId: string;
    announcement: string;
    handleProps: (id: string) => {
      disabled: boolean;
      draggable: boolean;
      "aria-describedby": string;
      "aria-keyshortcuts": string;
      onDragStart(event: import("react").DragEvent<HTMLButtonElement>): void;
      onDragEnd: () => void;
      onKeyDown(event: import("react").KeyboardEvent<HTMLButtonElement>): void;
    };
    itemProps: (id: string) => {
      "data-reorder-over": boolean;
      onDragOver(event: import("react").DragEvent<HTMLElement>): void;
      onDrop(event: import("react").DragEvent<HTMLElement>): void;
    };
    move: (sourceId: string | null, targetId: string) => boolean;
  };
  index: number;
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
  fields: import("react-hook-form").UseFieldArrayReturn<
    MarketingFormInput,
    "fields",
    "id"
  >;
  editingIndex: number | null;
  setEditingIndex: import("react").Dispatch<
    import("react").SetStateAction<number | null>
  >;
  removeField: (index: number) => void;
  isPending: boolean;
  moveField: (index: number, direction: -1 | 1) => void;
  options: MarketingFormFilterOptions | undefined;
};

function MarketingQuestionCard({
  field,
  reorder,
  index,
  form,
  fields,
  editingIndex,
  setEditingIndex,
  removeField,
  isPending,
  moveField,
  options,
}: MarketingQuestionCardProps) {
  return (
    <section
      key={field.id}
      {...reorder.itemProps(field.id)}
      aria-label={`Câu hỏi ${index + 1}`}
      className="min-w-0 rounded-lg border bg-background px-3 py-4 shadow-xs data-[reorder-over=true]:outline-2 data-[reorder-over=true]:outline-ring sm:px-6"
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {(() => {
            const currentField = form.watch(`fields.${index}`);
            const currentFields = fields.fields.map((item, fieldIndex) =>
              form.watch(`fields.${fieldIndex}`),
            );
            const previewValues = Object.fromEntries(
              currentFields.map((item) => [
                item.fieldKey,
                item.defaultValue ?? "",
              ]),
            );
            const effectiveOptions = getEffectiveFieldOptions(
              currentField,
              currentFields,
              previewValues,
            );
            return (
              <>
                <h3 className="text-base font-semibold">
                  {index + 1}. {currentField.label || "Câu hỏi"}{" "}
                  {currentField.isRequired && <span>*</span>}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {optionFieldTypes.has(currentField.fieldType) && (
                    <Badge variant="outline">Có cấu hình lựa chọn</Badge>
                  )}
                  {getFieldDependency(currentField.validationRules) && (
                    <Badge variant="secondary">Có câu hỏi liên quan</Badge>
                  )}
                </div>
                <PreviewField field={currentField} options={effectiveOptions} />
              </>
            );
          })()}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1 text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="cursor-grab active:cursor-grabbing"
            {...reorder.handleProps(field.id)}
            aria-label={`Kéo câu hỏi ${index + 1} để đổi thứ tự`}
          >
            <GripVertical data-icon="inline-start" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={editingIndex === index ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setEditingIndex(editingIndex === index ? null : index)
            }
            aria-label={`Cấu hình câu hỏi ${index + 1}`}
          >
            <Pencil aria-hidden="true" />
            Cấu hình
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={fields.fields.length >= 100}
            onClick={() => {
              fields.insert(
                index + 1,
                duplicateMarketingFormField(
                  form.getValues(`fields.${index}`),
                  form.getValues("fields"),
                ),
              );
              setEditingIndex(index + 1);
            }}
            aria-label={`Nhân bản câu hỏi ${index + 1}`}
          >
            <Copy data-icon="inline-start" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={fields.fields.length <= 1}
            onClick={() => removeField(index)}
            aria-label={`Xóa câu hỏi ${index + 1}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending || index === 0}
            onClick={() => moveField(index, -1)}
            aria-label={`Đưa câu hỏi ${index + 1} lên`}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending || index === fields.fields.length - 1}
            onClick={() => moveField(index, 1)}
            aria-label={`Đưa câu hỏi ${index + 1} xuống`}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      </div>
      {editingIndex === index && (
        <div className="mt-4">
          <FormFieldRow
            index={index}
            form={form}
            options={options}
            onMoveUp={() => moveField(index, -1)}
            onMoveDown={() => moveField(index, 1)}
            onRemove={() => removeField(index)}
            canMoveUp={index > 0}
            canMoveDown={index < fields.fields.length - 1}
            canRemove={fields.fields.length > 1}
            defaultOpen
          />
        </div>
      )}
    </section>
  );
}

type useProgramMarketingFormQueriesProps = {
  selectedProgramId: string | null;
  page: number;
  sortBy: MarketingFormSortField;
  sortOrder: "asc" | "desc";
  filters: MarketingFormFilters;
};

function useProgramMarketingFormQueries(
  {
    selectedProgramId,
    page,
    sortBy,
    sortOrder,
    filters,
  }: useProgramMarketingFormQueriesProps,
  accessToken: string | null,
) {
  const listQuery = useQuery({
    queryKey: marketingFormQueryKey(
      selectedProgramId,
      "list",
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters,
    ),
    queryFn: ({ signal }) =>
      getMarketingForms(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        accessToken!,
        selectedProgramId!,
        signal,
      ),
    enabled: Boolean(accessToken && selectedProgramId),
  });
  const optionsQuery = useQuery({
    queryKey: marketingFormQueryKey(selectedProgramId, "options"),
    queryFn: ({ signal }) =>
      getMarketingFormFilterOptions(accessToken!, selectedProgramId!, signal),
    enabled: Boolean(accessToken && selectedProgramId),
  });
  return { listQuery, optionsQuery };
}

type DeleteMarketingFormDialogProps = {
  deletingForm: MarketingFormItem | null;
  setDialog: import("react").ActionDispatch<[next: DialogState]>;
  deleteMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    void,
    unknown
  >;
};

function DeleteMarketingFormDialog({
  deletingForm,
  setDialog,
  deleteMutation,
}: DeleteMarketingFormDialogProps) {
  return (
    <Dialog
      open={Boolean(deletingForm)}
      onOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa biểu mẫu</DialogTitle>
          <DialogDescription>
            {deletingForm
              ? `Bạn có chắc muốn xóa biểu mẫu "${deletingForm.name}" cùng cấu hình trường và submission?`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {deleteMutation.isError && (
          <MutationError error={deleteMutation.error} />
        )}
        <DialogFooter showCloseButton>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "Đang xóa..." : "Xóa biểu mẫu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MarketingBuilderTabContentProps = {
  activeTab: string;
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
  options: MarketingFormFilterOptions | undefined;
  publicUrl: string;
  iframeCode: string;
  embedSnippet: string;
  formItem: MarketingFormItem;
  fields: import("react-hook-form").UseFieldArrayReturn<
    MarketingFormInput,
    "fields",
    "id"
  >;
  isPending: boolean;
  setActiveTab: import("react").Dispatch<
    import("react").SetStateAction<string>
  >;
  watchedTitle: string;
  hasUnsavedChanges: boolean;
  reorder: {
    instructionsId: string;
    announcement: string;
    handleProps: (id: string) => {
      disabled: boolean;
      draggable: boolean;
      "aria-describedby": string;
      "aria-keyshortcuts": string;
      onDragStart(event: import("react").DragEvent<HTMLButtonElement>): void;
      onDragEnd: () => void;
      onKeyDown(event: import("react").KeyboardEvent<HTMLButtonElement>): void;
    };
    itemProps: (id: string) => {
      "data-reorder-over": boolean;
      onDragOver(event: import("react").DragEvent<HTMLElement>): void;
      onDrop(event: import("react").DragEvent<HTMLElement>): void;
    };
    move: (sourceId: string | null, targetId: string) => boolean;
  };
  editingIndex: number | null;
  setEditingIndex: import("react").Dispatch<
    import("react").SetStateAction<number | null>
  >;
  removeField: (index: number) => void;
  moveField: (index: number, direction: -1 | 1) => void;
  setFieldPickerOpen: import("react").Dispatch<
    import("react").SetStateAction<boolean>
  >;
  setSettingsOpen: import("react").Dispatch<
    import("react").SetStateAction<boolean>
  >;
  setPreviewInput: import("react").Dispatch<
    import("react").SetStateAction<MarketingFormInput | null>
  >;
};

function MarketingBuilderTabContent({
  activeTab,
  form,
  options,
  publicUrl,
  iframeCode,
  embedSnippet,
  formItem,
  fields,
  isPending,
  setActiveTab,
  watchedTitle,
  hasUnsavedChanges,
  reorder,
  editingIndex,
  setEditingIndex,
  removeField,
  moveField,
  setFieldPickerOpen,
  setSettingsOpen,
  setPreviewInput,
}: MarketingBuilderTabContentProps) {
  if (activeTab === "crm")
    return (
      <MarketingFormCrmPanel
        form={form}
        targets={options?.leadFields ?? []}
      />
    );
  if (activeTab === "processing")
    return <MarketingFormProcessingPanel form={form} />;
  if (activeTab === "share")
    return (
      <MarketingFormSharePanel
        publicUrl={publicUrl}
        iframeCode={iframeCode}
        embedSnippet={embedSnippet}
        onCopy={copyText}
      />
    );
  if (activeTab === "appearance")
    return (
      <TemplateSharePanel
        formItem={formItem}
        form={form}
        options={options}
        fields={fields.fields.map((field, index) =>
          form.watch(`fields.${index}`),
        )}
        publicUrl={publicUrl}
        iframeCode={iframeCode}
        isPending={isPending}
        onBackSettings={() => setActiveTab("questions")}
      />
    );
  if (activeTab === "results")
    return (
      <div className="p-5">
        <SubmissionList formId={formItem.id} />
      </div>
    );
  return (
    <div className="grid min-h-125 min-w-0 gap-4 bg-muted/20 p-3 sm:gap-6 sm:p-5 xl:grid-cols-[minmax(0,1fr)_76px_120px]">
      <main className="mx-auto min-w-0 w-full max-w-3xl">
        <div className="border bg-background">
          <div
            className="h-3"
            style={{ backgroundColor: form.watch("primaryColor") || "#673ab7" }}
          />
          <div className="px-8 py-4 text-center">{watchedTitle}</div>
        </div>
        <FieldError
          errors={[
            form.formState.errors.fields as { message?: string } | undefined,
          ]}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Bấm vào nút Cấu hình trên từng câu hỏi để chỉnh label, mapping CRM,
          validation và các lựa chọn của field.
        </p>
        <MarketingFormLayoutPanel form={form} disabled={isPending} />
        {hasUnsavedChanges && (
          <div
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            Có thay đổi chưa lưu. Bấm Lưu cấu hình trước khi thoát hoặc tải lại
            để giữ ngành quan tâm, trình độ học vấn và các lựa chọn liên quan.
          </div>
        )}
        <p
          id={reorder.instructionsId}
          className="mt-3 text-sm text-muted-foreground"
        >
          Kéo nút tay nắm lên câu hỏi khác để đổi thứ tự. Bàn phím: Alt + ↑/↓
          trên tay nắm, hoặc dùng nút lên/xuống. Vị trí trang/nhóm không thay
          đổi.
        </p>
        <p
          role="status"
          aria-live="polite"
          className="min-h-16 text-sm text-muted-foreground sm:min-h-6"
        >
          {reorder.announcement}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {fields.fields.map((field, index) => (
            <MarketingQuestionCard
              key={field.id}
              field={field}
              reorder={reorder}
              index={index}
              form={form}
              fields={fields}
              editingIndex={editingIndex}
              setEditingIndex={setEditingIndex}
              removeField={removeField}
              isPending={isPending}
              moveField={moveField}
              options={options}
            />
          ))}
        </div>
      </main>

      <aside className="h-fit rounded-lg border bg-background p-2 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full flex-col gap-1 py-3"
          onClick={() => setFieldPickerOpen(true)}
        >
          <Plus aria-hidden="true" />
          Câu hỏi
        </Button>
      </aside>

      <aside className="space-y-3">
        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !hasUnsavedChanges}
        >
          {isPending ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
        <Button
          type="button"
          className="w-full"
          disabled={isPending}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings aria-hidden="true" />
          Thiết lập
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setPreviewInput(structuredClone(form.getValues()))}
        >
          <Eye data-icon="inline-start" aria-hidden="true" />
          Điền thử
        </Button>
        <Button
          type="button"
          variant="default"
          className="w-full bg-orange-600 hover:bg-orange-700"
          onClick={() => iframeCode && copyText(iframeCode)}
          disabled={!iframeCode}
        >
          <HelpCircle aria-hidden="true" />
          Copy iframe
        </Button>
      </aside>
    </div>
  );
}

function MarketingFormSubmissionsDialog({
  submissionsForm,
  setDialog,
}: {
  submissionsForm: MarketingFormItem | null;
  setDialog: import("react").ActionDispatch<[next: DialogState]>;
}) {
  return (
    <Dialog
      open={Boolean(submissionsForm)}
      onOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Dữ liệu gửi vào</DialogTitle>
          <DialogDescription>
            {submissionsForm
              ? `Submission gần nhất của "${submissionsForm.name}".`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {submissionsForm && <SubmissionList formId={submissionsForm.id} />}
      </DialogContent>
    </Dialog>
  );
}

function FormSuccessSettings({
  form,
}: {
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
}) {
  return (
    <div className="grid gap-5">
      <Field>
        <FieldLabel>Thông báo thành công</FieldLabel>
        <Input
          value={getSettingValue(
            form,
            "successSettings",
            "message",
            "Thông tin của Anh/Chị đã được gửi đến nhà trường.",
          )}
          onChange={(event) =>
            setSettingValue(
              form,
              "successSettings",
              "message",
              event.target.value,
            )
          }
        />
      </Field>
      <Field>
        <FieldLabel>Link chuyển hướng nếu có</FieldLabel>
        <Input
          value={getSettingValue(form, "successSettings", "redirectUrl", "")}
          onChange={(event) =>
            setSettingValue(
              form,
              "successSettings",
              "redirectUrl",
              event.target.value,
            )
          }
        />
      </Field>
      <Field>
        <FieldLabel>Gửi email</FieldLabel>
        <Select
          value={getSettingValue(form, "successSettings", "emailMode", "none")}
          onValueChange={(value) =>
            setSettingValue(form, "successSettings", "emailMode", value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Không gửi email</SelectItem>
            <SelectItem value="confirmation">
              Cho phép gửi email xác nhận thông tin
            </SelectItem>
            <SelectItem value="automation">
              Cho phép gửi vào automation
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Thông báo cho sale</FieldLabel>
        <Input
          value={getSettingValue(
            form,
            "successSettings",
            "saleNotifyTitle",
            "",
          )}
          onChange={(event) =>
            setSettingValue(
              form,
              "successSettings",
              "saleNotifyTitle",
              event.target.value,
            )
          }
          placeholder="Tiêu đề..."
        />
      </Field>
      <Textarea
        rows={3}
        value={getSettingValue(
          form,
          "successSettings",
          "saleNotifyContent",
          "",
        )}
        onChange={(event) =>
          setSettingValue(
            form,
            "successSettings",
            "saleNotifyContent",
            event.target.value,
          )
        }
        placeholder="Nội dung..."
      />
    </div>
  );
}

type FormDuplicateSettingsProps = {
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
  duplicateChoices: MarketingFormField[];
  selectedDuplicateFields: Set<string>;
  duplicateFields: string[];
};

function FormDuplicateSettings({
  form,
  duplicateChoices,
  selectedDuplicateFields,
  duplicateFields,
}: FormDuplicateSettingsProps) {
  return (
    <div className="grid gap-5">
      <MarketingFormSubmissionSettings form={form} />
      {(!getSettingValue<string>(
        form,
        "duplicateSettings",
        "submissionMode",
        "legacy",
      ) ||
        getSettingValue<string>(
          form,
          "duplicateSettings",
          "submissionMode",
          "legacy",
        ) === "legacy") && (
        <>
          <Field>
            <FieldLabel>Check trùng theo khảo sát</FieldLabel>
            <div className="flex min-h-10 flex-wrap gap-2 rounded border px-2 py-1">
              {duplicateChoices.map((field) => {
                const key =
                  field.crmMappingField ?? field.leadField ?? field.fieldKey;
                return (
                  <Button
                    key={field.fieldKey}
                    type="button"
                    size="sm"
                    variant={
                      selectedDuplicateFields.has(key) ? "default" : "outline"
                    }
                    onClick={() =>
                      setSettingValue(
                        form,
                        "duplicateSettings",
                        "fields",
                        selectedDuplicateFields.has(key)
                          ? duplicateFields.filter((item) => item !== key)
                          : [...duplicateFields, key],
                      )
                    }
                  >
                    {field.label}
                  </Button>
                );
              })}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={getSettingValue(
                form,
                "duplicateSettings",
                "disableDuplicateCheck",
                false,
              )}
              onCheckedChange={(checked) =>
                setSettingValue(
                  form,
                  "duplicateSettings",
                  "disableDuplicateCheck",
                  Boolean(checked),
                )
              }
            />
            Không check trùng dữ liệu
          </label>
          <Field>
            <FieldLabel>Hành vi khi trùng</FieldLabel>
            <Select
              value={getSettingValue(
                form,
                "duplicateSettings",
                "action",
                "update",
              )}
              onValueChange={(value) =>
                setSettingValue(form, "duplicateSettings", "action", value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="update">
                  Ghi/cập nhật Lead theo trường liên kết
                </SelectItem>
                <SelectItem value="skip">
                  Không ghi vào Lead khi trùng
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={getSettingValue(
                form,
                "duplicateSettings",
                "oneResponseOnly",
                false,
              )}
              onCheckedChange={(checked) =>
                setSettingValue(
                  form,
                  "duplicateSettings",
                  "oneResponseOnly",
                  Boolean(checked),
                )
              }
            />
            Chỉ trả lời một lần
          </label>
          <Field>
            <FieldLabel>Thông báo khi đã gửi rồi</FieldLabel>
            <Input
              value={getSettingValue(
                form,
                "duplicateSettings",
                "oneResponseMessage",
                "Thông tin của Anh/Chị đã được gửi đến nhà trường!",
              )}
              onChange={(event) =>
                setSettingValue(
                  form,
                  "duplicateSettings",
                  "oneResponseMessage",
                  event.target.value,
                )
              }
            />
          </Field>
        </>
      )}
    </div>
  );
}

function FormAdvancedSettings({
  form,
}: {
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
}) {
  return (
    <div className="grid gap-5">
      <Field>
        <FieldLabel>Link API xử lý</FieldLabel>
        <Input
          value={getSettingValue(form, "advancedSettings", "handlerUrl", "")}
          onChange={(event) =>
            setSettingValue(
              form,
              "advancedSettings",
              "handlerUrl",
              event.target.value,
            )
          }
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={getSettingValue(
            form,
            "advancedSettings",
            "disableAutofill",
            false,
          )}
          onCheckedChange={(checked) =>
            setSettingValue(
              form,
              "advancedSettings",
              "disableAutofill",
              Boolean(checked),
            )
          }
        />
        Tắt chế độ tự động điền dữ liệu
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={getSettingValue(
            form,
            "advancedSettings",
            "allowSaleAssignment",
            false,
          )}
          onCheckedChange={(checked) =>
            setSettingValue(
              form,
              "advancedSettings",
              "allowSaleAssignment",
              Boolean(checked),
            )
          }
        />
        Cho phép gán sale vào form và bản ghi liên quan
      </label>
      <Field>
        <FieldLabel>Nguồn form</FieldLabel>
        <Input
          value={getSettingValue(form, "advancedSettings", "source", "")}
          onChange={(event) =>
            setSettingValue(
              form,
              "advancedSettings",
              "source",
              event.target.value,
            )
          }
          placeholder="chat website"
        />
      </Field>
      <Field>
        <FieldLabel>Giới hạn thực hiện khảo sát</FieldLabel>
        <Select
          value={getSettingValue(form, "advancedSettings", "limitMode", "none")}
          onValueChange={(value) =>
            setSettingValue(form, "advancedSettings", "limitMode", value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Không giới hạn</SelectItem>
            <SelectItem value="minutes">Giới hạn theo phút</SelectItem>
            <SelectItem value="submissions">
              Giới hạn theo số lần submit
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function MarketingFormCrmFields({
  form,
  options,
}: {
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
  options: MarketingFormFilterOptions | undefined;
}) {
  return (
    <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field data-invalid={Boolean(form.formState.errors.slug)}>
        <FieldLabel htmlFor="marketing-form-slug">Slug public</FieldLabel>
        <Input
          id="marketing-form-slug"
          aria-invalid={Boolean(form.formState.errors.slug)}
          placeholder="dang-ky-tu-van"
          {...form.register("slug")}
        />
        <FieldError errors={[form.formState.errors.slug]} />
      </Field>
      <Field data-invalid={Boolean(form.formState.errors.platform)}>
        <FieldLabel htmlFor="marketing-form-platform-input">
          Nền tảng
        </FieldLabel>
        <Input
          id="marketing-form-platform-input"
          aria-invalid={Boolean(form.formState.errors.platform)}
          placeholder="website, facebook..."
          {...form.register("platform")}
        />
        <FieldError errors={[form.formState.errors.platform]} />
      </Field>
      <SourceGroupField
        id="marketing-form-source-group"
        value={form.watch("advancedSettings")?.sourceGroup}
        onChange={(value) => setSettingValue(form, "advancedSettings", "sourceGroup", value)}
        error={form.formState.errors.advancedSettings?.sourceGroup?.message as string | undefined}
      />
      <Field data-invalid={Boolean(form.formState.errors.formCode)}>
        <FieldLabel htmlFor="marketing-form-code">Mã biểu mẫu</FieldLabel>
        <Input
          id="marketing-form-code"
          aria-invalid={Boolean(form.formState.errors.formCode)}
          placeholder="WEB-LEAD-2026"
          {...form.register("formCode")}
        />
        <FieldError errors={[form.formState.errors.formCode]} />
      </Field>
      <Field data-invalid={Boolean(form.formState.errors.campaignId)}>
        <FieldLabel htmlFor="marketing-form-linked-campaign">
          Chiến dịch liên kết
        </FieldLabel>
        <Select
          value={form.watch("campaignId") || "__empty__"}
          onValueChange={(value) =>
            form.setValue("campaignId", value === "__empty__" ? "" : value, {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger
            id="marketing-form-linked-campaign"
            className="w-full"
            aria-invalid={Boolean(form.formState.errors.campaignId)}
          >
            <SelectValue placeholder="Chọn chiến dịch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">Chọn chiến dịch</SelectItem>
            {(options?.campaigns ?? []).map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={[form.formState.errors.campaignId]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-form-template">
          Template giao diện
        </FieldLabel>
        <Select
          value={form.watch("templateId") || "__empty__"}
          onValueChange={(value) =>
            form.setValue("templateId", value === "__empty__" ? "" : value)
          }
        >
          <SelectTrigger id="marketing-form-template" className="w-full">
            <SelectValue placeholder="Chọn template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">Template mặc định</SelectItem>
            {(options?.templates ?? []).map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <label
        htmlFor="marketing-form-webhook-enabled"
        className="flex min-h-11 items-center gap-2 text-sm"
      >
        <Checkbox
          id="marketing-form-webhook-enabled"
          checked={form.watch("webhookEnabled")}
          onCheckedChange={(checked) =>
            form.setValue("webhookEnabled", Boolean(checked))
          }
        />
        Bật webhook URL
      </label>
      <Field>
        <FieldLabel htmlFor="marketing-form-primary-color">
          Màu chính
        </FieldLabel>
        <Input
          id="marketing-form-primary-color"
          type="color"
          className="h-11 p-1"
          {...form.register("primaryColor")}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-form-background-color">
          Màu nền
        </FieldLabel>
        <Input
          id="marketing-form-background-color"
          type="color"
          className="h-11 p-1"
          {...form.register("backgroundColor")}
        />
      </Field>
    </FieldGroup>
  );
}

type MarketingFormSecretDialogProps = {
  dialog:
    | { type: "create" }
    | { type: "edit"; form: MarketingFormItem }
    | { type: "delete"; form: MarketingFormItem }
    | { type: "submissions"; form: MarketingFormItem }
    | { type: "secret"; form: MarketingFormItem; secret: string }
    | null;
  setDialog: import("react").ActionDispatch<[next: DialogState]>;
};

function MarketingFormSecretDialog({
  dialog,
  setDialog,
}: MarketingFormSecretDialogProps) {
  return (
    <Dialog
      open={dialog?.type === "secret"}
      onOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook secret</DialogTitle>
          <DialogDescription>
            Secret chỉ hiển thị một lần. Hãy lưu lại để cấu hình nguồn gửi
            webhook.
          </DialogDescription>
        </DialogHeader>
        {dialog?.type === "secret" && (
          <div className="space-y-3">
            <Input readOnly value={dialog.secret} />
            <Button
              type="button"
              variant="outline"
              onClick={() => copyText(dialog.secret)}
            >
              <Copy aria-hidden="true" />
              Copy secret
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormBasicSettings({
  form,
}: {
  form: import("react-hook-form").UseFormReturn<MarketingFormInput>;
}) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel>Tiêu đề</FieldLabel>
        <Input
          value={form.watch("name")}
          onChange={(event) =>
            form.setValue("name", event.target.value, {
              shouldDirty: true,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Heading</FieldLabel>
        <Input
          value={form.watch("title")}
          onChange={(event) =>
            form.setValue("title", event.target.value, {
              shouldDirty: true,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Mô tả ngắn</FieldLabel>
        <Textarea
          rows={5}
          value={form.watch("description")}
          onChange={(event) =>
            form.setValue("description", event.target.value, {
              shouldDirty: true,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Note ghi chú</FieldLabel>
        <Input
          value={getSettingValue(form, "displaySettings", "note", "")}
          onChange={(event) =>
            setSettingValue(form, "displaySettings", "note", event.target.value)
          }
          placeholder="Nhập nội dung ghi chú ngắn"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={getSettingValue(
            form,
            "displaySettings",
            "useCaptcha",
            false,
          )}
          onCheckedChange={(checked) =>
            setSettingValue(
              form,
              "displaySettings",
              "useCaptcha",
              Boolean(checked),
            )
          }
        />
        Sử dụng Captcha
      </label>
      <Field>
        <FieldLabel>Điểm captcha tối thiểu</FieldLabel>
        <Input
          type="number"
          step="0.1"
          value={getSettingValue(
            form,
            "displaySettings",
            "captchaScore",
            "0.6",
          )}
          onChange={(event) =>
            setSettingValue(
              form,
              "displaySettings",
              "captchaScore",
              event.target.value,
            )
          }
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={getSettingValue(
            form,
            "displaySettings",
            "showConfirmBeforeSubmit",
            true,
          )}
          onCheckedChange={(checked) =>
            setSettingValue(
              form,
              "displaySettings",
              "showConfirmBeforeSubmit",
              Boolean(checked),
            )
          }
        />
        Hiện màn hình xác nhận trước khi gửi
      </label>
      <Field>
        <FieldLabel>Hiển thị số thứ tự</FieldLabel>
        <Select
          value={getSettingValue(form, "displaySettings", "numbering", "auto")}
          onValueChange={(value) =>
            setSettingValue(form, "displaySettings", "numbering", value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Số thứ tự tự động</SelectItem>
            <SelectItem value="manual">Số thứ tự nhập vào</SelectItem>
            <SelectItem value="none">Không hiện</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Text nút thực hiện khảo sát</FieldLabel>
        <Input
          value={form.watch("submitButtonLabel")}
          onChange={(event) =>
            form.setValue("submitButtonLabel", event.target.value, {
              shouldDirty: true,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel>Text nút tiếp tục sang trang khác</FieldLabel>
        <Input
          value={getSettingValue(
            form,
            "displaySettings",
            "nextButtonText",
            "Về trang chủ",
          )}
          onChange={(event) =>
            setSettingValue(
              form,
              "displaySettings",
              "nextButtonText",
              event.target.value,
            )
          }
        />
      </Field>
      <Field>
        <FieldLabel>Ngôn ngữ form</FieldLabel>
        <Select
          value={getSettingValue(form, "displaySettings", "language", "vi")}
          onValueChange={(value) =>
            setSettingValue(form, "displaySettings", "language", value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vi">Tiếng Việt</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
