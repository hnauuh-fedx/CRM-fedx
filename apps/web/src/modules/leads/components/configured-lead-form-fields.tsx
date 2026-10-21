import { PhoneFields } from "./phone-fields";
import { LeadAssigneeSelects } from "./lead-assignee";
import type { UseFormReturn } from "react-hook-form";
import {
  getDisplayFields,
  normalizeVisibleFields,
} from "@admission-crm/shared/display-layout";
import {
  leadFormFieldCatalog,
  type LeadSystemField,
} from "@admission-crm/shared/lead-form-field-catalog";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LeadActionOptions, LeadFormInput } from "../lead.types";
import type { HTMLInputTypeAttribute } from "react";

const inputTypes: Partial<
  Record<LeadSystemField["dataType"], HTMLInputTypeAttribute>
> = {
  DATE: "date",
  EMAIL: "email",
  PHONE: "tel",
};

export type LeadLayoutFormOptions = Pick<
  LeadActionOptions,
  | "sources"
  | "stages"
  | "telesales"
  | "institutionPrograms"
  | "majors"
  | "admissionStatuses"
  | "tags"
  | "systemFieldRequirements"
>;
const fields = [
  ...leadFormFieldCatalog.flatMap((group) => group.fields),
  {
    key: "assigneeId",
    label: "Sale phụ trách",
    dataType: "SELECT",
    storage: "leads.assigned_to",
  } satisfies LeadSystemField,
];
const fieldMap = new Map(fields.map((field) => [field.key, field]));

function configuredFormKeys(
  visible: string[],
  required: Record<string, boolean>,
  errors: string[],
) {
  const keys = new Set(
    normalizeVisibleFields(visible, getDisplayFields("LEAD_FORM")),
  );
  const invalid = new Set(errors);
  for (const field of fields)
    if (required[field.key] || invalid.has(field.key)) keys.add(field.key);
  return [...keys];
}

type Props = {
  visible: string[];
  form: UseFormReturn<LeadFormInput>;
  options: LeadLayoutFormOptions;
  canManageAssignment: boolean;
  disabled: boolean;
  onStageChange: (value: string) => void;
  /** Fields edited elsewhere on the page (e.g. the stage on the detail page) and left out of the form. */
  hiddenFields?: string[];
};
export function ConfiguredLeadFormFields(props: Props) {
  const keys = configuredFormKeys(
    props.visible,
    props.options.systemFieldRequirements,
    [
      ...Object.keys(props.form.formState.errors),
      ...Object.keys(props.form.formState.dirtyFields),
    ],
  ).filter((key) => !props.hiddenFields?.includes(key));
  return (
    <div
      className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-testid="configured-lead-form"
    >
      {keys.map((key) => {
        const field = fieldMap.get(key);
        if (!field || (key === "assigneeId" && !props.canManageAssignment))
          return null;
        return <ConfiguredLeadField key={key} {...props} field={field} />;
      })}
    </div>
  );
}

function selectOptions(key: string, options: LeadLayoutFormOptions) {
  switch (key) {
    case "sourceId":
      return options.sources;
    case "majorId":
      return options.majors;
    case "admissionStatusId":
      return options.admissionStatuses;
    case "pipelineStageId":
      return options.stages;
    case "assigneeId":
      return options.telesales.map((user) => ({
        id: user.id,
        name: user.fullName,
      }));
    case "gender":
      return [
        { id: "male", name: "Nam" },
        { id: "female", name: "Nữ" },
        { id: "other", name: "Khác" },
      ];
    default:
      return [];
  }
}

function ConfiguredLeadField({
  field,
  form,
  options,
  disabled,
  onStageChange,
}: Props & { field: LeadSystemField }) {
  const key = field.key as keyof LeadFormInput;
  if (key === "phone") return <PhoneFields form={form} label={field.label} disabled={disabled} />;
  if (key === "assigneeId") return <LeadAssigneeSelects disabled={disabled} idPrefix="configured-lead-assignee"
    primaryId={form.watch("assigneeId")} secondaryId={form.watch("secondaryAssigneeId") ?? ""}
    options={options.telesales} onChange={({primaryId, secondaryId}) => {
      form.setValue("assigneeId", primaryId, { shouldDirty: true });
      form.setValue("secondaryAssigneeId", secondaryId, { shouldDirty: true });
    }} />;
  const id = `configured-lead-${key}`;
  const error = form.formState.errors[key];
  const required =
    field.requiredLocked ||
    options.systemFieldRequirements[key] ||
    key === "institutionProgramId";
  const inputProps = {
    id,
    disabled,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
  };
  return (
    <Field
      data-invalid={Boolean(error)}
      className="min-w-0"
      data-layout-field={key}
    >
      <FieldLabel htmlFor={id}>
        {field.label}
        {required ? " *" : ""}
      </FieldLabel>
      <ConfiguredLeadControl
        field={field}
        form={form}
        options={options}
        disabled={disabled}
        onStageChange={onStageChange}
        inputProps={inputProps}
      />
      {error && (
        <FieldError id={`${id}-error`}>
          {String(error.message ?? "Dữ liệu không hợp lệ.")}
        </FieldError>
      )}
    </Field>
  );
}

function ConfiguredLeadControl({
  field,
  form,
  options,
  onStageChange,
  inputProps,
}: Pick<Props, "form" | "options" | "disabled" | "onStageChange"> & {
  field: LeadSystemField;
  inputProps: {
    id: string;
    disabled: boolean;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  };
}) {
  const key = field.key as keyof LeadFormInput;
  if (key === "institutionProgramId") {
    const program = options.institutionPrograms.find(
      (item) => item.id === form.watch("institutionProgramId"),
    );
    return (
      <Input
        {...inputProps}
        readOnly
        value={
          program
            ? `${program.institutionName} - ${program.name}`
            : "Chưa chọn chương trình"
        }
      />
    );
  } else if (field.dataType === "SELECT") {
    return (
      <ConfiguredLeadSelect
        fieldKey={key}
        form={form}
        options={options}
        onStageChange={onStageChange}
        inputProps={inputProps}
      />
    );
  } else if (field.dataType === "TEXTAREA") {
    return <Textarea {...inputProps} {...form.register(key)} rows={3} />;
  } else {
    const type = inputTypes[field.dataType] ?? "text";
    return (
      <Input
        {...inputProps}
        {...form.register(key)}
        type={type}
        inputMode={field.dataType === "NUMBER" ? "decimal" : undefined}
      />
    );
  }
}

function ConfiguredLeadSelect({
  fieldKey: key,
  form,
  options,
  onStageChange,
  inputProps,
}: Pick<Props, "form" | "options" | "onStageChange"> & {
  fieldKey: keyof LeadFormInput;
  inputProps: {
    id: string;
    disabled: boolean;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  };
}) {
  const value = String(form.watch(key) ?? "");
  const choices = selectOptions(key, options);
  return (
    <select
      {...inputProps}
      value={value}
      className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
      onChange={(event) => {
        if (key === "pipelineStageId") onStageChange(event.target.value);
        else
          form.setValue(key, event.target.value, {
            shouldDirty: true,
            shouldValidate: true,
          });
      }}
    >
      <option value="">Chưa chọn</option>
      {value && !choices.some((item) => item.id === value) && (
        <option value={value}>Giá trị hiện tại</option>
      )}
      {choices.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
