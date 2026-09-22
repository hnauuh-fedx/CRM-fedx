import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadFilterOptions } from "@/modules/leads/lead.types";
import { useAuth } from "@/modules/auth/auth-context";
import type {
  CustomerListFilterCondition,
  CustomerListFilterField,
  CustomerListFilterOperator,
  CustomerListRelativeRange,
} from "../customer-list.types";

const filterFields: Array<{ value: CustomerListFilterField; label: string; type: "text" | "select" | "date" }> = [
  { value: "fullName", label: "Họ và tên", type: "text" },
  { value: "leadCode", label: "Mã Lead", type: "text" },
  { value: "phone", label: "Số điện thoại", type: "text" },
  { value: "email", label: "Email", type: "text" },
  { value: "pipelineStageId", label: "Quy trình Telesale", type: "select" },
  { value: "sourceId", label: "Nguồn HV", type: "select" },
  { value: "assigneeId", label: "Nhân viên sale", type: "select" },
  { value: "gender", label: "Giới tính", type: "select" },
  { value: "dateOfBirth", label: "Ngày sinh", type: "date" },
  { value: "majorId", label: "Ngành đăng ký", type: "select" },
  { value: "createdAt", label: "Ngày tạo", type: "date" },
];
const textOperators: Array<{ value: CustomerListFilterOperator; label: string }> = [
  { value: "contains", label: "Có chứa" }, { value: "notContains", label: "Không chứa" },
  { value: "equals", label: "Bằng" }, { value: "notEquals", label: "Không bằng" },
  { value: "isEmpty", label: "Chưa có dữ liệu" }, { value: "isNotEmpty", label: "Có dữ liệu" },
];
const selectOperators = textOperators.filter((item) => !["contains", "notContains"].includes(item.value));
const dateOperators: Array<{ value: CustomerListFilterOperator; label: string }> = [
  { value: "on", label: "Vào ngày" }, { value: "before", label: "Trước ngày" },
  { value: "after", label: "Sau ngày" }, { value: "between", label: "Khoảng tùy chọn" },
  { value: "isEmpty", label: "Chưa có dữ liệu" }, { value: "isNotEmpty", label: "Có dữ liệu" },
];
const createdAtOperators = [
  ...dateOperators.filter((item) => !["isEmpty", "isNotEmpty"].includes(item.value)),
  { value: "relative" as const, label: "Khoảng tương đối" },
];
const relativeRanges: Array<{ value: CustomerListRelativeRange; label: string }> = [
  { value: "today", label: "Hôm nay" }, { value: "yesterday", label: "Hôm qua" },
  { value: "thisWeek", label: "Tuần này" }, { value: "lastWeek", label: "Tuần trước" },
  { value: "last7Days", label: "7 ngày gần nhất" }, { value: "last30Days", label: "30 ngày gần nhất" },
  { value: "thisMonth", label: "Tháng này" }, { value: "lastMonth", label: "Tháng trước" },
  { value: "thisQuarter", label: "Quý này" }, { value: "lastQuarter", label: "Quý trước" },
  { value: "thisYear", label: "Năm nay" }, { value: "lastYear", label: "Năm trước" },
];
const operatorValues: [CustomerListFilterOperator, ...CustomerListFilterOperator[]] = [
  "contains", "notContains", "equals", "notEquals", "isEmpty", "isNotEmpty",
  "on", "before", "after", "between", "relative",
];
const relativeRangeValues: [CustomerListRelativeRange, ...CustomerListRelativeRange[]] = [
  "today", "yesterday", "thisWeek", "lastWeek", "last7Days", "last30Days",
  "thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "lastYear",
];

const conditionSchema = z.object({
  field: z.enum(filterFields.map((item) => item.value) as [CustomerListFilterField, ...CustomerListFilterField[]]),
  operator: z.enum(operatorValues), value: z.string().optional(), from: z.string().optional(), to: z.string().optional(), relativeRange: z.enum(relativeRangeValues).optional(),
}).superRefine((condition, context) => {
  if (["isEmpty", "isNotEmpty"].includes(condition.operator)) return;
  if (condition.operator === "between") {
    if (!condition.from || !condition.to) context.addIssue({ code: "custom", message: "Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc." });
    else if (condition.from > condition.to) context.addIssue({ code: "custom", message: "Ngày bắt đầu không được sau ngày kết thúc." });
  } else if (condition.operator === "relative") {
    if (!condition.relativeRange) context.addIssue({ code: "custom", message: "Vui lòng chọn khoảng thời gian tương đối." });
  } else if (!condition.value?.trim()) context.addIssue({ code: "custom", message: "Vui lòng nhập hoặc chọn giá trị cho từng điều kiện." });
});

export const createCustomerListSchema = z.object({
  name: z.string().trim().min(2, "Tên danh sách phải có ít nhất 2 ký tự.").max(255),
  filters: z.object({ combinator: z.enum(["AND", "OR"]), conditions: z.array(conditionSchema).max(10) }),
});
export type CreateCustomerListFormValues = z.infer<typeof createCustomerListSchema>;
export const createCustomerListDefaults: CreateCustomerListFormValues = { name: "", filters: { combinator: "AND", conditions: [] } };

function defaultCondition(field: CustomerListFilterField = "fullName"): CustomerListFilterCondition {
  if (field === "createdAt") return { field, operator: "relative", relativeRange: "thisMonth" };
  if (field === "dateOfBirth") return { field, operator: "on", value: "" };
  const type = filterFields.find((item) => item.value === field)?.type;
  return { field, operator: type === "select" ? "equals" : "contains", value: "" };
}

