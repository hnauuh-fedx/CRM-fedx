import { useMemo, useRef, useState, type FormEvent } from "react";
import { useFieldArray, useForm, type Path } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CirclePause, CirclePlay, LockKeyhole, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
import {
  createCustomFieldGroup,
  createCustomField,
  getCustomFieldGroups,
  getCustomFields,
  setCustomFieldStatus,
  updateCustomField,
} from "@/services/custom-field.service";
import {
  customFieldDataTypes,
  type CustomFieldDataType,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldGroupDefinition,
  type CustomFieldGroupInput,
  type CustomFieldInput,
  type CustomFieldOption,
  type CustomFieldScopeType,
  type CustomFieldStatusAction,
  type CustomFieldUpdateInput,
} from "../custom-field.types";
import type { SystemFormFieldGroup } from "../form-field-catalog.types";

const allFilterValue = "__all__";
type FieldSourceFilter = typeof allFilterValue | "system" | "custom";
const optionFieldTypes = new Set<CustomFieldDataType>(["SELECT", "MULTI_SELECT"]);
const fileLimitOptions = [1, 5, 10] as const;

const dataTypeLabels: Record<CustomFieldDataType, string> = {
  TEXT: "Một dòng",
  TEXTAREA: "Nhiều dòng",
  NUMBER: "Số",
  DATE: "Ngày",
  DATETIME: "Ngày giờ",
  BOOLEAN: "Có / Không",
  SELECT: "Chọn một",
  MULTI_SELECT: "Chọn nhiều",
  EMAIL: "Email",
  PHONE: "Số điện thoại",
  PROVINCE: "Tỉnh thành",
  FILE: "File",
};

const formSchema = z.object({
  groupId: z.uuid("Vui lòng chọn nhóm trường dữ liệu."),
  fieldLabel: z.string().trim().min(1, "Vui lòng nhập tên trường.").max(255, "Tên trường tối đa 255 ký tự."),
  fieldKey: z.string().trim().min(1, "Vui lòng nhập mã trường.").max(150, "Mã trường tối đa 150 ký tự.").regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, "Mã trường phải bắt đầu bằng chữ và chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới."),
  description: z.string().trim().max(2000, "Mô tả tối đa 2.000 ký tự."),
  scopeType: z.enum(["GLOBAL", "PROGRAM"]),
  programId: z.string(),
  fieldType: z.enum(customFieldDataTypes),
  maxFiles: z.union([z.literal(1), z.literal(5), z.literal(10)]),
  isRequired: z.boolean(),
  isSearchable: z.boolean(),
  isFilterable: z.boolean(),
  isSensitive: z.boolean(),
  displayOrder: z.number().int("Thứ tự phải là số nguyên.").min(0, "Thứ tự không được âm."),
  options: z.array(z.object({
    code: z.string().trim().min(1, "Vui lòng nhập mã lựa chọn.").max(100, "Mã lựa chọn tối đa 100 ký tự.").regex(/^[A-Za-z0-9_.-]+$/, "Mã lựa chọn chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới."),
    label: z.string().trim().min(1, "Vui lòng nhập tên lựa chọn.").max(255, "Tên lựa chọn tối đa 255 ký tự."),
    isActive: z.boolean(),
  })).max(100, "Mỗi trường có tối đa 100 lựa chọn."),
}).superRefine((values, context) => {
  if (values.scopeType === "PROGRAM" && !values.programId) {
    context.addIssue({ code: "custom", path: ["programId"], message: "Chưa có chương trình đang làm việc để áp dụng trường này." });
  }
  if (isOptionFieldType(values.fieldType) && values.options.length === 0) {
    context.addIssue({ code: "custom", path: ["options"], message: "Trường lựa chọn cần ít nhất một giá trị." });
  }
  if (values.isSensitive && (values.isSearchable || values.isFilterable)) {
    context.addIssue({ code: "custom", path: ["isSensitive"], message: "Trường nhạy cảm không thể bật tìm kiếm hoặc lọc." });
  }
  if (values.fieldType === "FILE" && (values.isSearchable || values.isFilterable)) {
    context.addIssue({ code: "custom", path: ["fieldType"], message: "Trường file không hỗ trợ tìm kiếm hoặc lọc." });
  }
  const optionCodes = new Set<string>();
  values.options.forEach((option, index) => {
    const code = option.code.trim();
    if (optionCodes.has(code)) {
      context.addIssue({ code: "custom", path: ["options", index, "code"], message: "Mã lựa chọn không được trùng." });
    }
    optionCodes.add(code);
  });
});

type CustomFieldFormValues = z.input<typeof formSchema>;
type DialogState =
  | { type: "create" }
  | { type: "edit"; field: CustomFieldDefinition }
  | { type: "archive"; field: CustomFieldDefinition }
  | null;

