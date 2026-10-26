import { useMemo } from "react";

import { GroupedFieldPicker, type GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import type { AutomationDataField } from "../../automation.types";

type AutomationFieldPickerProps = {
  labelId?: string;
  invalid?: boolean;
  errorId?: string;
  fields: AutomationDataField[];
  selectedReference?: string;
  placeholder: string;
  onSelect: (field: AutomationDataField) => void;
};

export function AutomationFieldPicker({ fields, selectedReference, placeholder, onSelect, labelId, invalid, errorId }: AutomationFieldPickerProps) {
  const options = useMemo<GroupedFieldOption[]>(() => fields.map((field) => ({
    value: field.reference,
    label: field.label,
    groupKey: field.groupKey,
    groupLabel: field.groupLabel,
    description: field.key,
    badge: field.source === "custom" ? "Tùy chỉnh" : field.dataType,
    disabled: Boolean(field.readOnlyReason),
    disabledReason: field.readOnlyReason,
  })), [fields]);

  return (
    <GroupedFieldPicker
      value={selectedReference}
      options={options}
      placeholder={placeholder}
      onChange={(reference) => {
        const field = fields.find((item) => item.reference === reference);
        if (field) onSelect(field);
      }}
      className="h-auto min-h-11 py-2"
      triggerData={{ "data-automation-field-picker": "" }}
      aria-labelledby={labelId}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
    />
  );
}