function operatorOptions(field: CustomerListFilterField) {
  if (field === "createdAt") return createdAtOperators;
  const type = filterFields.find((item) => item.value === field)?.type;
  return type === "date" ? dateOperators : type === "select" ? selectOperators : textOperators;
}

function selectValueOptions(field: CustomerListFilterField, options?: LeadFilterOptions) {
  if (field === "pipelineStageId") return (options?.stages ?? []).map((item) => ({ value: item.id, label: item.name }));
  if (field === "sourceId") return (options?.sources ?? []).map((item) => ({ value: item.id, label: item.name }));
  if (field === "assigneeId") return (options?.assignees ?? []).map((item) => ({ value: item.id, label: item.fullName }));
  if (field === "majorId") return (options?.majors ?? []).map((item) => ({ value: item.id, label: item.name }));
  if (field === "gender") return [{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }, { value: "Khác", label: "Khác" }];
  return [];
}

function SelectField({ id, value, placeholder, options, onChange }: { id: string; value?: string; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectGroup>{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

function ConditionValue({ condition, index, form, options }: { condition: CustomerListFilterCondition; index: number; form: UseFormReturn<CreateCustomerListFormValues>; options?: LeadFilterOptions }) {
  const prefix = `filters.conditions.${index}` as const;
  if (["isEmpty", "isNotEmpty"].includes(condition.operator)) return <p className="flex min-h-9 items-center text-sm text-muted-foreground">Không cần nhập giá trị</p>;
  if (condition.operator === "between") return <div className="grid gap-2 sm:grid-cols-2"><Input type="date" aria-label="Từ ngày" {...form.register(`${prefix}.from`)} /><Input type="date" aria-label="Đến ngày" {...form.register(`${prefix}.to`)} /></div>;
  if (condition.operator === "relative") return <SelectField id={`${prefix}-relative`} value={condition.relativeRange} placeholder="Chọn khoảng thời gian" options={relativeRanges} onChange={(value) => form.setValue(`${prefix}.relativeRange`, value as CustomerListRelativeRange)} />;
  const type = filterFields.find((item) => item.value === condition.field)?.type;
  if (type === "select") return <SelectField id={`${prefix}-value`} value={condition.value} placeholder="Chọn giá trị" options={selectValueOptions(condition.field, options)} onChange={(value) => form.setValue(`${prefix}.value`, value)} />;
  return <Input type={type === "date" ? "date" : "text"} aria-label="Giá trị lọc" placeholder="Nhập giá trị" {...form.register(`${prefix}.value`)} />;
}

export function CustomerListFilterBuilder({ form, options }: { form: UseFormReturn<CreateCustomerListFormValues>; options?: LeadFilterOptions }) {
  const auth = useAuth();
  const conditions = useFieldArray({ control: form.control, name: "filters.conditions" });
  const values = form.watch("filters.conditions");
  const availableFields = auth.can("lead.sensitive.view")
    ? filterFields
    : filterFields.filter((item) => !["phone", "email"].includes(item.value));
  return (
    <FieldSet className="rounded-lg border bg-muted/25 p-4">
      <FieldLegend>Bộ lọc tự động (không bắt buộc)</FieldLegend>
      <FieldDescription>Chọn trường dữ liệu và điều kiện tương ứng. Không có điều kiện sẽ chuyển danh sách sang chế độ tĩnh.</FieldDescription>
      {conditions.fields.length > 1 && <Field className="max-w-xs"><FieldLabel htmlFor="customer-list-combinator">Cách kết hợp điều kiện</FieldLabel><Select value={form.watch("filters.combinator")} onValueChange={(value) => form.setValue("filters.combinator", value as "AND" | "OR")}><SelectTrigger id="customer-list-combinator" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="AND">Thỏa mãn tất cả (VÀ)</SelectItem><SelectItem value="OR">Thỏa mãn ít nhất một (HOẶC)</SelectItem></SelectGroup></SelectContent></Select></Field>}
      <FieldGroup className="gap-3">
        {conditions.fields.map((item, index) => {
          const condition = values[index] as CustomerListFilterCondition;
          const prefix = `filters.conditions.${index}` as const;
          return <div key={item.id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[minmax(180px,1fr)_minmax(170px,1fr)_minmax(220px,1.4fr)_auto] lg:items-end">
            <Field><FieldLabel htmlFor={`${prefix}-field`}>Trường dữ liệu</FieldLabel><SelectField id={`${prefix}-field`} value={condition.field} placeholder="Chọn trường" options={availableFields} onChange={(value) => conditions.update(index, defaultCondition(value as CustomerListFilterField))} /></Field>
            <Field><FieldLabel htmlFor={`${prefix}-operator`}>Toán tử</FieldLabel><SelectField id={`${prefix}-operator`} value={condition.operator} placeholder="Chọn toán tử" options={operatorOptions(condition.field)} onChange={(value) => conditions.update(index, { ...defaultCondition(condition.field), operator: value as CustomerListFilterOperator })} /></Field>
            <Field><FieldLabel>Giá trị</FieldLabel><ConditionValue condition={condition} index={index} form={form} options={options} /></Field>
            <Button type="button" variant="ghost" size="icon" aria-label={`Xóa điều kiện ${index + 1}`} onClick={() => conditions.remove(index)}><Trash2 aria-hidden="true" /></Button>
          </div>;
        })}
      </FieldGroup>
      <Button type="button" variant="outline" className="w-fit" disabled={conditions.fields.length >= 10} onClick={() => conditions.append(defaultCondition())}><Plus data-icon="inline-start" aria-hidden="true" />Thêm điều kiện</Button>
    </FieldSet>
  );
}