export type CustomFieldsManagementConfig = {
  entityType: CustomFieldEntityType;
  eyebrow: string;
  title: string;
  description: string;
  subjectLabel: string;
  systemFieldGroups?: SystemFormFieldGroup[];
  customFieldGroupId?: string;
};

export function CustomFieldsManagementPage({ config }: { config: CustomFieldsManagementConfig }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { programs, selectedProgramId } = useInstitutionProgram();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [search, setSearch] = useState("");
  const [fieldSourceFilter, setFieldSourceFilter] = useState<FieldSourceFilter>(allFilterValue);
  const [programFilter, setProgramFilter] = useState(selectedProgramId ?? allFilterValue);
  const [successMessage, setSuccessMessage] = useState("");

  const canCreate = auth.can("custom_field.create");
  const canUpdate = auth.can("custom_field.update");
  const canArchive = auth.can("custom_field.archive");
  const canManageOptions = auth.can("custom_field.manage_options");
  const canEditSensitive = auth.can("custom_field.edit_sensitive");
  const canManageGroups = auth.can("custom_field.manage_groups") || canCreate;

  const query = useQuery({
    queryKey: ["custom-fields", config.entityType],
    queryFn: () => getCustomFields({ entityType: config.entityType }, auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });
  const groupQuery = useQuery({
    queryKey: ["custom-field-groups", config.entityType],
    queryFn: () => getCustomFieldGroups(config.entityType, auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });

  const programById = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs]);
  const visibleCustomFields = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (fieldSourceFilter === "system") return [];
    return (query.data ?? []).filter((field) => {
      if (programFilter !== allFilterValue && field.scopeType === "PROGRAM" && field.programId !== programFilter) return false;
      if (!keyword) return true;
      return field.fieldLabel.toLocaleLowerCase("vi").includes(keyword) || field.fieldKey.toLocaleLowerCase("vi").includes(keyword);
    });
  }, [fieldSourceFilter, programFilter, query.data, search]);

  const visibleGroups = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    const catalogByKey = new Map((config.systemFieldGroups ?? []).map((group) => [group.id, group]));
    const databaseGroups = groupQuery.data ?? [];
    if (databaseGroups.length === 0) {
      return (config.systemFieldGroups ?? []).flatMap((group) => {
        const fields = fieldSourceFilter === "custom" ? [] : group.fields.filter((item) => !keyword || [item.label, item.key].some((value) => value.toLocaleLowerCase("vi").includes(keyword)));
        return fields.length > 0 ? [{
        id: group.id,
        groupKey: group.id,
        label: group.label,
        description: group.description,
        isSystem: true,
        fields,
        customFields: [],
      }] : [];
      });
    }
    return databaseGroups.flatMap((group) => {
      const catalog = catalogByKey.get(group.groupKey);
      const result = {
      id: group.id,
      groupKey: group.groupKey,
      label: group.groupLabel,
      description: group.description ?? catalog?.description ?? "Nhóm trường dữ liệu tùy chỉnh.",
      isSystem: group.isSystem,
      fields: fieldSourceFilter === "custom" ? [] : (catalog?.fields ?? []).filter((item) => {
        if (!keyword) return true;
        return [item.label, item.key, item.optionSource, item.note]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("vi").includes(keyword));
      }),
      customFields: visibleCustomFields.filter((field) => field.groupId === group.id),
      };
      return result.fields.length > 0 || result.customFields.length > 0 ? [result] : [];
    });
  }, [config.systemFieldGroups, fieldSourceFilter, groupQuery.data, search, visibleCustomFields]);

  const visibleSystemFieldCount = visibleGroups.reduce((total, group) => total + group.fields.length, 0);

  function notify(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(""), 4_000);
  }

  async function refreshFields() {
    await queryClient.invalidateQueries({ queryKey: ["custom-fields", config.entityType] });
    await queryClient.invalidateQueries({ queryKey: ["custom-field-groups", config.entityType] });
    await queryClient.invalidateQueries({ queryKey: ["leads", "custom-fields"] });
  }

  const createMutation = useMutation({
    mutationFn: (input: CustomFieldInput) => createCustomField(input, auth.accessToken!),
    onSuccess: async () => {
      await refreshFields();
      setDialog(null);
      notify("Đã thêm trường dữ liệu.");
    },
  });
  const createGroupMutation = useMutation({
    mutationFn: (input: CustomFieldGroupInput) => createCustomFieldGroup(input, auth.accessToken!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-field-groups", config.entityType] });
      notify("Đã thêm nhóm trường dữ liệu.");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomFieldUpdateInput }) => updateCustomField(id, input, auth.accessToken!),
    onSuccess: async () => {
      await refreshFields();
      setDialog(null);
      notify("Đã cập nhật trường dữ liệu.");
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomFieldStatusAction }) => setCustomFieldStatus(id, status, auth.accessToken!),
    onSuccess: async (_data, variables) => {
      await refreshFields();
      setDialog(null);
      notify(variables.status === "archive" ? "Đã lưu trữ trường dữ liệu." : variables.status === "activate" ? "Đã kích hoạt trường dữ liệu." : "Đã tạm ngừng trường dữ liệu.");
    },
  });

  const editingField = dialog?.type === "edit" ? dialog.field : null;
  const archivingField = dialog?.type === "archive" ? dialog.field : null;
  const formError = createMutation.error ?? updateMutation.error ?? createGroupMutation.error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        scopeLabel={config.subjectLabel}
        actions={canCreate ? <Button type="button" disabled={groupQuery.isLoading || groupQuery.isError} onClick={() => setDialog({ type: "create" })}><Plus data-icon="inline-start" />Thêm trường</Button> : undefined}
      />

      {successMessage && (
        <Alert className="fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100%-2rem))] shadow-lg" role="status">
          <AlertTitle>Thành công</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc trường dữ liệu</CardTitle>
          <CardDescription>Tìm trong toàn bộ cấu trúc form và thu hẹp theo nguồn khai báo trường.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_18rem]">
            <Field>
              <FieldLabel htmlFor="custom-field-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="custom-field-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc mã trường" />
              </div>
            </Field>
            <Field>
              <FieldLabel>Nguồn trường</FieldLabel>
              <Select value={fieldSourceFilter} onValueChange={(value) => setFieldSourceFilter(value as FieldSourceFilter)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value={allFilterValue}>Tất cả</SelectItem><SelectItem value="system">Trường hệ thống</SelectItem><SelectItem value="custom">Trường tùy chỉnh</SelectItem></SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Chương trình</FieldLabel>
              <Select value={programFilter} onValueChange={setProgramFilter} disabled={fieldSourceFilter === "system"}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value={allFilterValue}>Tất cả chương trình</SelectItem>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.institutionName} - {program.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cấu trúc form lead</CardTitle>
          <CardDescription>{visibleSystemFieldCount} trường hệ thống và {visibleCustomFields.length} trường tùy chỉnh phù hợp với bộ lọc hiện tại.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading && <div className="border-t px-6 py-4"><TableLoadingState label="Đang tải trường tùy chỉnh" /></div>}
          {query.isError && <div className="border-t px-6 py-4"><ErrorState title="Không thể tải trường tùy chỉnh" description="Các trường hệ thống vẫn hiển thị; vui lòng thử lại để tải phần tùy chỉnh." onReload={() => query.refetch()} /></div>}
          {groupQuery.isError && <div className="border-t px-6 py-4"><ErrorState title="Không thể tải nhóm trường" description="Các trường hệ thống vẫn hiển thị nhưng chưa thể thêm trường mới." onReload={() => groupQuery.refetch()} /></div>}
          {visibleGroups.length === 0 ? (
            !query.isLoading && !query.isError && <EmptyState title="Chưa có trường dữ liệu phù hợp" description="Thêm trường mới hoặc thay đổi bộ lọc để xem dữ liệu." />
          ) : (
            <div>
              {visibleGroups.map((group) => (
                <section key={group.id} className="border-t first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 bg-muted/40 px-6 py-4">
                    <div>
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                    </div>
                    <div className="flex items-center gap-2"><Badge variant={group.isSystem ? "secondary" : "outline"}>{group.isSystem ? "Nhóm hệ thống" : "Nhóm tùy chỉnh"}</Badge><Badge variant="outline">{group.fields.length + group.customFields.length} trường</Badge></div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1180px]">
                      <TableHeader><TableRow><TableHead>Trường dữ liệu</TableHead><TableHead>Kiểu</TableHead><TableHead>Mã trường</TableHead><TableHead>Phạm vi chương trình</TableHead><TableHead>Cấu hình</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {group.fields.map((item) => (
                          <TableRow key={`system-${item.key}`}>
                            <TableCell><div className="flex min-w-52 flex-col items-start gap-1"><span className="font-medium">{item.label}</span><Badge variant="secondary">Hệ thống</Badge></div></TableCell>
                            <TableCell>{dataTypeLabels[item.dataType]}</TableCell>
                            <TableCell><code className="text-xs text-muted-foreground">{item.key}</code></TableCell>
                            <TableCell><Badge variant="secondary">Toàn hệ thống</Badge></TableCell>
                            <TableCell><div className="flex min-w-48 flex-wrap gap-1">{item.isRequired && <Badge variant="outline">Bắt buộc</Badge>}{item.isSensitive && <Badge variant="destructive">Nhạy cảm</Badge>}{item.optionSource && <Badge variant="outline">Nguồn: {item.optionSource}</Badge>}{item.note && <span className="w-full text-xs text-muted-foreground">{item.note}</span>}{!item.isRequired && !item.isSensitive && !item.optionSource && !item.note && <span className="text-muted-foreground">Mặc định</span>}</div></TableCell>
                            <TableCell><Badge>Đang dùng</Badge></TableCell>
                            <TableCell><div className="flex justify-end"><Tooltip><TooltipTrigger asChild><span className="inline-flex size-8 items-center justify-center text-muted-foreground" aria-label="Trường hệ thống được khóa"><LockKeyhole className="size-4" aria-hidden="true" /></span></TooltipTrigger><TooltipContent>Trường hệ thống được khai báo trong form và cơ sở dữ liệu.</TooltipContent></Tooltip></div></TableCell>
                          </TableRow>
                        ))}
                        {group.customFields.map((field) => {
                          const program = field.programId ? programById.get(field.programId) : null;
                          return (
                            <TableRow key={field.id}>
                              <TableCell><div className="flex min-w-52 flex-col items-start gap-1"><span className="font-medium">{field.fieldLabel}</span><Badge variant="outline">Tùy chỉnh</Badge>{field.description && <span className="max-w-md text-xs text-muted-foreground">{field.description}</span>}</div></TableCell>
                              <TableCell><div className="flex flex-col gap-1"><span>{dataTypeLabels[field.fieldType]}</span>{isOptionFieldType(field.fieldType) && <span className="text-xs text-muted-foreground">{field.options?.filter((option) => option.isActive).length ?? 0} lựa chọn</span>}</div></TableCell>
                              <TableCell><code className="text-xs text-muted-foreground">{field.fieldKey}</code></TableCell>
                              <TableCell>{field.scopeType === "GLOBAL" ? <Badge variant="secondary">Toàn hệ thống</Badge> : <div className="flex min-w-48 flex-col items-start gap-1"><Badge variant="outline">Theo chương trình</Badge><span className="text-xs text-muted-foreground">{program ? `${program.institutionName} - ${program.name}` : "Chương trình không còn khả dụng"}</span></div>}</TableCell>
                              <TableCell><div className="flex min-w-40 flex-wrap gap-1">{field.isRequired && <Badge variant="outline">Bắt buộc</Badge>}{field.isSearchable && <Badge variant="outline">Tìm kiếm</Badge>}{field.isFilterable && <Badge variant="outline">Lọc</Badge>}{field.isSensitive && <Badge variant="destructive">Nhạy cảm</Badge>}{field.fieldType === "FILE" && <Badge variant="outline">Tối đa {toFileLimit(field.validationRules?.maxFiles)} ảnh</Badge>}{!field.isRequired && !field.isSearchable && !field.isFilterable && !field.isSensitive && field.fieldType !== "FILE" && <span className="text-muted-foreground">Mặc định</span>}</div></TableCell>
                              <TableCell><Badge variant={field.isActive ? "default" : "secondary"}>{field.isActive ? "Đang dùng" : "Tạm ngừng"}</Badge></TableCell>
                              <TableCell><div className="flex justify-end gap-2">{canUpdate && (!field.isSensitive || canEditSensitive) && <IconAction label="Chỉnh sửa trường" onClick={() => setDialog({ type: "edit", field })}><Pencil /></IconAction>}{canArchive && <IconAction label={field.isActive ? "Tạm ngừng trường" : "Kích hoạt trường"} onClick={() => statusMutation.mutate({ id: field.id, status: field.isActive ? "deactivate" : "activate" })} disabled={statusMutation.isPending}>{field.isActive ? <CirclePause /> : <CirclePlay />}</IconAction>}{canArchive && <IconAction label="Lưu trữ trường" variant="destructive" onClick={() => setDialog({ type: "archive", field })}><Archive /></IconAction>}</div></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog?.type === "create" || dialog?.type === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingField ? "Cập nhật trường dữ liệu" : "Thêm trường dữ liệu"}</DialogTitle>
            <DialogDescription>{editingField ? "Điều chỉnh cách trường hiển thị và được sử dụng trên form." : `Tạo trường bổ sung cho ${config.subjectLabel.toLocaleLowerCase("vi")}.`}</DialogDescription>
          </DialogHeader>
          {(dialog?.type === "create" || editingField) && (
            <CustomFieldForm
              key={editingField?.id ?? "create"}
              entityType={config.entityType}
              initialField={editingField}
              groups={groupQuery.data ?? []}
              programs={programs}
              selectedProgramId={selectedProgramId}
              capabilities={{ canManageOptions, canEditSensitive, canManageGroups }}
              isPending={createMutation.isPending || updateMutation.isPending || createGroupMutation.isPending}
              error={formError}
              onCancel={() => setDialog(null)}
              onCreate={(input) => createMutation.mutate(input)}
              onUpdate={(id, input) => updateMutation.mutate({ id, input })}
              onCreateGroup={(input) => createGroupMutation.mutateAsync(input)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "archive"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lưu trữ trường dữ liệu</DialogTitle><DialogDescription>Trường “{archivingField?.fieldLabel ?? ""}” sẽ không còn xuất hiện trên form mới. Giá trị đã lưu vẫn được giữ để truy vết.</DialogDescription></DialogHeader>
          {statusMutation.error && <MutationError error={statusMutation.error} />}
          <DialogFooter showCloseButton><Button type="button" variant="destructive" disabled={statusMutation.isPending || !archivingField} onClick={() => archivingField && statusMutation.mutate({ id: archivingField.id, status: "archive" })}><Archive data-icon="inline-start" />{statusMutation.isPending ? "Đang lưu trữ..." : "Lưu trữ trường"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomFieldForm({ entityType, initialField, groups, programs, selectedProgramId, capabilities, isPending, error, onCancel, onCreate, onUpdate, onCreateGroup }: {
  entityType: CustomFieldEntityType;
  initialField: CustomFieldDefinition | null;
  groups: CustomFieldGroupDefinition[];
  programs: Array<{ id: string; name: string; institutionName: string }>;
  selectedProgramId: string | null;
  capabilities: { canManageOptions: boolean; canEditSensitive: boolean; canManageGroups: boolean };
  isPending: boolean;
  error: Error | null;
  onCancel: () => void;
  onCreate: (input: CustomFieldInput) => void;
  onUpdate: (id: string, input: CustomFieldUpdateInput) => void;
  onCreateGroup: (input: CustomFieldGroupInput) => Promise<CustomFieldGroupDefinition>;
}) {
  const { canManageOptions, canEditSensitive, canManageGroups } = capabilities;
  const fieldKeyEdited = useRef(Boolean(initialField));
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [newGroupKey, setNewGroupKey] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const form = useForm<CustomFieldFormValues>({ defaultValues: toFormValues(initialField, selectedProgramId, groups) });
  const optionArray = useFieldArray({ control: form.control, name: "options" });
  const fieldType = form.watch("fieldType");
  const scopeType = form.watch("scopeType");
  const isSensitive = form.watch("isSensitive");
  const labelRegistration = form.register("fieldLabel");
  const optionType = isOptionFieldType(fieldType);
  const metadataOnlyType = fieldType === "FILE";
  const typeLockedForOptions = Boolean(initialField && isOptionFieldType(initialField.fieldType) && !canManageOptions);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    form.clearErrors();
    const result = formSchema.safeParse(form.getValues());
    if (!result.success) {
      for (const issue of result.error.issues) {
        form.setError(issue.path.join(".") as Path<CustomFieldFormValues>, { type: "validate", message: issue.message });
      }
      return;
    }
    const values = result.data;
    const options = toOptions(values.options);
    const validationRules = values.fieldType === "FILE" ? { maxFiles: values.maxFiles } : undefined;
    if (initialField) {
      onUpdate(initialField.id, {
        groupId: values.groupId,
        fieldLabel: values.fieldLabel,
        description: values.description || undefined,
        fieldType: values.fieldType,
        isRequired: values.isRequired,
        isSearchable: values.isSensitive || metadataOnlyType ? false : values.isSearchable,
        isFilterable: values.isSensitive || metadataOnlyType ? false : values.isFilterable,
        isSensitive: values.isSensitive,
        displayOrder: values.displayOrder,
        ...(canManageOptions ? { options: optionType ? options : [] } : {}),
        validationRules,
      });
      return;
    }
    onCreate({
      groupId: values.groupId,
      fieldKey: values.fieldKey,
      fieldLabel: values.fieldLabel,
      description: values.description || undefined,
      entityType,
      scopeType: values.scopeType,
      programId: values.scopeType === "PROGRAM" ? values.programId : undefined,
      fieldType: values.fieldType,
      isRequired: values.isRequired,
      isSearchable: values.isSensitive || metadataOnlyType ? false : values.isSearchable,
      isFilterable: values.isSensitive || metadataOnlyType ? false : values.isFilterable,
      isSensitive: values.isSensitive,
      displayOrder: values.displayOrder,
      options: optionType ? options : undefined,
      validationRules,
    });
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {error && <MutationError error={error} />}
        <Field data-invalid={Boolean(form.formState.errors.groupId)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Nhóm trường dữ liệu *</FieldLabel>
            {canManageGroups && <Button type="button" variant="outline" size="sm" onClick={() => setCreatingGroup((value) => !value)}><Plus data-icon="inline-start" />{creatingGroup ? "Đóng tạo nhóm" : "Tạo nhóm mới"}</Button>}
          </div>
          <Select value={form.watch("groupId") || undefined} onValueChange={(value) => form.setValue("groupId", value, { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(form.formState.errors.groupId)}><SelectValue placeholder="Chọn nhóm hiển thị" /></SelectTrigger>
            <SelectContent><SelectGroup>{groups.map((group) => group.isActive ? <SelectItem key={group.id} value={group.id}>{group.groupLabel}{group.isSystem ? " · Hệ thống" : ""}</SelectItem> : null)}</SelectGroup></SelectContent>
          </Select>
          <FieldDescription>Trường tùy chỉnh sẽ hiển thị trong nhóm đã chọn nhưng vẫn lưu giá trị ở bảng custom_field_values.</FieldDescription>
          <FieldError errors={[form.formState.errors.groupId]} />
        </Field>
        {creatingGroup && (
          <div className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="new-custom-field-group-label">Tên nhóm *</FieldLabel>
              <Input id="new-custom-field-group-label" value={newGroupLabel} onChange={(event) => { const label = event.target.value; setNewGroupLabel(label); setNewGroupKey(toFieldKey(label).replace(/^field_/, "group_")); }} placeholder="VD: Thông tin công việc" />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-custom-field-group-key">Mã nhóm *</FieldLabel>
              <Input id="new-custom-field-group-key" value={newGroupKey} onChange={(event) => setNewGroupKey(event.target.value)} placeholder="thong_tin_cong_viec" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="new-custom-field-group-description">Mô tả</FieldLabel>
              <Textarea id="new-custom-field-group-description" rows={2} value={newGroupDescription} onChange={(event) => setNewGroupDescription(event.target.value)} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="button" disabled={isPending || !newGroupLabel.trim() || !newGroupKey.trim()} onClick={async () => {
                try {
                  const group = await onCreateGroup({ entityType, groupKey: newGroupKey.trim(), groupLabel: newGroupLabel.trim(), description: newGroupDescription.trim() || undefined, displayOrder: Math.max(0, ...groups.map((item) => item.displayOrder)) + 10 });
                  form.setValue("groupId", group.id, { shouldDirty: true, shouldValidate: true });
                  setCreatingGroup(false);
                } catch {
                  // MutationError displays the API response above the form.
                }
              }}>{isPending ? "Đang tạo..." : "Tạo và chọn nhóm"}</Button>
            </div>
          </div>
        )}
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.fieldLabel)}>
            <FieldLabel htmlFor="custom-field-label">Tên trường *</FieldLabel>
            <Input id="custom-field-label" {...labelRegistration} aria-invalid={Boolean(form.formState.errors.fieldLabel)} onChange={(event) => { void labelRegistration.onChange(event); if (!fieldKeyEdited.current) form.setValue("fieldKey", toFieldKey(event.target.value), { shouldDirty: true }); }} placeholder="VD: Kênh tư vấn ưu tiên" />
            <FieldError errors={[form.formState.errors.fieldLabel]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.fieldKey)} data-disabled={Boolean(initialField)}>
            <FieldLabel htmlFor="custom-field-key">Mã trường *</FieldLabel>
            <Input id="custom-field-key" {...form.register("fieldKey", { onChange: () => { fieldKeyEdited.current = true; } })} disabled={Boolean(initialField)} aria-invalid={Boolean(form.formState.errors.fieldKey)} placeholder="kenh_tu_van_uu_tien" />
            <FieldDescription>Mã dùng cho tích hợp và không thể đổi sau khi tạo.</FieldDescription>
            <FieldError errors={[form.formState.errors.fieldKey]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.fieldType)} data-disabled={typeLockedForOptions}>
            <FieldLabel>Kiểu dữ liệu *</FieldLabel>
            <Select disabled={typeLockedForOptions} value={fieldType} onValueChange={(value) => { const nextType = value as CustomFieldDataType; form.setValue("fieldType", nextType, { shouldDirty: true }); if (isOptionFieldType(nextType) && optionArray.fields.length === 0) optionArray.append({ code: "", label: "", isActive: true }); if (nextType === "FILE") { form.setValue("isSearchable", false, { shouldDirty: true }); form.setValue("isFilterable", false, { shouldDirty: true }); } }}>
              <SelectTrigger className="w-full" aria-invalid={Boolean(form.formState.errors.fieldType)}><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{customFieldDataTypes.map((type) => <SelectItem key={type} value={type} disabled={isOptionFieldType(type) && !canManageOptions}>{dataTypeLabels[type]}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            {!canManageOptions && <FieldDescription>Bạn cần quyền quản lý lựa chọn để dùng kiểu chọn một hoặc chọn nhiều.</FieldDescription>}
            <FieldError errors={[form.formState.errors.fieldType]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.displayOrder)}>
            <FieldLabel htmlFor="custom-field-order">Thứ tự hiển thị</FieldLabel>
            <Input id="custom-field-order" type="number" min={0} {...form.register("displayOrder", { valueAsNumber: true })} aria-invalid={Boolean(form.formState.errors.displayOrder)} />
            <FieldError errors={[form.formState.errors.displayOrder]} />
          </Field>
          {fieldType === "FILE" && (
            <Field data-invalid={Boolean(form.formState.errors.maxFiles)}>
              <FieldLabel>Số ảnh tối đa *</FieldLabel>
              <Select value={String(form.watch("maxFiles"))} onValueChange={(value) => form.setValue("maxFiles", Number(value) as 1 | 5 | 10, { shouldDirty: true, shouldValidate: true })}>
                <SelectTrigger className="w-full" aria-invalid={Boolean(form.formState.errors.maxFiles)}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{fileLimitOptions.map((limit) => <SelectItem key={limit} value={String(limit)}>{limit} ảnh</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldDescription>Người nhập chỉ có thể chọn tối đa số ảnh đã cấu hình.</FieldDescription>
              <FieldError errors={[form.formState.errors.maxFiles]} />
            </Field>
          )}
          <Field data-invalid={Boolean(form.formState.errors.scopeType)} data-disabled={Boolean(initialField)}>
            <FieldLabel>Phạm vi áp dụng *</FieldLabel>
            <Select disabled={Boolean(initialField)} value={scopeType} onValueChange={(value) => form.setValue("scopeType", value as CustomFieldScopeType, { shouldDirty: true })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="GLOBAL">Toàn hệ thống</SelectItem><SelectItem value="PROGRAM">Theo chương trình</SelectItem></SelectGroup></SelectContent>
            </Select>
            <FieldDescription>Phạm vi không thể đổi sau khi tạo.</FieldDescription>
          </Field>
          {scopeType === "PROGRAM" && (
            <Field data-invalid={Boolean(form.formState.errors.programId)} data-disabled>
              <FieldLabel htmlFor="custom-field-program">Chương trình đang làm việc *</FieldLabel>
              <Input
                id="custom-field-program"
                value={formatProgramName(programs.find((program) => program.id === form.watch("programId")))}
                disabled
                aria-invalid={Boolean(form.formState.errors.programId)}
                placeholder="Chưa có chương trình đang làm việc"
              />
              <FieldDescription>Trường sẽ được áp dụng cho chương trình đang làm việc và không thể đổi sau khi tạo.</FieldDescription>
              <FieldError errors={[form.formState.errors.programId]} />
            </Field>
          )}
        </FieldGroup>

        <Field data-invalid={Boolean(form.formState.errors.description)}>
          <FieldLabel htmlFor="custom-field-description">Mô tả</FieldLabel>
          <Textarea id="custom-field-description" rows={3} {...form.register("description")} aria-invalid={Boolean(form.formState.errors.description)} placeholder="Thông tin hỗ trợ người nhập dữ liệu" />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>

        <FieldSet>
          <FieldLegend>Thuộc tính trường</FieldLegend>
          <FieldGroup data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
            <CheckboxField id="custom-field-required" label="Bắt buộc nhập" description="Không cho phép bỏ trống khi lưu." checked={form.watch("isRequired")} onChange={(checked) => form.setValue("isRequired", checked, { shouldDirty: true })} />
            <CheckboxField id="custom-field-searchable" label="Cho phép tìm kiếm" description="Dùng giá trị trường trong chức năng tìm kiếm." checked={form.watch("isSearchable")} disabled={isSensitive || metadataOnlyType} onChange={(checked) => form.setValue("isSearchable", checked, { shouldDirty: true })} />
            <CheckboxField id="custom-field-filterable" label="Cho phép lọc" description="Có thể dùng trường làm điều kiện lọc." checked={form.watch("isFilterable")} disabled={isSensitive || metadataOnlyType} onChange={(checked) => form.setValue("isFilterable", checked, { shouldDirty: true })} />
            <CheckboxField id="custom-field-sensitive" label="Dữ liệu nhạy cảm" description="Yêu cầu quyền riêng để xem và chỉnh sửa." checked={isSensitive} disabled={!canEditSensitive} onChange={(checked) => { form.setValue("isSensitive", checked, { shouldDirty: true }); if (checked) { form.setValue("isSearchable", false); form.setValue("isFilterable", false); } }} />
          </FieldGroup>
          <FieldError errors={[form.formState.errors.isSensitive]} />
        </FieldSet>

        {optionType && (
          <FieldSet>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><FieldLegend className="mb-1">Danh sách lựa chọn</FieldLegend><FieldDescription>Giá trị được nhập trực tiếp, không gọi API ngoài.</FieldDescription></div>
              {canManageOptions && <Button type="button" variant="outline" size="sm" onClick={() => optionArray.append({ code: "", label: "", isActive: true })}><Plus data-icon="inline-start" />Thêm lựa chọn</Button>}
            </div>
            <FieldGroup className="gap-3">
              {optionArray.fields.map((option, index) => (
                <div key={option.id} className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                  <Field data-invalid={Boolean(form.formState.errors.options?.[index]?.label)} data-disabled={!canManageOptions}>
                    <FieldLabel htmlFor={`custom-field-option-label-${index}`}>Tên lựa chọn *</FieldLabel>
                    <Input id={`custom-field-option-label-${index}`} {...form.register(`options.${index}.label`)} disabled={!canManageOptions} aria-invalid={Boolean(form.formState.errors.options?.[index]?.label)} onBlur={(event) => { if (!form.getValues(`options.${index}.code`)) form.setValue(`options.${index}.code`, toOptionCode(event.target.value), { shouldDirty: true }); }} />
                    <FieldError errors={[form.formState.errors.options?.[index]?.label]} />
                  </Field>
                  <Field data-invalid={Boolean(form.formState.errors.options?.[index]?.code)} data-disabled={!canManageOptions}>
                    <FieldLabel htmlFor={`custom-field-option-code-${index}`}>Mã lưu *</FieldLabel>
                    <Input id={`custom-field-option-code-${index}`} {...form.register(`options.${index}.code`)} disabled={!canManageOptions} aria-invalid={Boolean(form.formState.errors.options?.[index]?.code)} />
                    <FieldError errors={[form.formState.errors.options?.[index]?.code]} />
                  </Field>
                  <CheckboxField id={`custom-field-option-active-${index}`} label="Đang dùng" checked={form.watch(`options.${index}.isActive`)} disabled={!canManageOptions} onChange={(checked) => form.setValue(`options.${index}.isActive`, checked, { shouldDirty: true })} />
                  {canManageOptions && <div className="pt-7"><IconAction label="Xóa lựa chọn" variant="destructive" onClick={() => optionArray.remove(index)} disabled={optionArray.fields.length === 1}><Trash2 /></IconAction></div>}
                </div>
              ))}
              <FieldError errors={[form.formState.errors.options]} />
            </FieldGroup>
          </FieldSet>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>Hủy</Button>
          <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : initialField ? "Lưu thay đổi" : "Thêm trường"}</Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

function CheckboxField({ id, label, description, checked, disabled = false, onChange }: { id: string; label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />
      <div className="flex flex-col gap-1"><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <FieldDescription>{description}</FieldDescription>}</div>
    </Field>
  );
}

function IconAction({ label, children, variant = "ghost", disabled = false, onClick }: { label: string; children: React.ReactNode; variant?: "ghost" | "destructive"; disabled?: boolean; onClick: () => void }) {
  return (
    <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" variant={variant} disabled={disabled} aria-label={label} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  );
}

function MutationError({ error }: { error: Error }) {
  return <Alert variant="destructive"><AlertTitle>Không thể lưu thay đổi</AlertTitle><AlertDescription>{error instanceof ApiError ? error.message : "Đã xảy ra lỗi. Vui lòng thử lại."}</AlertDescription></Alert>;
}

function toFormValues(field: CustomFieldDefinition | null, selectedProgramId: string | null, groups: CustomFieldGroupDefinition[]): CustomFieldFormValues {
  return field ? {
    groupId: field.groupId,
    fieldLabel: field.fieldLabel,
    fieldKey: field.fieldKey,
    description: field.description ?? "",
    scopeType: field.scopeType,
    programId: field.programId ?? "",
    fieldType: field.fieldType,
    maxFiles: toFileLimit(field.validationRules?.maxFiles),
    isRequired: field.isRequired,
    isSearchable: field.isSearchable,
    isFilterable: field.isFilterable,
    isSensitive: field.isSensitive,
    displayOrder: field.displayOrder,
    options: (field.options ?? []).map((option) => ({ code: option.code, label: option.label, isActive: option.isActive })),
  } : {
    groupId: groups.find((group) => group.groupKey === "additional")?.id ?? groups[0]?.id ?? "",
    fieldLabel: "",
    fieldKey: "",
    description: "",
    scopeType: "PROGRAM",
    programId: selectedProgramId ?? "",
    fieldType: "TEXT",
    maxFiles: 1,
    isRequired: false,
    isSearchable: false,
    isFilterable: false,
    isSensitive: false,
    displayOrder: 0,
    options: [],
  };
}

function toFileLimit(value: unknown): 1 | 5 | 10 {
  return value === 5 || value === 10 ? value : 1;
}

function toOptions(options: CustomFieldFormValues["options"]): CustomFieldOption[] {
  return options.map((option, index) => ({ code: option.code.trim(), label: option.label.trim(), isActive: option.isActive, displayOrder: index }));
}

function formatProgramName(program?: { name: string; institutionName: string }) {
  return program ? `${program.institutionName} - ${program.name}` : "";
}

function isOptionFieldType(type: CustomFieldDataType) {
  return optionFieldTypes.has(type);
}

function toFieldKey(value: string) {
  const key = normalizeIdentifier(value).toLowerCase();
  return /^[a-z]/.test(key) ? key : key ? `field_${key}` : "";
}

function toOptionCode(value: string) {
  return normalizeIdentifier(value).toUpperCase();
}

function normalizeIdentifier(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
