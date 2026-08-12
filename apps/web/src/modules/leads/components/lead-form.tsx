import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type HTMLInputTypeAttribute, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { useAuth } from "@/modules/auth/auth-context";
import { getLeadCustomFieldDefinitions, getLeadCustomFields } from "@/services/lead.service";
import { DynamicFieldRenderer } from "./dynamic-field-renderer";
import { leadFormSchema } from "../lead.schema";
import type { LeadActionOptions, LeadCustomField, LeadCustomFieldValue, LeadFormInput } from "../lead.types";

const statusOptions = [
  { value: "new", label: "Mới" },
  { value: "contacted", label: "Đã liên hệ" },
  { value: "qualified", label: "Tiềm năng" },
  { value: "converted", label: "Đã chuyển đổi" },
  { value: "lost", label: "Không phù hợp" },
];
const genderOptions = [
  { value: "__empty__", label: "Chưa xác định" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];
const progressFallbackColors = ["#64748B", "#2563EB", "#0EA5E9", "#8B5CF6", "#10B981", "#16A34A", "#F59E0B", "#DC2626"];
const compactNumberFormatter = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

type LeadFormProps = {
  defaultValues: LeadFormInput;
  options: Pick<LeadActionOptions, "sources" | "stages" | "institutionPrograms" | "majors" | "admissionStatuses" | "tags">;
  leadId?: string;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: LeadFormInput) => void;
};

