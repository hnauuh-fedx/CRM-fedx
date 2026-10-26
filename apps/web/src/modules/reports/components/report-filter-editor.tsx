import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { getLeadFieldGroup, leadFieldGroupOrder } from "@admission-crm/shared/lead-field-groups";
import {
  isLegacyReportOperator,
  reconcileReportFilterRows,
  type ReportFilterRow,
  type ReportFilterRows,
} from "./report-filter-rows";

import { GroupedFieldPicker, type GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadFilterConditionValue } from "@/modules/leads/components/lead-filter-condition-value";
import type { FilterConditionState, FilterOperator } from "@/modules/leads/filter-fields";
import { getOperatorLabel, OPERATORS_BY_DATA_TYPE, operatorNeedsValueInput } from "@/modules/leads/filter-operators";
import type {
  DashboardPipelineStage,
  PersonalReportDatasetDefinition,
  PersonalReportDatasetField,
  PersonalReportFilterCondition,
} from "@/modules/reports/report.types";
import { getPersonalReportFilterValues } from "@/services/report.service";

const numberFormatter = new Intl.NumberFormat("vi-VN");

type ReportFilterEditorProps = {
  dataset: PersonalReportDatasetDefinition;
  conditions: PersonalReportFilterCondition[];
  pipelineStages?: DashboardPipelineStage[];
  accessToken: string;
  onChange: (conditions: PersonalReportFilterCondition[]) => void;
};

export function ReportFilterEditor({
  dataset,
  conditions,
  pipelineStages = [],
  accessToken,
  onChange,
}: ReportFilterEditorProps) {
  const [rowModel, setRowModel] = useState<ReportFilterRows>(() =>
    reconcileReportFilterRows({ source: [], rows: [], nextId: 0 }, conditions),
  );
  if (rowModel.source !== conditions)
    setRowModel(reconcileReportFilterRows(rowModel, conditions));
  function commitRows(rows: ReportFilterRow[]) {
    const source = rows.map((row) => row.condition);
    setRowModel({ source, rows, nextId: rowModel.nextId });
    onChange(source);
  }
  function addFilter() {
    const field = dataset.filterFields[0];
    if (!field || conditions.length >= 5) return;
    onChange([...conditions, defaultReportCondition(field)]);
  }
  return (
    <FieldSet>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLegend variant="label">Bộ lọc dữ liệu</FieldLegend>
          <p className="text-sm text-muted-foreground">
            Chỉ dữ liệu trong quyền và phạm vi hiện tại mới được tính.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addFilter}
          disabled={conditions.length >= 5 || dataset.filterFields.length === 0}
        >
          <Plus data-icon="inline-start" />
          Thêm bộ lọc
        </Button>
      </div>
      {conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Chưa áp dụng bộ lọc.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rowModel.rows.map((row) => (
            <FilterConditionRow
              key={row.id}
              dataset={dataset}
              condition={row.condition}
              pipelineStages={pipelineStages}
              accessToken={accessToken}
              onChange={(next) =>
                commitRows(
                  rowModel.rows.map((item) =>
                    item.id === row.id ? { ...item, condition: next } : item,
                  ),
                )
              }
              onRemove={() =>
                commitRows(rowModel.rows.filter((item) => item.id !== row.id))
              }
            />
          ))}
        </div>
      )}
    </FieldSet>
  );
}

/** Report dimensions mapped to the Lead form cluster holding the same data. */
const reportFieldLeadKeys: Record<string, string> = {
  SOURCE: "sourceId",
  CREATED_DATE: "createdAt",
  ASSIGNEE: "assigneeId",
  PIPELINE_STAGE: "pipelineStageId",
  MAJOR: "majorId",
};

