import { useMemo } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GroupedFieldPicker, type GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LeadFilterConditionValue } from "./lead-filter-condition-value";
import type { FilterCombinator, FilterConditionState, FilterFieldDefinition, FilterOperator } from "@/modules/leads/filter-fields";
import { findFieldDefinition } from "@/modules/leads/filter-fields";
import { getFieldOperators, getOperatorLabel, INTEGER_VALUE_OPERATORS } from "@/modules/leads/filter-operators";

/** 1 dòng điều kiện: [🗑] [Và:|Hoặc:] [Trường] [Điều kiện] [Giá trị] [⋯] */
export function LeadFilterConditionRow({
  index,
  condition,
  availableFields,
  onChange,
  onRemove,
  onAddCondition,
  canAddMore,
}: {
  index: number;
  condition: FilterConditionState;
  availableFields: FilterFieldDefinition[];
  onChange: (patch: Partial<FilterConditionState>) => void;
  onRemove: () => void;
  onAddCondition: (combinator: FilterCombinator) => void;
  canAddMore: boolean;
}) {
  const fieldDef = findFieldDefinition(availableFields, condition.field);
  const operators: FilterOperator[] = getFieldOperators(fieldDef);
  const rowNumber = index + 1;
  const fieldOptions = useMemo<GroupedFieldOption[]>(() => availableFields.map((field) => ({
    value: field.key,
    label: field.label,
    groupKey: field.groupKey,
    groupLabel: field.group,
  })), [availableFields]);

  function changeField(fieldKey: string) {
    const nextField = findFieldDefinition(availableFields, fieldKey);
    const keepOperator = Boolean(condition.operator && getFieldOperators(nextField).includes(condition.operator));
    // Đổi trường khác kiểu dữ liệu thì giá trị cũ không còn ý nghĩa.
    const sameType = nextField?.dataType === fieldDef?.dataType && nextField?.dataType !== "enum";
    onChange({
      field: fieldKey,
      operator: keepOperator ? condition.operator : null,
      ...(keepOperator && sameType ? {} : { value: null, valueTo: null, numberValue: null }),
    });
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2", index > 0 && "sm:ml-6")}
      role="group"
      aria-label={`Điều kiện lọc ${rowNumber}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        aria-label={`Xóa điều kiện ${rowNumber}`}
      >
        <Trash2 aria-hidden="true" />
      </Button>

      {index > 0 ? (
        <Select value={condition.combinator ?? "AND"} onValueChange={(next) => onChange({ combinator: next as FilterCombinator })}>
          <SelectTrigger size="sm" className="w-24 bg-background" aria-label={`Phép nối của điều kiện ${rowNumber}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">Và:</SelectItem>
            <SelectItem value="OR">Hoặc:</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      <GroupedFieldPicker
        size="sm"
        className="sm:w-48"
        value={condition.field}
        options={fieldOptions}
        onChange={changeField}
        placeholder="Chọn trường lọc"
        aria-label={`Trường lọc của điều kiện ${rowNumber}`}
      />

      <Select
        value={condition.operator ?? undefined}
        disabled={!fieldDef}
        onValueChange={(next) => {
          const operator = next as FilterOperator;
          // Giữ giá trị khi chuyển giữa các toán tử dùng cùng kiểu ô nhập (vd: Chứa → Bằng).
          const resetsValue = (item: FilterOperator) => item === "BETWEEN" || INTEGER_VALUE_OPERATORS.has(item);
          const keepValue = condition.operator !== null && !resetsValue(operator) && !resetsValue(condition.operator);
          onChange({ operator, ...(keepValue ? {} : { value: null, valueTo: null, numberValue: null }) });
        }}
      >
        <SelectTrigger className="h-9 w-full bg-background sm:w-40" aria-label={`Điều kiện của dòng ${rowNumber}`}>
          <SelectValue placeholder={fieldDef ? "Chọn điều kiện" : "Chọn trường trước"} />
        </SelectTrigger>
        <SelectContent>
          {operators.map((operator) => (
            <SelectItem key={operator} value={operator}>{getOperatorLabel(operator, fieldDef?.dataType)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {fieldDef && condition.operator ? (
        <div className="w-full sm:w-auto [&_button]:bg-background [&_input]:bg-background">
          <LeadFilterConditionValue condition={condition} fieldDef={fieldDef} onChange={onChange} />
        </div>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-8 text-primary"
            disabled={!canAddMore}
            aria-label={`Thêm điều kiện so sánh với điều kiện ${rowNumber}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAddCondition("AND")}>Thêm điều kiện "Và"</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAddCondition("OR")}>Thêm điều kiện "Hoặc"</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