export function LeadForm({ defaultValues, options, leadId, submitLabel, isPending, onSubmit }: LeadFormProps) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const form = useForm<LeadFormInput>({
    defaultValues: {
      ...defaultValues,
      institutionProgramId: defaultValues.institutionProgramId || selectedProgramId || "",
    },
  });
  const programId = form.watch("institutionProgramId");
  const selectedProgram = options.institutionPrograms.find((program) => program.id === programId);
  const customFieldsQuery = useQuery({
    queryKey: ["leads", "form", "custom-fields", leadId ?? "new", programId],
    queryFn: () => leadId ? getLeadCustomFields(leadId, auth.accessToken!) : getLeadCustomFieldDefinitions(programId, auth.accessToken!),
    enabled: Boolean(auth.accessToken && (leadId || programId)),
  });
  const customFields = useMemo(() => customFieldsQuery.data?.fields ?? [], [customFieldsQuery.data?.fields]);
  const customFieldsByGroup = useMemo(() => {
    const grouped = new Map<string, LeadCustomField[]>();
    for (const field of customFields) grouped.set(field.group.key, [...(grouped.get(field.group.key) ?? []), field]);
    return grouped;
  }, [customFields]);
  const customGroups = useMemo(() => {
    const groups = new Map<string, LeadCustomField["group"]>();
    for (const field of customFields) if (!field.group.isSystem) groups.set(field.group.id, field.group);
    return [...groups.values()].sort((left, right) => left.displayOrder - right.displayOrder);
  }, [customFields]);
  const previousCustomFieldIds = useRef<string[]>([]);
  const [hiddenCustomValueWarning, setHiddenCustomValueWarning] = useState(false);
  useEffect(() => form.reset({ ...defaultValues, institutionProgramId: defaultValues.institutionProgramId || selectedProgramId || "" }), [defaultValues, form, selectedProgramId]);
  useEffect(() => {
    for (const field of customFields) {
      const path = `customFieldValues.${field.id}` as const;
      if (field.canView && !form.getFieldState(path).isDirty) {
        form.setValue(path, leadId ? field.value : field.value ?? field.defaultValue ?? null);
      }
    }
  }, [customFields, form, leadId]);
  useEffect(() => { const currentIds = new Set(customFields.map((field) => field.id)); if (previousCustomFieldIds.current.some((fieldId) => !currentIds.has(fieldId) && form.getFieldState(`customFieldValues.${fieldId}`).isDirty)) setHiddenCustomValueWarning(true); previousCustomFieldIds.current = [...currentIds]; }, [customFields, form]);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={form.handleSubmit((values) => {
        const parsed = leadFormSchema.safeParse(values);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) => {
            const field = issue.path[0] as keyof LeadFormInput;
            form.setError(field, { message: issue.message });
          });
          return;
        }
        const customFieldValues: Record<string, LeadCustomFieldValue> = {};
        for (const field of customFields) {
          if (field.canView && field.canEdit && form.getFieldState(`customFieldValues.${field.id}`).isDirty) customFieldValues[field.id] = values.customFieldValues[field.id] ?? null;
        }
        onSubmit({ ...parsed.data, customFieldValues });
      })}
    >
      <FormSection title="Tiến trình" description="Chọn bước xử lý hiện tại của học viên. Mỗi lần thay đổi sẽ được lưu vào lịch sử và nhật ký hệ thống.">
        <LeadProgressSelector
          value={form.watch("pipelineStageId")}
          stages={options.stages}
          onChange={(value) => form.setValue("pipelineStageId", value, { shouldDirty: true })}
          clearLabel="Chưa chọn tiến trình"
          singleRowDesktop
        />
      </FormSection>

      <FormSection title="Thông tin cơ bản" description="Thông tin nhận diện và liên hệ bắt buộc của ứng viên.">
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField name="fullName" id="lead-full-name" label="Họ và tên *" register={form.register} errors={form.formState.errors} autoComplete="name" />
          <TextField name="phone" id="lead-phone" label="Số điện thoại *" register={form.register} errors={form.formState.errors} type="tel" inputMode="numeric" autoComplete="tel" placeholder="Nhập đúng 10 chữ số" />
          <Field data-invalid={Boolean(form.formState.errors.sourceId)}>
            <FieldLabel htmlFor="lead-form-source">Nguồn học viên *</FieldLabel>
            <Select value={form.watch("sourceId")} onValueChange={(value) => form.setValue("sourceId", value, { shouldValidate: true })}>
              <SelectTrigger id="lead-form-source" className="w-full" aria-invalid={Boolean(form.formState.errors.sourceId)}>
                <SelectValue placeholder="Chọn nguồn học viên" />
              </SelectTrigger>
              <SelectContent><SelectGroup>{options.sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldError errors={[form.formState.errors.sourceId]} />
          </Field>
          <TextField name="email" id="lead-email" label="Email" register={form.register} errors={form.formState.errors} type="email" autoComplete="email" />
          <Field>
            <FieldLabel htmlFor="lead-gender">Giới tính</FieldLabel>
            <Select value={form.watch("gender") || "__empty__"} onValueChange={(value) => form.setValue("gender", value === "__empty__" ? "" : value)}>
              <SelectTrigger id="lead-gender" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{genderOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <TextField name="dateOfBirth" id="lead-dob" label="Ngày sinh" register={form.register} errors={form.formState.errors} type="date" />
          <TextField name="birthPlace" id="lead-birth-place" label="Nơi sinh" register={form.register} errors={form.formState.errors} />
          <TextField name="cccd" id="lead-cccd" label="CCCD" register={form.register} errors={form.formState.errors} />
          <TextField name="cccdIssueDate" id="lead-cccd-date" label="Ngày cấp CCCD" register={form.register} errors={form.formState.errors} type="date" />
          <TextField name="cccdIssuePlace" id="lead-cccd-place" label="Nơi cấp CCCD" register={form.register} errors={form.formState.errors} />
          <TextField name="ethnicity" id="lead-ethnicity" label="Dân tộc" register={form.register} errors={form.formState.errors} />
          <TextField name="religion" id="lead-religion" label="Tôn giáo" register={form.register} errors={form.formState.errors} />
          <TextField name="nationality" id="lead-nationality" label="Quốc tịch" register={form.register} errors={form.formState.errors} />
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="lead-specific-address">Địa chỉ cụ thể</FieldLabel>
          <Input id="lead-specific-address" {...form.register("specificAddress")} />
        </Field>
        <CustomFieldInputs fields={customFieldsByGroup.get("basic") ?? []} control={form.control} isPending={isPending} />
      </FormSection>

      <FormSection title="Học vấn và tốt nghiệp" description="Thông tin trường THPT, văn bằng và kết quả tốt nghiệp.">
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField name="graduationYear" id="lead-graduation-year" label="Năm tốt nghiệp" register={form.register} errors={form.formState.errors} inputMode="numeric" />
          <TextField name="graduationCertificate" id="lead-graduation-certificate" label="Bằng tốt nghiệp" register={form.register} errors={form.formState.errors} />
          <TextField name="previousGraduationCertificate" id="lead-old-certificate" label="Bằng tốt nghiệp cũ" register={form.register} errors={form.formState.errors} />
          <TextField name="diplomaIssuePlace" id="lead-diploma-place" label="Nơi cấp bằng" register={form.register} errors={form.formState.errors} />
          <TextField name="graduationMajor" id="lead-graduation-major" label="Ngành tốt nghiệp" register={form.register} errors={form.formState.errors} />
          <TextField name="graduationRank" id="lead-graduation-rank" label="Xếp loại tốt nghiệp" register={form.register} errors={form.formState.errors} />
          <TextField name="academicRank12" id="lead-academic-rank" label="Xếp loại học lực lớp 12" register={form.register} errors={form.formState.errors} />
          <TextField name="conductRank12" id="lead-conduct-rank" label="Xếp loại hạnh kiểm lớp 12" register={form.register} errors={form.formState.errors} />
          <TextField name="highSchoolName" id="lead-school-name" label="Trường THPT" register={form.register} errors={form.formState.errors} />
          <TextField name="highSchoolDistrict" id="lead-school-district" label="Quận/huyện của trường THPT" register={form.register} errors={form.formState.errors} />
          <TextField name="highSchoolProvince" id="lead-school-province" label="Tỉnh/TP của trường THPT" register={form.register} errors={form.formState.errors} />
        </FieldGroup>
        <CustomFieldInputs fields={customFieldsByGroup.get("education") ?? []} control={form.control} isPending={isPending} />
      </FormSection>

      <FormSection title="Địa chỉ và công việc hiện nay" description="Nơi cư trú hiện tại và thông tin công tác nếu có.">
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextField name="hamlet" id="lead-hamlet" label="Ấp/Thôn" register={form.register} errors={form.formState.errors} />
          <TextField name="ward" id="lead-ward" label="Xã/Phường" register={form.register} errors={form.formState.errors} />
          <TextField name="district" id="lead-district" label="Thị xã/Huyện" register={form.register} errors={form.formState.errors} />
          <TextField name="province" id="lead-province" label="Tỉnh/Thành phố" register={form.register} errors={form.formState.errors} />
          <TextField name="currentAddress" id="lead-current-address" label="Địa chỉ hiện nay" register={form.register} errors={form.formState.errors} />
          <TextField name="permanentAddress" id="lead-permanent-address" label="Địa chỉ thường trú" register={form.register} errors={form.formState.errors} />
          <TextField name="currentResidence" id="lead-current-residence" label="Nơi ở hiện tại" register={form.register} errors={form.formState.errors} />
          <TextField name="currentJob" id="lead-current-job" label="Công việc hiện nay" register={form.register} errors={form.formState.errors} />
          <TextField name="companyName" id="lead-company" label="Cơ quan công tác" register={form.register} errors={form.formState.errors} />
        </FieldGroup>
        <CustomFieldInputs fields={customFieldsByGroup.get("current-address") ?? []} control={form.control} isPending={isPending} />
      </FormSection>

      <FormSection title="Người thân đại diện" description="Lưu tối đa hai người liên hệ khi cần hỗ trợ hồ sơ.">
        <p className="text-sm font-medium">Người thân 1</p>
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <TextField name="relative1FullName" id="relative-1-name" label="Họ và tên" register={form.register} errors={form.formState.errors} />
          <TextField name="relative1Relationship" id="relative-1-relation" label="Mối quan hệ" register={form.register} errors={form.formState.errors} />
          <TextField name="relative1Phone" id="relative-1-phone" label="Điện thoại" register={form.register} errors={form.formState.errors} type="tel" inputMode="numeric" placeholder="Nhập đúng 10 chữ số" />
          <TextField name="relative1Job" id="relative-1-job" label="Nghề nghiệp" register={form.register} errors={form.formState.errors} />
          <TextField name="relative1Address" id="relative-1-address" label="Địa chỉ" register={form.register} errors={form.formState.errors} />
        </FieldGroup>
        <p className="text-sm font-medium">Người thân 2</p>
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <TextField name="relative2FullName" id="relative-2-name" label="Họ và tên" register={form.register} errors={form.formState.errors} />
          <TextField name="relative2Relationship" id="relative-2-relation" label="Mối quan hệ" register={form.register} errors={form.formState.errors} />
          <TextField name="relative2Phone" id="relative-2-phone" label="Điện thoại" register={form.register} errors={form.formState.errors} type="tel" inputMode="numeric" placeholder="Nhập đúng 10 chữ số" />
          <TextField name="relative2Job" id="relative-2-job" label="Nghề nghiệp" register={form.register} errors={form.formState.errors} />
          <TextField name="relative2Address" id="relative-2-address" label="Địa chỉ" register={form.register} errors={form.formState.errors} />
        </FieldGroup>
        <CustomFieldInputs fields={customFieldsByGroup.get("relatives") ?? []} control={form.control} isPending={isPending} />
      </FormSection>

      <FormSection title="Thông tin tuyển sinh" description="Hồ sơ được ghi vào chương trình đang chọn trên thanh công cụ; ngành đăng ký và trạng thái hồ sơ là bắt buộc khi nhập phần này.">
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field data-invalid={Boolean(form.formState.errors.majorId)}>
            <FieldLabel htmlFor="lead-major">Ngành đăng ký *</FieldLabel>
            <Select value={form.watch("majorId") || "__empty__"} onValueChange={(value) => form.setValue("majorId", value === "__empty__" ? "" : value, { shouldValidate: true })}>
              <SelectTrigger id="lead-major" className="w-full" aria-invalid={Boolean(form.formState.errors.majorId)}><SelectValue placeholder="Chọn ngành đăng ký" /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="__empty__">Chưa lập hồ sơ</SelectItem>{options.majors.map((major) => <SelectItem key={major.id} value={major.id}>{major.code ? `${major.code} - ` : ""}{major.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldError errors={[form.formState.errors.majorId]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.admissionStatusId)}>
            <FieldLabel htmlFor="lead-admission-status">Trạng thái hồ sơ *</FieldLabel>
            <Select value={form.watch("admissionStatusId") || "__empty__"} onValueChange={(value) => form.setValue("admissionStatusId", value === "__empty__" ? "" : value, { shouldValidate: true })}>
              <SelectTrigger id="lead-admission-status" className="w-full" aria-invalid={Boolean(form.formState.errors.admissionStatusId)}><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="__empty__">Chưa xác định</SelectItem>{options.admissionStatuses.map((status) => <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldError errors={[form.formState.errors.admissionStatusId]} />
          </Field>
          <TextField name="trainingCode" id="lead-training-code" label="Mã đào tạo" register={form.register} errors={form.formState.errors} />
          <TextField name="classCode" id="lead-class-code" label="Mã lớp" register={form.register} errors={form.formState.errors} />
          <TextField name="subjectGroupCode" id="lead-subject-code" label="Mã tổ hợp môn" register={form.register} errors={form.formState.errors} />
          <TextField name="subjectGroupName" id="lead-subject-name" label="Tên tổ hợp môn" register={form.register} errors={form.formState.errors} />
          <TextField name="score1" id="lead-score-1" label="Điểm TH1" register={form.register} errors={form.formState.errors} inputMode="decimal" />
          <TextField name="score2" id="lead-score-2" label="Điểm TH2" register={form.register} errors={form.formState.errors} inputMode="decimal" />
          <TextField name="score3" id="lead-score-3" label="Điểm TH3" register={form.register} errors={form.formState.errors} inputMode="decimal" />
          <TextField name="admissionScore" id="lead-admission-score" label="Điểm xét tuyển" register={form.register} errors={form.formState.errors} inputMode="decimal" />
          <TextField name="enrollmentBatch" id="lead-enrollment-batch" label="Đợt khai giảng" register={form.register} errors={form.formState.errors} />
          <TextField name="registrationStation" id="lead-station" label="Trạm đăng ký" register={form.register} errors={form.formState.errors} />
          <TextField name="decisionNumber" id="lead-decision-number" label="Số quyết định" register={form.register} errors={form.formState.errors} />
          <TextField name="decisionSignedDate" id="lead-decision-date" label="Ngày ký quyết định" register={form.register} errors={form.formState.errors} type="date" />
          <TextField name="monthlyRevenue" id="lead-monthly-revenue" label="Doanh số tháng" register={form.register} errors={form.formState.errors} inputMode="decimal" />
        </FieldGroup>
        <CustomFieldInputs fields={customFieldsByGroup.get("admission") ?? []} control={form.control} isPending={isPending} />
      </FormSection>

      <FormSection title="Chăm sóc và phân loại" description="Thông tin phục vụ telesale, marketing và phân loại ứng viên.">
        <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="lead-status-input">Quy trình Telesale</FieldLabel>
            <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value)}>
              <SelectTrigger id="lead-status-input" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <TextField name="temperature" id="lead-temperature" label="Mức độ quan tâm" register={form.register} errors={form.formState.errors} />
          <TextField name="gclid" id="lead-gclid" label="Gclid" register={form.register} errors={form.formState.errors} />
          <TextField name="tags" id="lead-tags" label="Tags" register={form.register} errors={form.formState.errors} placeholder={options.tags.length ? options.tags.join(", ") : "Ví dụ: Quan tâm cao, Cần bổ sung hồ sơ"} />
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="lead-note-input">Ghi chú</FieldLabel>
          <Textarea id="lead-note-input" rows={3} placeholder="Nhập ghi chú ban đầu hoặc nhu cầu tư vấn..." {...form.register("note")} />
        </Field>
        <CustomFieldInputs fields={customFieldsByGroup.get("classification") ?? []} control={form.control} isPending={isPending} />
      </FormSection>
      <FormSection title="Thông tin bổ sung" description="Các trường dữ liệu tùy chỉnh áp dụng theo chương trình tuyển sinh đã chọn.">
        <Field data-invalid={Boolean(form.formState.errors.institutionProgramId)} data-disabled>
          <FieldLabel htmlFor="lead-institution-program">Chương trình tuyển sinh *</FieldLabel>
          <Input
            id="lead-institution-program"
            value={selectedProgram ? `${selectedProgram.institutionName} - ${selectedProgram.name}` : ""}
            disabled
            aria-invalid={Boolean(form.formState.errors.institutionProgramId)}
            placeholder="Chưa có chương trình đang làm việc"
          />
          <FieldDescription>{leadId ? "Chương trình của ứng viên không thể thay đổi tại đây." : "Tự động theo chương trình đang làm việc và không thể thay đổi trong form."}</FieldDescription>
          <FieldError errors={[form.formState.errors.institutionProgramId]} />
        </Field>
        {hiddenCustomValueWarning && <p role="status" className="text-sm text-amber-700">Một số giá trị vừa nhập không còn áp dụng theo chương trình mới. Chúng được giữ trong form nhưng sẽ không được lưu.</p>}
        {customFieldsQuery.isLoading ? <p className="text-sm text-muted-foreground">Đang tải trường dữ liệu bổ sung…</p> : customFieldsQuery.isError ? <p role="alert" className="text-sm text-destructive">Không thể tải trường dữ liệu bổ sung. Vui lòng thử lại.</p> : <CustomFieldInputs fields={customFieldsByGroup.get("additional") ?? []} control={form.control} isPending={isPending} emptyLabel="Chưa có trường dữ liệu bổ sung áp dụng." />}
      </FormSection>
      {customGroups.map((group) => (
        <FormSection key={group.id} title={group.label} description={group.description ?? "Nhóm trường dữ liệu tùy chỉnh."}>
          <CustomFieldInputs fields={customFields.filter((field) => field.group.id === group.id)} control={form.control} isPending={isPending} />
        </FormSection>
      ))}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : submitLabel}</Button>
      </div>
    </form>
  );
}

function CustomFieldInputs({ fields, control, isPending, emptyLabel }: { fields: LeadCustomField[]; control: Control<LeadFormInput>; isPending: boolean; emptyLabel?: string }) {
  if (fields.length === 0) return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null;
  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => field.canView
        ? <DynamicFieldRenderer key={field.id} field={field} control={control} name={`customFieldValues.${field.id}`} disabled={isPending} />
        : <div key={field.id}><p className="text-sm text-muted-foreground">{field.name}</p><p className="text-sm font-medium">Không có quyền xem</p></div>)}
    </FieldGroup>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/10 p-4">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split("").map((item) => item + item).join("")}`;
  }
  return fallback;
}

