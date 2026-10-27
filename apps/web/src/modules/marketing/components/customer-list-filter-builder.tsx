import { Plus, Trash2 } from "lucide-react";
import { getLeadFieldGroup, leadFieldGroupOrder } from "@admission-crm/shared/lead-field-groups";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import {
  CreateCustomerListFormValues,
  filterFields,
} from "./customer-list-filter-model";

import { GroupedFieldPicker, type GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
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
import { useAuth } from "@/modules/auth/auth-context";
import type { LeadFilterOptions } from "@/modules/leads/lead.types";
import type {
  CustomerListFilterCondition,
  CustomerListFilterField,
  CustomerListFilterOperator,
  CustomerListRelativeRange,
} from "../customer-list.types";

const textOperators: Array<{
  value: CustomerListFilterOperator;
  label: string;
}> = [
  { value: "contains", label: "Có chứa" },
  { value: "notContains", label: "Không chứa" },
  { value: "equals", label: "Bằng" },
  { value: "notEquals", label: "Không bằng" },
  { value: "isEmpty", label: "Chưa có dữ liệu" },
  { value: "isNotEmpty", label: "Có dữ liệu" },
];
const selectOperators = textOperators.filter(
  (item) => !["contains", "notContains"].includes(item.value),
);
const numberOperators: Array<{
  value: CustomerListFilterOperator;
  label: string;
}> = [
  { value: "equals", label: "Bằng" },
  { value: "notEquals", label: "Không bằng" },
  { value: "greaterThan", label: "Lớn hơn" },
  { value: "lessThan", label: "Nhỏ hơn" },
  { value: "isEmpty", label: "Chưa có dữ liệu" },
  { value: "isNotEmpty", label: "Có dữ liệu" },
];
const dateOperators: Array<{
  value: CustomerListFilterOperator;
  label: string;
}> = [
  { value: "on", label: "Vào ngày" },
  { value: "before", label: "Trước ngày" },
  { value: "after", label: "Sau ngày" },
  { value: "between", label: "Khoảng tùy chọn" },
  { value: "isEmpty", label: "Chưa có dữ liệu" },
  { value: "isNotEmpty", label: "Có dữ liệu" },
];
const createdAtOperators = [
  ...dateOperators.filter(
    (item) => !["isEmpty", "isNotEmpty"].includes(item.value),
  ),
  { value: "relative" as const, label: "Khoảng tương đối" },
];
const relativeRanges: Array<{
  value: CustomerListRelativeRange;
  label: string;
}> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "thisWeek", label: "Tuần này" },
  { value: "lastWeek", label: "Tuần trước" },
  { value: "last7Days", label: "7 ngày gần nhất" },
  { value: "last30Days", label: "30 ngày gần nhất" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
  { value: "thisQuarter", label: "Quý này" },
  { value: "lastQuarter", label: "Quý trước" },
  { value: "thisYear", label: "Năm nay" },
  { value: "lastYear", label: "Năm trước" },
];

function defaultCondition(
  field: CustomerListFilterField = "fullName",
): CustomerListFilterCondition {
  if (field === "createdAt")
    return { field, operator: "relative", relativeRange: "thisMonth" };
  const type = filterFields.find((item) => item.value === field)?.type;
  if (type === "date") return { field, operator: "on", value: "" };
  return {
    field,
    operator: type === "select" || type === "number" ? "equals" : "contains",
    value: "",
  };
}

function operatorOptions(field: CustomerListFilterField) {
  if (field === "createdAt") return createdAtOperators;
  const type = filterFields.find((item) => item.value === field)?.type;
  if (type === "number") return numberOperators;
  return type === "date"
    ? dateOperators
    : type === "select"
      ? selectOperators
      : textOperators;
}