/** Report fields grouped by Lead form cluster; also used by the report output pickers. */
export function toReportFieldOptions(
  dataset: PersonalReportDatasetDefinition,
  fields: Array<{ key: string; label: string }> = dataset.filterFields,
): GroupedFieldOption[] {
  return fields
    .map((item, index) => {
      const leadKey = item.key.startsWith("LEAD:") ? item.key.slice(5) : reportFieldLeadKeys[item.key] ?? "";
      const group = getLeadFieldGroup(leadKey) ?? { id: `dataset:${dataset.key}`, label: dataset.label };
      return { option: { value: item.key, label: item.label, groupKey: group.id, groupLabel: group.label }, index };
    })
    .sort((left, right) => leadFieldGroupOrder(left.option.groupKey) - leadFieldGroupOrder(right.option.groupKey) || left.index - right.index)
    .map(({ option }) => option);
}

type FilterConditionRowProps = {
  dataset: PersonalReportDatasetDefinition;
  condition: PersonalReportFilterCondition;
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onChange: (condition: PersonalReportFilterCondition) => void;
  onRemove: () => void;
};

/** Labels of operators kept only so saved reports still display their filter. */
const legacyOperatorLabels: Record<string, string> = {
  DATE_PRESET: "Khoảng tương đối",
  DATE_BETWEEN: "Khoảng tùy chọn",
  IS_NOT_EMPTY: "Có giá trị",
  IS_EMPTY: "Không có giá trị",
  LESS_THAN_OR_EQUAL: "Đến giai đoạn (≤)",
};
const stagePositionOperator = "GREATER_THAN_OR_EQUAL";
const legacyDatePresets = [
  ["LAST_7_DAYS", "7 ngày gần nhất"], ["THIS_WEEK", "Tuần này"], ["LAST_WEEK", "Tuần trước"],
  ["THIS_MONTH", "Tháng này"], ["LAST_MONTH", "Tháng trước"], ["THIS_QUARTER", "Quý này"], ["LAST_QUARTER", "Quý trước"],
] as const;

/** Default condition of a field: dates start at "this month", other fields at "equals". */
export function defaultReportCondition(field: PersonalReportDatasetField): PersonalReportFilterCondition {
  return field.filterType === "date"
    ? { fieldKey: field.key, operator: "IS_THIS_MONTH" }
    : { fieldKey: field.key, operator: "EQUALS" };
}

