import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DashboardPipelineStage, PersonalReportDatasetDefinition, PersonalReportFilterCondition } from "@/modules/reports/report.types";
import { getPersonalReportFilterValues } from "@/services/report.service";

const numberFormatter = new Intl.NumberFormat("vi-VN");

export function ReportFilterEditor({ dataset, conditions, pipelineStages = [], accessToken, onChange }: {
  dataset: PersonalReportDatasetDefinition;
  conditions: PersonalReportFilterCondition[];
  pipelineStages?: DashboardPipelineStage[];
  accessToken: string;
  onChange: (conditions: PersonalReportFilterCondition[]) => void;
}) {
  function addFilter() {
    const field = dataset.filterFields[0];
    if (!field || conditions.length >= 5) return;
    onChange([...conditions, field.type === "DATE"
      ? { fieldKey: field.key, operator: "DATE_PRESET", value: "THIS_MONTH" }
      : { fieldKey: field.key, operator: "EQUALS" }]);
  }
  return <FieldSet>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><FieldLegend variant="label">Bộ lọc dữ liệu</FieldLegend><p className="text-sm text-muted-foreground">Chỉ dữ liệu trong quyền và phạm vi hiện tại mới được tính.</p></div>
      <Button type="button" size="sm" variant="outline" onClick={addFilter} disabled={conditions.length >= 5 || dataset.filterFields.length === 0}><Plus data-icon="inline-start" />Thêm bộ lọc</Button>
    </div>
    {conditions.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Chưa áp dụng bộ lọc.</div> : (
      <div className="flex flex-col gap-3">{conditions.map((condition, index) => (
        <FilterConditionRow
          key={`${condition.fieldKey}-${index}`}
          dataset={dataset}
          condition={condition}
          pipelineStages={pipelineStages}
          accessToken={accessToken}
          onChange={(next) => onChange(conditions.map((item, itemIndex) => itemIndex === index ? next : item))}
          onRemove={() => onChange(conditions.filter((_, itemIndex) => itemIndex !== index))}
        />
      ))}</div>
    )}
  </FieldSet>;
}

function FilterConditionRow({ dataset, condition, pipelineStages, accessToken, onChange, onRemove }: {
  dataset: PersonalReportDatasetDefinition;
  condition: PersonalReportFilterCondition;
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onChange: (condition: PersonalReportFilterCondition) => void;
  onRemove: () => void;
}) {
  const field = dataset.filterFields.find((item) => item.key === condition.fieldKey) ?? dataset.filterFields[0];
  function changeField(fieldKey: string) {
    const nextField = dataset.filterFields.find((item) => item.key === fieldKey)!;
    onChange(nextField.type === "DATE" ? { fieldKey, operator: "DATE_PRESET", value: "THIS_MONTH" } : { fieldKey, operator: "EQUALS" });
  }
  return <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1.2fr_1fr_1.5fr_auto] md:items-end">
    <Field><FieldLabel>Trường thông tin</FieldLabel><Select value={condition.fieldKey} onValueChange={changeField}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.filterFields.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {field?.type === "CATEGORY"
      ? <CategoryConditionFields dataset={dataset} condition={condition} pipelineStages={pipelineStages} accessToken={accessToken} onChange={onChange} />
      : <DateConditionFields condition={condition} onChange={onChange} />}
    <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label={`Xóa bộ lọc ${field?.label ?? ""}`}><Trash2 /></Button>
  </div>;
}

function CategoryConditionFields({ dataset, condition, pipelineStages, accessToken, onChange }: {
  dataset: PersonalReportDatasetDefinition;
  condition: PersonalReportFilterCondition;
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onChange: (condition: PersonalReportFilterCondition) => void;
}) {
  const isPipelineStage = (dataset.key === "LEADS" || dataset.key === "QUALIFIED_LEADS") && condition.fieldKey === "PIPELINE_STAGE";
  const comparesStagePosition = isPipelineStage && condition.operator === "GREATER_THAN_OR_EQUAL";
  const hasMultiplePipelines = new Set(pipelineStages.map((stage) => stage.pipelineId).filter(Boolean)).size > 1;
  const valuesQuery = useQuery({
    queryKey: ["reports", "personal", "filter-values", dataset.key, condition.fieldKey],
    queryFn: () => getPersonalReportFilterValues(dataset.key, condition.fieldKey, accessToken),
    enabled: !comparesStagePosition,
    staleTime: 60_000,
  });

  return <>
    <Field><FieldLabel>Điều kiện</FieldLabel><Select value={condition.operator} onValueChange={(operator) => onChange({ fieldKey: condition.fieldKey, operator: operator as "EQUALS" | "NOT_EQUALS" | "GREATER_THAN_OR_EQUAL" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="EQUALS">Bằng</SelectItem><SelectItem value="NOT_EQUALS">Không bằng</SelectItem>{isPipelineStage && pipelineStages.length > 0 && <SelectItem value="GREATER_THAN_OR_EQUAL">Lớn hơn hoặc bằng (≥)</SelectItem>}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Giá trị</FieldLabel><Select value={condition.value} onValueChange={(value) => onChange({ ...condition, value })}><SelectTrigger className="w-full"><SelectValue placeholder={comparesStagePosition ? "Chọn giai đoạn bắt đầu" : valuesQuery.isLoading ? "Đang tải…" : "Chọn giá trị"} /></SelectTrigger><SelectContent><SelectGroup>{comparesStagePosition
      ? pipelineStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.position != null ? `${stage.position}. ` : ""}{stage.name}{hasMultiplePipelines && stage.pipelineName ? ` · ${stage.pipelineName}` : ""}</SelectItem>)
      : valuesQuery.data?.items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} ({numberFormatter.format(item.count)})</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </>;
}

function DateConditionFields({ condition, onChange }: {
  condition: PersonalReportFilterCondition;
  onChange: (condition: PersonalReportFilterCondition) => void;
}) {
  return <>
    <Field><FieldLabel>Điều kiện</FieldLabel><Select value={condition.operator} onValueChange={(operator) => onChange(operator === "DATE_BETWEEN" ? { fieldKey: condition.fieldKey, operator: "DATE_BETWEEN" } : { fieldKey: condition.fieldKey, operator: "DATE_PRESET", value: "THIS_MONTH" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="DATE_PRESET">Khoảng tương đối</SelectItem><SelectItem value="DATE_BETWEEN">Khoảng tùy chọn</SelectItem></SelectGroup></SelectContent></Select></Field>
    {condition.operator === "DATE_BETWEEN"
      ? <Field><FieldLabel>Khoảng ngày</FieldLabel><DateRangeFilter fromDate={condition.fromDate ?? ""} toDate={condition.toDate ?? ""} onChange={(fromDate, toDate) => onChange({ ...condition, fromDate, toDate })} /></Field>
      : <Field><FieldLabel>Giá trị</FieldLabel><Select value={condition.value} onValueChange={(value) => onChange({ ...condition, value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="LAST_7_DAYS">7 ngày gần nhất</SelectItem><SelectItem value="THIS_WEEK">Tuần này</SelectItem><SelectItem value="LAST_WEEK">Tuần trước</SelectItem><SelectItem value="THIS_MONTH">Tháng này</SelectItem><SelectItem value="LAST_MONTH">Tháng trước</SelectItem><SelectItem value="THIS_QUARTER">Quý này</SelectItem><SelectItem value="LAST_QUARTER">Quý trước</SelectItem></SelectGroup></SelectContent></Select></Field>}
  </>;
}