function selectValueOptions(
  field: CustomerListFilterField,
  options?: LeadFilterOptions,
) {
  if (field === "pipelineStageId")
    return (options?.stages ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  if (field === "sourceId")
    return (options?.sources ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  if (field === "assigneeId")
    return (options?.assignees ?? []).map((item) => ({
      value: item.id,
      label: item.fullName,
    }));
  if (field === "majorId")
    return (options?.majors ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  // Lead form stores gender codes, not the Vietnamese labels.
  if (field === "gender")
    return [
      { value: "male", label: "Nam" },
      { value: "female", label: "Nữ" },
      { value: "other", label: "Khác" },
    ];
  if (field === "admissionStatusId")
    return (options?.admissionStatuses ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  if (field === "originId")
    return (options?.origins ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  if (field === "source")
    return (options?.channels ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    }));
  return [];
}

/** Groups filter fields by the Lead form cluster they belong to, in Lead form order. */
function toLeadFieldOptions(fields: Array<{ value: string; label: string }>): GroupedFieldOption[] {
  return fields
    .map((field, index) => {
      const group = getLeadFieldGroup(field.value) ?? { id: "basic", label: "Thông tin cơ bản" };
      return { option: { value: field.value, label: field.label, groupKey: group.id, groupLabel: group.label }, index };
    })
    .sort((left, right) => leadFieldGroupOrder(left.option.groupKey) - leadFieldGroupOrder(right.option.groupKey) || left.index - right.index)
    .map(({ option }) => option);
}

function SelectField({
  id,
  value,
  placeholder,
  options,
  onChange,
}: {
  id: string;
  value?: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ConditionValue({
  condition,
  index,
  form,
  options,
}: {
  condition: CustomerListFilterCondition;
  index: number;
  form: UseFormReturn<CreateCustomerListFormValues>;
  options?: LeadFilterOptions;
}) {
  const prefix = `filters.conditions.${index}` as const;
  if (["isEmpty", "isNotEmpty"].includes(condition.operator))
    return (
      <p className="flex min-h-9 items-center text-sm text-muted-foreground">
        Không cần nhập giá trị
      </p>
    );
  if (condition.operator === "between")
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          type="date"
          aria-label="Từ ngày"
          {...form.register(`${prefix}.from`)}
        />
        <Input
          type="date"
          aria-label="Đến ngày"
          {...form.register(`${prefix}.to`)}
        />
      </div>
    );
  if (condition.operator === "relative")
    return (
      <SelectField
        id={`${prefix}-relative`}
        value={condition.relativeRange}
        placeholder="Chọn khoảng thời gian"
        options={relativeRanges}
        onChange={(value) =>
          form.setValue(
            `${prefix}.relativeRange`,
            value as CustomerListRelativeRange,
          )
        }
      />
    );
  const type = filterFields.find(
    (item) => item.value === condition.field,
  )?.type;
  if (type === "select")
    return (
      <SelectField
        id={`${prefix}-value`}
        value={condition.value}
        placeholder="Chọn giá trị"
        options={selectValueOptions(condition.field, options)}
        onChange={(value) => form.setValue(`${prefix}.value`, value)}
      />
    );
  return (
    <Input
      type={type === "date" ? "date" : type === "number" ? "number" : "text"}
      aria-label="Giá trị lọc"
      placeholder="Nhập giá trị"
      {...form.register(`${prefix}.value`)}
    />
  );
}

export function CustomerListFilterBuilder({
  form,
  options,
}: {
  form: UseFormReturn<CreateCustomerListFormValues>;
  options?: LeadFilterOptions;
}) {
  const auth = useAuth();
  const conditions = useFieldArray({
    control: form.control,
    name: "filters.conditions",
  });
  const values = form.watch("filters.conditions");
  const availableFields = auth.can("lead.sensitive.view")
    ? filterFields
    : filterFields.filter((item) => !item.sensitive);
  const fieldOptions = toLeadFieldOptions(availableFields);
  return (
    <FieldSet className="rounded-lg border bg-muted/25 p-4">
      <FieldLegend>Bộ lọc tự động (không bắt buộc)</FieldLegend>
      <FieldDescription>
        Chọn trường dữ liệu và điều kiện tương ứng. Không có điều kiện sẽ chuyển
        danh sách sang chế độ tĩnh.
      </FieldDescription>
      {conditions.fields.length > 1 && (
        <Field className="max-w-xs">
          <FieldLabel htmlFor="customer-list-combinator">
            Cách kết hợp điều kiện
          </FieldLabel>
          <Select
            value={form.watch("filters.combinator")}
            onValueChange={(value) =>
              form.setValue("filters.combinator", value as "AND" | "OR")
            }
          >
            <SelectTrigger id="customer-list-combinator" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="AND">Thỏa mãn tất cả (VÀ)</SelectItem>
                <SelectItem value="OR">Thỏa mãn ít nhất một (HOẶC)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      <FieldGroup className="gap-3">
        {conditions.fields.map((item, index) => {
          const condition = values[index] as CustomerListFilterCondition;
          const prefix = `filters.conditions.${index}` as const;
          return (
            <div
              key={item.id}
              className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[minmax(180px,1fr)_minmax(170px,1fr)_minmax(220px,1.4fr)_auto] lg:items-end"
            >
              <Field>
                <FieldLabel htmlFor={`${prefix}-field`}>
                  Trường dữ liệu
                </FieldLabel>
                <GroupedFieldPicker
                  id={`${prefix}-field`}
                  value={condition.field}
                  placeholder="Chọn trường"
                  options={fieldOptions}
                  onChange={(value) =>
                    conditions.update(
                      index,
                      defaultCondition(value as CustomerListFilterField),
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-operator`}>Toán tử</FieldLabel>
                <SelectField
                  id={`${prefix}-operator`}
                  value={condition.operator}
                  placeholder="Chọn toán tử"
                  options={operatorOptions(condition.field)}
                  onChange={(value) =>
                    conditions.update(index, {
                      ...defaultCondition(condition.field),
                      operator: value as CustomerListFilterOperator,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Giá trị</FieldLabel>
                <ConditionValue
                  condition={condition}
                  index={index}
                  form={form}
                  options={options}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Xóa điều kiện ${index + 1}`}
                onClick={() => conditions.remove(index)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </FieldGroup>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={conditions.fields.length >= 10}
        onClick={() => conditions.append(defaultCondition())}
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        Thêm điều kiện
      </Button>
    </FieldSet>
  );
}