function FilterConditionRow({
  dataset,
  condition,
  pipelineStages,
  accessToken,
  onChange,
  onRemove,
}: FilterConditionRowProps) {
  const { selectedProgramId } = useInstitutionProgram();
  const field =
    dataset.filterFields.find((item) => item.key === condition.fieldKey) ??
    dataset.filterFields[0];
  const fieldPickerId = useId();
  const operatorId = useId();
  const filterType = field?.filterType ?? (field?.type === "DATE" ? "date" : "enum");
  const isPipelineStage =
    (dataset.key === "LEADS" || dataset.key === "QUALIFIED_LEADS") &&
    condition.fieldKey === "PIPELINE_STAGE";
  const comparesStagePosition =
    isPipelineStage && (condition.operator === stagePositionOperator || condition.operator === "LESS_THAN_OR_EQUAL");
  const legacy = isLegacyReportOperator(condition.operator);
  const operators: string[] = [
    ...OPERATORS_BY_DATA_TYPE[filterType],
    ...(isPipelineStage && pipelineStages.length > 0 ? [stagePositionOperator] : []),
  ];
  if (!operators.includes(condition.operator)) operators.push(condition.operator);
  // Distinct values of the field within the viewer's scope, for list-type fields.
  const valuesQuery = useQuery({
    queryKey: ["reports", "personal", "filter-values", selectedProgramId, dataset.key, condition.fieldKey],
    queryFn: () => getPersonalReportFilterValues(dataset.key, condition.fieldKey, accessToken),
    enabled: field?.type === "CATEGORY" && filterType === "enum" && !comparesStagePosition,
    staleTime: 60_000,
  });
  const hasMultiplePipelines =
    new Set(pipelineStages.map((stage) => stage.pipelineId).filter(Boolean)).size > 1;

  function changeOperator(operator: string) {
    const next = operator as PersonalReportFilterCondition["operator"];
    // Keep the typed value when both operators use the same single input (e.g. Chứa → Là).
    const singleInput = (item: string) => !["BETWEEN", "IS_X_DAYS_AGO", stagePositionOperator].includes(item) && !isLegacyReportOperator(item);
    const keepValue = singleInput(next) && singleInput(condition.operator);
    onChange({ fieldKey: condition.fieldKey, operator: next, ...(keepValue && condition.value ? { value: condition.value } : {}) });
  }

  const valueState: FilterConditionState = {
    id: condition.fieldKey,
    field: condition.fieldKey,
    operator: legacy || comparesStagePosition ? null : (condition.operator as FilterOperator),
    value: filterType === "number" && condition.value ? Number(condition.value) : condition.value ?? null,
    valueTo: filterType === "number" && condition.valueTo ? Number(condition.valueTo) : condition.valueTo ?? null,
    numberValue: condition.numberValue ?? null,
  };
  const valueField = {
    label: field?.label ?? "",
    dataType: filterType,
    options: (valuesQuery.data?.items ?? []).map((item) => ({
      value: item.value,
      label: `${item.label} (${numberFormatter.format(item.count)})`,
    })),
  };
  const asText = (value: unknown) => (value === null || value === undefined || value === "" ? undefined : String(value));
  function changeValue(patch: Partial<FilterConditionState>) {
    onChange({
      ...condition,
      ...("value" in patch ? { value: asText(patch.value) } : {}),
      ...("valueTo" in patch ? { valueTo: asText(patch.valueTo) } : {}),
      ...("numberValue" in patch ? { numberValue: patch.numberValue ?? undefined } : {}),
    });
  }

  const needsValue = comparesStagePosition
    || condition.operator === "DATE_PRESET"
    || condition.operator === "DATE_BETWEEN"
    || (!legacy && operatorNeedsValueInput(condition.operator as FilterOperator));

  return (
    <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1.2fr_1fr_1.5fr_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor={fieldPickerId}>Trường thông tin</FieldLabel>
        <GroupedFieldPicker
          id={fieldPickerId}
          value={condition.fieldKey}
          options={toReportFieldOptions(dataset)}
          onChange={(fieldKey) => {
            const nextField = dataset.filterFields.find((item) => item.key === fieldKey);
            if (nextField) onChange(defaultReportCondition(nextField));
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={operatorId}>Điều kiện</FieldLabel>
        <Select value={condition.operator} onValueChange={changeOperator}>
          <SelectTrigger id={operatorId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {operator === stagePositionOperator
                  ? "Từ giai đoạn trở đi (≥)"
                  : legacyOperatorLabels[operator] ?? getOperatorLabel(operator as FilterOperator, filterType)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {needsValue ? (
        <Field>
          <FieldLabel>Giá trị</FieldLabel>
          {comparesStagePosition ? (
            <Select value={condition.value} onValueChange={(value) => onChange({ ...condition, value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn giai đoạn bắt đầu" />
              </SelectTrigger>
              <SelectContent>
                {pipelineStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.position != null ? `${stage.position}. ` : ""}
                    {stage.name}
                    {hasMultiplePipelines && stage.pipelineName ? ` · ${stage.pipelineName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : condition.operator === "DATE_BETWEEN" ? (
            <DateRangeFilter
              fromDate={condition.fromDate ?? ""}
              toDate={condition.toDate ?? ""}
              onChange={(fromDate, toDate) => onChange({ ...condition, fromDate, toDate })}
            />
          ) : condition.operator === "DATE_PRESET" ? (
            <Select value={condition.value} onValueChange={(value) => onChange({ ...condition, value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {legacyDatePresets.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <LeadFilterConditionValue
              condition={valueState}
              fieldDef={valueField}
              onChange={changeValue}
              className="sm:w-full"
            />
          )}
        </Field>
      ) : (
        <p className="flex min-h-9 items-center text-sm text-muted-foreground md:self-end">
          Không cần nhập giá trị
        </p>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onRemove}
        aria-label={`Xóa bộ lọc ${field?.label ?? ""}`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
