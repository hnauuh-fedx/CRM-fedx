import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RelativeDatePreset =
  | "LAST_7_DAYS"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER";

export type DetailReportTimeFilterValue =
  | { condition: "RELATIVE"; preset: RelativeDatePreset }
  | { condition: "CUSTOM"; fromDate: string; toDate: string };

type ReportDateRange = { fromDate: string; toDate: string };

const relativeDateOptions: Array<{ value: RelativeDatePreset; label: string }> = [
  { value: "LAST_7_DAYS", label: "7 ngày gần nhất" },
  { value: "THIS_WEEK", label: "Tuần này" },
  { value: "LAST_WEEK", label: "Tuần trước" },
  { value: "THIS_MONTH", label: "Tháng này" },
  { value: "LAST_MONTH", label: "Tháng trước" },
  { value: "THIS_QUARTER", label: "Quý này" },
  { value: "LAST_QUARTER", label: "Quý trước" },
];

const defaultTimeFilter: DetailReportTimeFilterValue = { condition: "RELATIVE", preset: "THIS_MONTH" };

export function useDetailReportTimeFilter() {
  const [draftTimeFilter, setDraftTimeFilter] = useState<DetailReportTimeFilterValue>(defaultTimeFilter);
  const [filters, setFilters] = useState<ReportDateRange>(() => resolveDetailReportDateRange(defaultTimeFilter));

  return {
    draftTimeFilter,
    setDraftTimeFilter,
    filters,
    applyTimeFilter: () => setFilters(resolveDetailReportDateRange(draftTimeFilter)),
  };
}

export function DetailReportTimeFilter({ value, onChange, onApply }: {
  value: DetailReportTimeFilterValue;
  onChange: (value: DetailReportTimeFilterValue) => void;
  onApply: () => void;
}) {
  const isCustomInvalid = value.condition === "CUSTOM"
    && (!value.fromDate || !value.toDate || value.fromDate > value.toDate);

  function changeCondition(condition: "RELATIVE" | "CUSTOM") {
    if (condition === "RELATIVE") {
      onChange(defaultTimeFilter);
      return;
    }
    onChange({ condition: "CUSTOM", ...resolveDetailReportDateRange(value) });
  }

  return (
    <Card className="border-border/70 shadow-xs">
      <CardContent className="pt-6">
        <form className="grid items-end gap-4 md:grid-cols-[minmax(200px,0.8fr)_minmax(260px,1.2fr)_auto]" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <div className="grid gap-2">
            <Label htmlFor="detail-report-time-condition">Điều kiện</Label>
            <Select value={value.condition} onValueChange={changeCondition}>
              <SelectTrigger id="detail-report-time-condition" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="RELATIVE">Khoảng tương đối</SelectItem>
                  <SelectItem value="CUSTOM">Khoảng tùy chọn</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {value.condition === "RELATIVE" ? (
            <div className="grid gap-2">
              <Label htmlFor="detail-report-relative-value">Giá trị</Label>
              <Select value={value.preset} onValueChange={(preset) => onChange({ condition: "RELATIVE", preset: preset as RelativeDatePreset })}>
                <SelectTrigger id="detail-report-relative-value" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {relativeDateOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Khoảng ngày</Label>
              <DateRangeFilter
                className="w-full"
                fromDate={value.fromDate}
                toDate={value.toDate}
                onChange={(fromDate, toDate) => onChange({ condition: "CUSTOM", fromDate, toDate })}
              />
            </div>
          )}

          <Button type="submit" disabled={isCustomInvalid} className="w-full md:w-auto">Áp dụng</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function resolveDetailReportDateRange(value: DetailReportTimeFilterValue, today = new Date()): ReportDateRange {
  if (value.condition === "CUSTOM") return { fromDate: value.fromDate, toDate: value.toDate };

  let from = startOfDay(today);
  let to = startOfDay(today);
  if (value.preset === "LAST_7_DAYS") from = addDays(to, -6);
  if (value.preset === "THIS_WEEK" || value.preset === "LAST_WEEK") {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = addDays(startOfDay(today), -mondayOffset + (value.preset === "LAST_WEEK" ? -7 : 0));
    to = value.preset === "LAST_WEEK" ? addDays(from, 6) : startOfDay(today);
  }
  if (value.preset === "THIS_MONTH" || value.preset === "LAST_MONTH") {
    const monthOffset = value.preset === "LAST_MONTH" ? -1 : 0;
    from = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    to = value.preset === "LAST_MONTH"
      ? new Date(from.getFullYear(), from.getMonth() + 1, 0)
      : startOfDay(today);
  }
  if (value.preset === "THIS_QUARTER" || value.preset === "LAST_QUARTER") {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const quarterOffset = value.preset === "LAST_QUARTER" ? -3 : 0;
    from = new Date(today.getFullYear(), quarterStartMonth + quarterOffset, 1);
    to = value.preset === "LAST_QUARTER"
      ? new Date(from.getFullYear(), from.getMonth() + 3, 0)
      : startOfDay(today);
  }
  return { fromDate: toDateInput(from), toDate: toDateInput(to) };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
