import { useId, useState } from "react";
import { Filter, RotateCcw, Search } from "lucide-react";
import { assignmentEventTypes, assignmentEventLabels, type AssignmentReportFilters } from "@admission-crm/shared/assignment-report";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssignmentOptionPicker } from "./assignment-option-picker";
import { assignmentPresetRange } from "../assignment-report-model";

type Props = { initial: AssignmentReportFilters; busy: boolean; onApply: (filters: AssignmentReportFilters) => void; onReset: () => void };
export function AssignmentReportFiltersForm({ initial, busy, onApply, onReset }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [advanced, setAdvanced] = useState(Boolean(initial.sourceIds.length || initial.campaignIds.length || initial.ruleIds.length || initial.method !== "ALL" || initial.eventTypes.length !== 4));
  const [preset, setPreset] = useState(() => ["THIS_MONTH", "THIS_WEEK", "TODAY"].find((value) => {
    const range = assignmentPresetRange(value as "TODAY" | "THIS_WEEK" | "THIS_MONTH");
    return initial.fromDate === range.fromDate && initial.toDate === range.toDate;
  }) ?? "CUSTOM");
  const valid = Boolean(draft.fromDate && draft.toDate && draft.fromDate <= draft.toDate && draft.eventTypes.length);
  const selectedTypes = new Set(draft.eventTypes);
  return <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) onApply(draft); }}>
    <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Field>
        <FieldLabel htmlFor={`${id}-preset`}>Thời gian</FieldLabel>
        <Select value={preset} onValueChange={(value) => { setPreset(value); if (value !== "CUSTOM") setDraft({ ...draft, ...assignmentPresetRange(value as "TODAY" | "THIS_WEEK" | "THIS_MONTH") }); }}>
          <SelectTrigger id={`${id}-preset`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="TODAY">Hôm nay</SelectItem><SelectItem value="THIS_WEEK">Tuần này</SelectItem>
            <SelectItem value="THIS_MONTH">Tháng này</SelectItem><SelectItem value="CUSTOM">Khoảng ngày</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field><FieldLabel htmlFor={`${id}-from`}>Từ ngày</FieldLabel><Input id={`${id}-from`} type="date" required value={draft.fromDate}
        onChange={(event) => { setPreset("CUSTOM"); setDraft({ ...draft, fromDate: event.target.value }); }} /></Field>
      <Field><FieldLabel htmlFor={`${id}-to`}>Đến ngày</FieldLabel><Input id={`${id}-to`} type="date" required min={draft.fromDate} value={draft.toDate}
        onChange={(event) => { setPreset("CUSTOM"); setDraft({ ...draft, toDate: event.target.value }); }} /></Field>
      <AssignmentOptionPicker kind="department" label="Nhóm phụ trách" value={draft.departmentIds}
        onChange={(departmentIds) => setDraft({ ...draft, departmentIds, assigneeIds: [] })} />
      <AssignmentOptionPicker key={draft.departmentIds.join(",")} kind="assignee" label="Nhân viên" value={draft.assigneeIds} departmentIds={draft.departmentIds}
        onChange={(assigneeIds) => setDraft({ ...draft, assigneeIds })} />
    </FieldGroup>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" aria-expanded={advanced} aria-controls={`${id}-advanced`} onClick={() => setAdvanced(!advanced)}><Filter aria-hidden="true" data-icon="inline-start" />Bộ lọc nâng cao</Button>
      <Button type="submit" disabled={!valid || busy}><Search aria-hidden="true" data-icon="inline-start" />Áp dụng</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onReset}><RotateCcw aria-hidden="true" data-icon="inline-start" />Đặt lại</Button>
    </div>
    {advanced && <FieldGroup id={`${id}-advanced`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AssignmentOptionPicker kind="source" label="Nguồn lead" value={draft.sourceIds} onChange={(sourceIds) => setDraft({ ...draft, sourceIds })} />
      <AssignmentOptionPicker kind="campaign" label="Chiến dịch" value={draft.campaignIds} onChange={(campaignIds) => setDraft({ ...draft, campaignIds })} />
      <Field><FieldLabel htmlFor={`${id}-method`}>Hình thức giao</FieldLabel>
        <Select value={draft.method} onValueChange={(value) => setDraft({ ...draft, method: value as AssignmentReportFilters["method"], ruleIds: value === "MANUAL" ? [] : draft.ruleIds })}>
          <SelectTrigger id={`${id}-method`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            <SelectItem value="ALL">Tất cả</SelectItem><SelectItem value="AUTOMATIC">Tự động</SelectItem><SelectItem value="MANUAL">Thủ công</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <AssignmentOptionPicker kind="rule" label="Automation / Quy tắc phân bổ" disabled={draft.method === "MANUAL"} value={draft.ruleIds} onChange={(ruleIds) => setDraft({ ...draft, ruleIds })} />
      <FieldSet className="sm:col-span-2 xl:col-span-4"><FieldLegend variant="label">Loại sự kiện</FieldLegend>
        <FieldGroup className="flex flex-wrap gap-3 sm:flex-row">
          {assignmentEventTypes.map((type) => <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2">
            <Checkbox checked={selectedTypes.has(type)} onCheckedChange={(checked) => setDraft({ ...draft, eventTypes: checked === true ? [...draft.eventTypes, type] : draft.eventTypes.filter((item) => item !== type) })} />
            <span className="text-sm">{assignmentEventLabels[type]}</span>
          </label>)}
        </FieldGroup>
        {!draft.eventTypes.length && <p role="alert" className="text-sm text-destructive">Chọn ít nhất một loại sự kiện.</p>}
      </FieldSet>
    </FieldGroup>}
    <p className="text-xs text-muted-foreground">Tính theo thời điểm phát sinh sự kiện, múi giờ Việt Nam. Nhóm, nguồn và chiến dịch được ghi nhận tại thời điểm sự kiện.</p>
  </form>;
}