function getReadableTextColor(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.58 ? "#0f172a" : "#ffffff";
}

function formatProgressCount(count?: number) {
  return compactNumberFormatter.format(count ?? 0);
}

export function LeadProgressSelector({
  value,
  stages,
  onChange,
  clearLabel,
  allOptionLabel,
  allOptionCount,
  singleRowDesktop = false,
}: {
  value: string;
  stages: Array<{ id: string; name: string; color?: string | null; count?: number }>;
  onChange: (value: string) => void;
  clearLabel?: string;
  allOptionLabel?: string;
  allOptionCount?: number;
  singleRowDesktop?: boolean;
}) {
  if (stages.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có bước tiến trình để lựa chọn.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className={singleRowDesktop ? `grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${allOptionLabel ? "2xl:grid-cols-9" : "2xl:grid-cols-8"}` : "flex flex-wrap gap-2"}>
        <legend className="sr-only">Chọn tiến trình học viên</legend>
        {allOptionLabel && (
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => onChange("")}
            className={`relative flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              singleRowDesktop ? "min-w-0" : "min-w-36 flex-1"
            } ${
              !value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            }`}
          >
            <span className="min-w-0 wrap-break-word">{allOptionLabel}</span>
            {allOptionCount !== undefined && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums ${!value ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"}`}>
                {formatProgressCount(allOptionCount)}
              </span>
            )}
          </button>
        )}
        {stages.map((stage, index) => {
          const selected = stage.id === value;
          const stageColor = normalizeHexColor(stage.color, progressFallbackColors[index % progressFallbackColors.length]);
          const readableTextColor = getReadableTextColor(stageColor);
          const buttonStyle: CSSProperties = selected
            ? { backgroundColor: stageColor, borderColor: stageColor, color: readableTextColor }
            : { borderColor: `${stageColor}66`, boxShadow: `inset 0 3px 0 ${stageColor}` };
          const countStyle: CSSProperties = selected
            ? { backgroundColor: "rgb(255 255 255 / 0.2)", color: readableTextColor }
            : { backgroundColor: `${stageColor}1A`, color: stageColor };
          return (
            <button
              key={stage.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(stage.id)}
              style={buttonStyle}
              className={`relative flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                singleRowDesktop ? "min-w-0" : "min-w-36 flex-1"
              } ${
                selected
                  ? "shadow-sm"
                  : "bg-muted/30 text-foreground hover:bg-background"
              }`}
            >
              <span className="min-w-0 wrap-break-word">{stage.name}</span>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums" style={countStyle}>
                {formatProgressCount(stage.count)}
              </span>
              <span className="sr-only">{`Bước ${index + 1}`}</span>
            </button>
          );
        })}
      </fieldset>
      {clearLabel && (
        <Button type="button" variant="ghost" size="sm" className="self-start" disabled={!value} onClick={() => onChange("")}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}

type TextFieldProps = {
  name: keyof LeadFormInput;
  id: string;
  label: string;
  register: UseFormRegister<LeadFormInput>;
  errors: FieldErrors<LeadFormInput>;
  type?: HTMLInputTypeAttribute;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  placeholder?: string;
};

function TextField({ name, id, label, register, errors, type, inputMode, autoComplete, placeholder }: TextFieldProps) {
  const error = errors[name];
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} inputMode={inputMode} autoComplete={autoComplete} placeholder={placeholder} aria-invalid={Boolean(error)} {...register(name)} />
      <FieldError errors={[error]} />
    </Field>
  );
}
