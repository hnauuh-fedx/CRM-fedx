import { useState } from "react";

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

export function DashboardKpiEditorDialog({ widget, datasets, pipelineStages, accessToken, onCancel, onSave }: {
  widget: DashboardKpiWidgetInput;
  datasets: PersonalReportDatasetDefinition[];
  pipelineStages: DashboardPipelineStage[];
  accessToken: string;
  onCancel: () => void;
  onSave: (widget: DashboardKpiWidgetInput) => void;
}) {
  const [draft, setDraft] = useState(widget);
  const dataset = datasets.find((item) => item.key === draft.datasetKey) ?? datasets[0];
  const filterDataset = dataset && draft.type === "TREND"
    ? { ...dataset, filterFields: dataset.filterFields.filter((field) => field.type === "CATEGORY") }
    : dataset;
  const sourceStage = pipelineStages.find((stage) => stage.id === draft.sourceStageId);
  const targetStages = sourceStage
    ? pipelineStages.filter((stage) => stage.pipelineId === sourceStage.pipelineId && (stage.position ?? Number.MAX_SAFE_INTEGER) > (sourceStage.position ?? Number.MAX_SAFE_INTEGER))
    : [];
  const canUseConversion = datasets.some((item) => item.key === "LEADS") && pipelineStages.length >= 2;
  const isValid = Boolean(dataset && validConditions(draft)
    && (draft.type !== "CONVERSION" || (draft.sourceStageId && draft.targetStageId && draft.sourceStageId !== draft.targetStageId)));

  function changeType(type: DashboardKpiWidgetType) {
    if (type === "CONVERSION") {
      const source = pipelineStages[0];
      const target = pipelineStages.find((stage) => stage.pipelineId === source?.pipelineId && (stage.position ?? 0) > (source?.position ?? 0));
      setDraft({ ...draft, type, datasetKey: "LEADS", sourceStageId: source?.id, targetStageId: target?.id, comparisonPeriod: undefined });
      return;
    }
    setDraft({
      ...draft,
      type,
      sourceStageId: undefined,
      targetStageId: undefined,
      comparisonPeriod: type === "TREND" ? (draft.comparisonPeriod ?? "MONTH") : undefined,
      conditions: type === "TREND" ? draft.conditions.filter((condition) => dataset?.filterFields.find((field) => field.key === condition.fieldKey)?.type === "CATEGORY") : draft.conditions,
    });
  }

  function changeDataset(datasetKey: DashboardKpiWidgetInput["datasetKey"]) {
    setDraft({ ...draft, datasetKey, conditions: [] });
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

          {draft.type !== "CONVERSION" && <Field><FieldLabel>Kho dữ liệu</FieldLabel><Select value={draft.datasetKey} onValueChange={(value) => changeDataset(value as DashboardKpiWidgetInput["datasetKey"])}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{datasets.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}

          {draft.type === "CONVERSION" && <div className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel>Tiến trình bắt đầu</FieldLabel><Select value={draft.sourceStageId} onValueChange={(sourceStageId) => {
              const source = pipelineStages.find((stage) => stage.id === sourceStageId);
              const target = pipelineStages.find((stage) => stage.pipelineId === source?.pipelineId && (stage.position ?? 0) > (source?.position ?? 0));
              setDraft({ ...draft, sourceStageId, targetStageId: target?.id });
            }}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn tiến trình bắt đầu" /></SelectTrigger><SelectContent><SelectGroup>{pipelineStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel>Tiến trình đích</FieldLabel><Select value={draft.targetStageId} onValueChange={(targetStageId) => setDraft({ ...draft, targetStageId })}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn tiến trình đích" /></SelectTrigger><SelectContent><SelectGroup>{targetStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          </div>}

          {draft.type === "TREND" && <Field><FieldLabel>Khoảng thời gian so sánh</FieldLabel><Select value={draft.comparisonPeriod} onValueChange={(comparisonPeriod) => setDraft({ ...draft, comparisonPeriod: comparisonPeriod as "WEEK" | "MONTH" | "QUARTER" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="WEEK">Tuần này so với tuần trước</SelectItem><SelectItem value="MONTH">Tháng này so với tháng trước</SelectItem><SelectItem value="QUARTER">Quý này so với quý trước</SelectItem></SelectGroup></SelectContent></Select></Field>}

          {filterDataset && <ReportFilterEditor dataset={filterDataset} conditions={draft.conditions} accessToken={accessToken} onChange={(conditions) => setDraft({ ...draft, conditions })} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
          <Button type="button" disabled={!isValid} onClick={() => onSave({ ...draft, title: draft.title?.trim() || undefined })}>Áp dụng cho ô</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function validConditions(widget: DashboardKpiWidgetInput) {
  return widget.conditions.every((condition) => {
    if (condition.operator === "EQUALS" || condition.operator === "NOT_EQUALS") return Boolean(condition.value);
    if (condition.operator === "DATE_PRESET") return Boolean(condition.value);
    return Boolean(condition.fromDate && condition.toDate && condition.toDate >= condition.fromDate);
  });
}
