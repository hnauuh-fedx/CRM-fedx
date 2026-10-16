import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeMarketingFormOptions,
  type MarketingFormOption,
} from "@admission-crm/shared/marketing-form-config";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  getFieldDependency,
  optionFieldTypes,
  setFieldDependency,
} from "./marketing-form-editor-config";
import { MarketingFormReferencePicker } from "./marketing-form-reference-picker";
import type {
  MarketingFormFieldType,
  MarketingFormInput,
} from "./marketing-reference.types";

export function ChoiceOptionsEditor({
  index,
  form,
  fieldType,
}: {
  index: number;
  form: UseFormReturn<MarketingFormInput>;
  fieldType: MarketingFormFieldType;
}) {
  const fields = form.watch("fields");
  const options = normalizeMarketingFormOptions(
    form.watch(`fields.${index}.options`),
  );
  const mapping =
    form.watch(`fields.${index}.crmMappingField`) ??
    form.watch(`fields.${index}.leadField`);
  const referenceTarget =
    mapping === "major_id" || mapping === "source_id" ? mapping : null;
  const defaultValue = form.watch(`fields.${index}.defaultValue`) ?? "";
  const validationRules = form.watch(`fields.${index}.validationRules`) ?? {};
  const dependency = getFieldDependency(validationRules);
  const dependencyParent = fields.find(
    (field) => field.fieldKey === dependency?.parentFieldKey,
  );
  const parentChoices = fields.filter(
    (field, fieldIndex) =>
      fieldIndex !== index &&
      Boolean(field.fieldKey) &&
      optionFieldTypes.has(field.fieldType) &&
      field.options.length > 0,
  );
  const supportsMultipleDefaults =
    fieldType === "checkbox" || fieldType === "multi_select";
  const defaultValues = defaultValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selectedDefaults = new Set(defaultValues);
  const valueByLabel = new Map<string, string>();
  const labelByValue = new Map<string, string>();
  for (const option of options) {
    if (!valueByLabel.has(option.label))
      valueByLabel.set(option.label, option.value);
    if (!labelByValue.has(option.value))
      labelByValue.set(option.value, option.label);
  }

  function setOptions(nextOptions: MarketingFormOption[]) {
    form.setValue(`fields.${index}.options`, nextOptions, {
      shouldDirty: true,
      shouldValidate: true,
    });
    const validDefaults = defaultValues.filter((value) =>
      nextOptions.some((option) => option.value === value),
    );
    form.setValue(`fields.${index}.defaultValue`, validDefaults.join(", "), {
      shouldDirty: true,
    });
  }

  function updateOption(optionIndex: number, value: string) {
    const nextOptions = options.map((option, currentIndex) =>
      currentIndex === optionIndex ? { ...option, label: value } : option,
    );
    form.setValue(`fields.${index}.options`, nextOptions, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function addOption(afterIndex?: number) {
    const nextLabel = `Lựa chọn ${options.length + 1}`;
    const insertAt = afterIndex === undefined ? options.length : afterIndex + 1;
    setOptions([
      ...options.slice(0, insertAt),
      { value: crypto.randomUUID(), label: nextLabel },
      ...options.slice(insertAt),
    ]);
  }

  function removeOption(optionIndex: number) {
    setOptions(
      options.filter((_, currentIndex) => currentIndex !== optionIndex),
    );
  }

  function moveOption(optionIndex: number, direction: -1 | 1) {
    const nextIndex = optionIndex + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    const nextOptions = [...options];
    [nextOptions[optionIndex], nextOptions[nextIndex]] = [
      nextOptions[nextIndex],
      nextOptions[optionIndex],
    ];
    setOptions(nextOptions);
  }

  function toggleDefault(value: string) {
    if (!value.trim()) return;
    if (!supportsMultipleDefaults) {
      form.setValue(
        `fields.${index}.defaultValue`,
        defaultValue === value ? "" : value,
        { shouldDirty: true },
      );
      return;
    }
    const nextDefaults = defaultValues.includes(value)
      ? defaultValues.filter((item) => item !== value)
      : [...defaultValues, value];
    form.setValue(`fields.${index}.defaultValue`, nextDefaults.join(", "), {
      shouldDirty: true,
    });
  }

  function replaceFromBulk(value: string) {
    // Bulk input only adds new choices; renaming/removing uses the stable row controls.
    const labels = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    setOptions([
      ...options,
      ...labels
        .filter((label) => !options.some((option) => option.label === label))
        .map((label) => ({ value: crypto.randomUUID(), label })),
    ]);
  }

  function setDependencyParent(parentFieldKey: string) {
    if (parentFieldKey === "__none__") {
      setFieldDependency(form, index, null);
      return;
    }
    const parent = fields.find((field) => field.fieldKey === parentFieldKey);
    const nextMap: Record<string, string[]> = {};
    for (const option of normalizeMarketingFormOptions(parent?.options)) {
      nextMap[option.value] =
        dependency?.optionMap[option.value] ??
        options.map((item) => item.value);
    }
    setFieldDependency(form, index, { parentFieldKey, optionMap: nextMap });
  }

  function setDependentOptions(parentOption: string, value: string) {
    if (!dependency) return;
    setFieldDependency(form, index, {
      parentFieldKey: dependency.parentFieldKey,
      optionMap: {
        ...dependency.optionMap,
        [parentOption]: value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((label) => valueByLabel.get(label) ?? label),
      },
    });
  }

  function copyBaseOptionsToParent(parentOption: string) {
    if (!dependency) return;
    setFieldDependency(form, index, {
      parentFieldKey: dependency.parentFieldKey,
      optionMap: {
        ...dependency.optionMap,
        [parentOption]: options.map((option) => option.value),
      },
    });
  }

  return (
    <section className="col-span-full min-w-0 rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold">Cấu hình lựa chọn</h4>
          <p className="text-xs text-muted-foreground">
            Tùy chỉnh từng option, đặt mặc định và sắp xếp thứ tự hiển thị trên
            public form.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(referenceTarget)}
          onClick={() => addOption()}
        >
          <Plus aria-hidden="true" />
          Thêm lựa chọn
        </Button>
      </div>
      <div className="grid gap-3 p-4">
        {referenceTarget && (
          <MarketingFormReferencePicker
            key={referenceTarget}
            target={referenceTarget}
            fieldKey={form.watch(`fields.${index}.fieldKey`)}
            selected={options.map((option) => option.value)}
            onAdd={(option) => setOptions([...options, option])}
          />
        )}
        <FieldError
          errors={[
            form.formState.errors.fields?.[index]?.options,
            form.formState.errors.fields?.[index]?.defaultValue,
            form.formState.errors.fields?.[index]?.validationRules,
          ]}
        />
        {options.length === 0 && (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có lựa chọn. Bấm thêm lựa chọn để bắt đầu cấu hình.
          </div>
        )}
        {options.map((option, optionIndex) => {
          const optionId = `marketing-field-${index}-option-${optionIndex}`;
          const defaultChecked = selectedDefaults.has(option.value);
          return (
            <ChoiceOptionRow
              key={option.value}
              option={option}
              optionId={optionId}
              optionIndex={optionIndex}
              updateOption={updateOption}
              defaultChecked={defaultChecked}
              toggleDefault={toggleDefault}
              moveOption={moveOption}
              options={options}
              referenceTarget={referenceTarget}
              addOption={addOption}
              removeOption={removeOption}
            />
          );
        })}
        <Field>
          <FieldLabel htmlFor={`marketing-field-options-bulk-${index}`}>
            Thêm nhanh lựa chọn (mỗi dòng một nhãn)
          </FieldLabel>
          <Textarea
            id={`marketing-field-options-bulk-${index}`}
            rows={3}
            defaultValue=""
            disabled={Boolean(referenceTarget)}
            onBlur={(event) => {
              replaceFromBulk(event.target.value);
              event.target.value = "";
            }}
            placeholder={
              "Mỗi dòng một lựa chọn\nVí dụ: THPT\nCao đẳng\nĐại học"
            }
          />
        </Field>
        <ChoiceDependencySettings
          index={index}
          dependency={dependency}
          setDependencyParent={setDependencyParent}
          parentChoices={parentChoices}
          dependencyParent={dependencyParent}
          copyBaseOptionsToParent={copyBaseOptionsToParent}
          labelByValue={labelByValue}
          setDependentOptions={setDependentOptions}
        />
      </div>
    </section>
  );
}

type ChoiceDependencySettingsProps = {
  index: number;
  dependency:
    | import("./marketing-form-editor-config").FieldDependencyConfig
    | null;
  setDependencyParent: (parentFieldKey: string) => void;
  parentChoices: import("./marketing-reference.types").MarketingFormField[];
  dependencyParent:
    | import("./marketing-reference.types").MarketingFormField
    | undefined;
  copyBaseOptionsToParent: (parentOption: string) => void;
  labelByValue: Map<string, string>;
  setDependentOptions: (parentOption: string, value: string) => void;
};

function ChoiceDependencySettings({
  index,
  dependency,
  setDependencyParent,
  parentChoices,
  dependencyParent,
  copyBaseOptionsToParent,
  labelByValue,
  setDependentOptions,
}: ChoiceDependencySettingsProps) {
  return (
    <section className="rounded-md border bg-muted/20">
      <div className="border-b px-4 py-3">
        <h4 className="text-sm font-semibold">Câu hỏi liên quan</h4>
        <p className="text-xs text-muted-foreground">
          Dùng khi option của câu hỏi này thay đổi theo câu hỏi khác, ví dụ
          trình độ học vấn phụ thuộc ngành học.
        </p>
      </div>
      <div className="grid gap-3 p-4">
        <Field>
          <FieldLabel htmlFor={`marketing-field-dependency-parent-${index}`}>
            Câu hỏi cha
          </FieldLabel>
          <Select
            value={dependency?.parentFieldKey ?? "__none__"}
            onValueChange={setDependencyParent}
          >
            <SelectTrigger
              id={`marketing-field-dependency-parent-${index}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__none__">Không phụ thuộc</SelectItem>
                {parentChoices.map((field) => (
                  <SelectItem key={field.fieldKey} value={field.fieldKey}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {dependency && dependencyParent && (
          <div className="grid gap-3">
            {normalizeMarketingFormOptions(dependencyParent.options).map(
              (parentOption) => (
                <Field key={parentOption.value}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <FieldLabel
                      htmlFor={`marketing-field-${index}-dependency-${parentOption.value}`}
                    >
                      Khi chọn: {parentOption.label}
                    </FieldLabel>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyBaseOptionsToParent(parentOption.value)
                      }
                    >
                      Sao chép lựa chọn mặc định
                    </Button>
                  </div>
                  <Textarea
                    id={`marketing-field-${index}-dependency-${parentOption.value}`}
                    rows={3}
                    value={(dependency.optionMap[parentOption.value] ?? [])
                      .map((value) => labelByValue.get(value) ?? value)
                      .join("\n")}
                    onChange={(event) =>
                      setDependentOptions(
                        parentOption.value,
                        event.target.value,
                      )
                    }
                    placeholder={`Mỗi dòng một lựa chọn cho ${parentOption.label}`}
                  />
                </Field>
              ),
            )}
          </div>
        )}
        {dependency && !dependencyParent && (
          <p role="alert" className="text-sm text-destructive">
            Câu hỏi cha không còn tồn tại hoặc không có lựa chọn.
          </p>
        )}
      </div>
    </section>
  );
}

type ChoiceOptionRowProps = {
  option: { value: string; label: string };
  optionId: string;
  optionIndex: number;
  updateOption: (optionIndex: number, value: string) => void;
  defaultChecked: boolean;
  toggleDefault: (value: string) => void;
  moveOption: (optionIndex: number, direction: -1 | 1) => void;
  options: { value: string; label: string }[];
  referenceTarget: "source_id" | "major_id" | null;
  addOption: (afterIndex?: number) => void;
  removeOption: (optionIndex: number) => void;
};

function ChoiceOptionRow({
  option,
  optionId,
  optionIndex,
  updateOption,
  defaultChecked,
  toggleDefault,
  moveOption,
  options,
  referenceTarget,
  addOption,
  removeOption,
}: ChoiceOptionRowProps) {
  return (
    <div
      key={option.value}
      className="grid min-w-0 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 [&>*]:min-w-0"
    >
      <Field>
        <FieldLabel htmlFor={optionId}>
          Tên lựa chọn {optionIndex + 1}
        </FieldLabel>
        <Input
          id={optionId}
          value={option.label}
          onChange={(event) => updateOption(optionIndex, event.target.value)}
          placeholder="Nhập nội dung lựa chọn"
        />
      </Field>
      <Field>
        <FieldLabel>Giá trị lưu</FieldLabel>
        <Input
          readOnly
          value={option.value}
          aria-label={`Giá trị lưu lựa chọn ${optionIndex + 1}`}
        />
      </Field>
      <label className="flex min-h-10 items-end gap-2 pb-2 text-sm">
        <Checkbox
          checked={defaultChecked}
          disabled={!option.label.trim()}
          onCheckedChange={() => toggleDefault(option.value)}
        />
        Mặc định
      </label>
      <div className="flex items-end justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={optionIndex === 0}
          onClick={() => moveOption(optionIndex, -1)}
          aria-label={`Đưa lựa chọn ${optionIndex + 1} lên`}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={optionIndex === options.length - 1}
          onClick={() => moveOption(optionIndex, 1)}
          aria-label={`Đưa lựa chọn ${optionIndex + 1} xuống`}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={Boolean(referenceTarget)}
          onClick={() => addOption(optionIndex)}
          aria-label={`Thêm lựa chọn sau dòng ${optionIndex + 1}`}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => removeOption(optionIndex)}
          aria-label={`Xóa lựa chọn ${optionIndex + 1}`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
