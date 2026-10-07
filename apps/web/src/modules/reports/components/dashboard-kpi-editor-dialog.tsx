import { useState } from "react";
import { ClipboardPaste } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterEditor } from "@/modules/reports/components/report-filter-editor";
import type {
  DashboardKpiWidgetInput,
  DashboardKpiWidgetType,
  DashboardPipelineStage,
  PersonalReportDatasetDefinition,
} from "@/modules/reports/report.types";

export function DashboardKpiEditorDialog({ widget, copiedWidget, datasets, pipelineStages, accessToken, onCancel, onSave }: {
  widget: DashboardKpiWidgetInput;
  copiedWidget: DashboardKpiWidgetInput | null;
  datasets: PersonalReportDatasetDefinition[];
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onCancel: () => void;
  onSave: (widget: DashboardKpiWidgetInput) => void;
}) {
  const [draft, setDraft] = useState(widget);
  const dataset = datasets.find((item) => item.key === draft.datasetKey) ?? datasets[0];
  const filterDataset = getFilterDataset(dataset, draft.type);
  const canUseConversion = datasets.some((item) => item.key === "LEADS") && pipelineStages.length >= 2;
  const isValid = isValidDraft(draft, dataset, pipelineStages);

  function changeType(type: DashboardKpiWidgetType) {
    setDraft(nextDraftForType(draft, type, dataset, pipelineStages));
  }

  function changeDataset(datasetKey: DashboardKpiWidgetInput["datasetKey"]) {
    setDraft({ ...draft, datasetKey, conditions: [] });
  }

  function pasteConfiguration() {
    if (!copiedWidget) return;
    setDraft(cloneKpiConfiguration(copiedWidget, widget.id));
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tùy chỉnh ô KPI</DialogTitle>
          <DialogDescription>Chọn loại thống kê và điều kiện riêng cho ô này. Dữ liệu luôn được giới hạn theo quyền của người xem.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel>Loại ô KPI</FieldLabel><Select value={draft.type} onValueChange={(value) => changeType(value as DashboardKpiWidgetType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="COUNT">Tổng số bản ghi</SelectItem>{canUseConversion && <SelectItem value="CONVERSION">Tỷ lệ chuyển đổi tiến trình</SelectItem>}<SelectItem value="TREND">So sánh với kỳ trước</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel>Tiêu đề tùy chỉnh (không bắt buộc)</FieldLabel><Input value={draft.title ?? ""} maxLength={120} placeholder="Để trống để hệ thống tự mô tả" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          </div>

          <DatasetField draft={draft} datasets={datasets} onChange={changeDataset} />
          <ConversionFields draft={draft} pipelineStages={pipelineStages} onChange={setDraft} />
          <ComparisonPeriodField draft={draft} onChange={setDraft} />
          <DashboardFilterEditor draft={draft} dataset={filterDataset} pipelineStages={pipelineStages} accessToken={accessToken} onChange={setDraft} />
        </div>

        <DialogFooter>
          {copiedWidget && <Button type="button" variant="secondary" onClick={pasteConfiguration}><ClipboardPaste data-icon="inline-start" />Dán tùy chỉnh</Button>}
          <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
          <Button type="button" disabled={!isValid} onClick={() => onSave({ ...draft, title: draft.title?.trim() || undefined })}>Áp dụng cho ô</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatasetField({ draft, datasets, onChange }: {
  draft: DashboardKpiWidgetInput;
  datasets: PersonalReportDatasetDefinition[];
  onChange: (datasetKey: DashboardKpiWidgetInput["datasetKey"]) => void;
}) {
  if (draft.type === "CONVERSION") return null;
  return <Field><FieldLabel>Kho dữ liệu</FieldLabel><Select value={draft.datasetKey} onValueChange={(value) => onChange(value as DashboardKpiWidgetInput["datasetKey"])}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{datasets.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

function ConversionFields({ draft, pipelineStages, onChange }: {
  draft: DashboardKpiWidgetInput;
  pipelineStages: DashboardPipelineStage[];
  onChange: (draft: DashboardKpiWidgetInput) => void;
}) {
  if (draft.type !== "CONVERSION") return null;
  const targetStages = getTargetStages(draft.sourceStageId, pipelineStages);
  return <div className="grid gap-4 md:grid-cols-2">
    <Field><FieldLabel>Tiến trình bắt đầu</FieldLabel><Select value={draft.sourceStageId} onValueChange={(sourceStageId) => {
      const target = getTargetStages(sourceStageId, pipelineStages)[0];
      onChange({ ...draft, sourceStageId, targetStageId: target?.id });
    }}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn tiến trình bắt đầu" /></SelectTrigger><SelectContent><SelectGroup>{pipelineStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Tiến trình đích</FieldLabel><Select value={draft.targetStageId} onValueChange={(targetStageId) => onChange({ ...draft, targetStageId })}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn tiến trình đích" /></SelectTrigger><SelectContent><SelectGroup>{targetStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </div>;
}

function ComparisonPeriodField({ draft, onChange }: {
  draft: DashboardKpiWidgetInput;
  onChange: (draft: DashboardKpiWidgetInput) => void;
}) {
  if (draft.type !== "TREND") return null;
  return <Field><FieldLabel>Khoảng thời gian so sánh</FieldLabel><Select value={draft.comparisonPeriod} onValueChange={(comparisonPeriod) => onChange({ ...draft, comparisonPeriod: comparisonPeriod as "WEEK" | "MONTH" | "QUARTER" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="WEEK">Tuần này so với tuần trước</SelectItem><SelectItem value="MONTH">Tháng này so với tháng trước</SelectItem><SelectItem value="QUARTER">Quý này so với quý trước</SelectItem></SelectGroup></SelectContent></Select></Field>;
}

function DashboardFilterEditor({ draft, dataset, pipelineStages, accessToken, onChange }: {
  draft: DashboardKpiWidgetInput;
  dataset: PersonalReportDatasetDefinition | undefined;
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onChange: (draft: DashboardKpiWidgetInput) => void;
}) {
  if (!dataset) return null;
  return <ReportFilterEditor dataset={dataset} conditions={draft.conditions} pipelineStages={pipelineStages} accessToken={accessToken} onChange={(conditions) => onChange({ ...draft, conditions })} />;
}

function getFilterDataset(dataset: PersonalReportDatasetDefinition | undefined, type: DashboardKpiWidgetType) {
  if (!dataset || type !== "TREND") return dataset;
  return { ...dataset, filterFields: dataset.filterFields.filter((field) => field.type === "CATEGORY") };
}

function getTargetStages(sourceStageId: string | undefined, pipelineStages: DashboardPipelineStage[]) {
  const source = pipelineStages.find((stage) => stage.id === sourceStageId);
  if (!source) return [];
  return pipelineStages.filter((stage) => stage.pipelineId === source.pipelineId
    && (stage.position ?? Number.MAX_SAFE_INTEGER) > (source.position ?? Number.MAX_SAFE_INTEGER));
}

function nextDraftForType(
  draft: DashboardKpiWidgetInput,
  type: DashboardKpiWidgetType,
  dataset: PersonalReportDatasetDefinition | undefined,
  pipelineStages: DashboardPipelineStage[],
) {
  if (type === "CONVERSION") {
    const source = pipelineStages[0];
    const target = getTargetStages(source?.id, pipelineStages)[0];
    return { ...draft, type, datasetKey: "LEADS" as const, sourceStageId: source?.id, targetStageId: target?.id, comparisonPeriod: undefined };
  }
  return {
    ...draft,
    type,
    sourceStageId: undefined,
    targetStageId: undefined,
    comparisonPeriod: type === "TREND" ? (draft.comparisonPeriod ?? "MONTH") : undefined,
    conditions: type === "TREND" ? draft.conditions.filter((condition) => dataset?.filterFields.find((field) => field.key === condition.fieldKey)?.type === "CATEGORY") : draft.conditions,
  };
}

function isValidDraft(
  draft: DashboardKpiWidgetInput,
  dataset: PersonalReportDatasetDefinition | undefined,
  pipelineStages: DashboardPipelineStage[],
) {
  return Boolean(dataset && validConditions(draft, pipelineStages)
    && (draft.type !== "CONVERSION" || (draft.sourceStageId && draft.targetStageId && draft.sourceStageId !== draft.targetStageId)));
}

function validConditions(widget: DashboardKpiWidgetInput, pipelineStages: DashboardPipelineStage[]) {
  return widget.conditions.every((condition) => {
    if (condition.operator === "EQUALS" || condition.operator === "NOT_EQUALS") return Boolean(condition.value);
    if (condition.operator === "GREATER_THAN_OR_EQUAL") {
      return (widget.datasetKey === "LEADS" || widget.datasetKey === "QUALIFIED_LEADS")
        && condition.fieldKey === "PIPELINE_STAGE"
        && pipelineStages.some((stage) => stage.id === condition.value);
    }
    if (condition.operator === "DATE_PRESET") return Boolean(condition.value);
    return Boolean(condition.fromDate && condition.toDate && condition.toDate >= condition.fromDate);
  });
}

function cloneKpiConfiguration(widget: DashboardKpiWidgetInput, id: string): DashboardKpiWidgetInput {
  return { ...widget, id, conditions: widget.conditions.map((condition) => ({ ...condition })) };
}
