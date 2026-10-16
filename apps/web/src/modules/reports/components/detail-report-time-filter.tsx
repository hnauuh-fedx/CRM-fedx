import { useState } from "react";
import {
  DetailReportTimeFilterValue,
  RelativeDatePreset,
  ReportDateRange,
  resolveDetailReportDateRange,
} from "./detail-report-time-filter-model";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const relativeDateOptions: Array<{ value: RelativeDatePreset; label: string }> =
  [
    { value: "LAST_7_DAYS", label: "7 ngày gần nhất" },
    { value: "THIS_WEEK", label: "Tuần này" },
    { value: "LAST_WEEK", label: "Tuần trước" },
    { value: "THIS_MONTH", label: "Tháng này" },
    { value: "LAST_MONTH", label: "Tháng trước" },
    { value: "THIS_QUARTER", label: "Quý này" },
    { value: "LAST_QUARTER", label: "Quý trước" },
  ];

const defaultTimeFilter: DetailReportTimeFilterValue = {
  condition: "RELATIVE",
  preset: "THIS_MONTH",
};

export function useDetailReportTimeFilter() {
  const [draftTimeFilter, setDraftTimeFilter] =
    useState<DetailReportTimeFilterValue>(defaultTimeFilter);
  const [filters, setFilters] = useState<ReportDateRange>(() =>
    resolveDetailReportDateRange(defaultTimeFilter),
  );

  return {
    draftTimeFilter,
    setDraftTimeFilter,
    filters,
    applyTimeFilter: () =>
      setFilters(resolveDetailReportDateRange(draftTimeFilter)),
  };
}

export function DetailReportTimeFilter({
  value,
  onChange,
  onApply,
}: {
  value: DetailReportTimeFilterValue;
  onChange: (value: DetailReportTimeFilterValue) => void;
  onApply: () => void;
}) {
  const isCustomInvalid =
    value.condition === "CUSTOM" &&
    (!value.fromDate || !value.toDate || value.fromDate > value.toDate);

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
        <form
          className="grid items-end gap-4 md:grid-cols-[minmax(200px,0.8fr)_minmax(260px,1.2fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="detail-report-time-condition">Điều kiện</Label>
            <Select value={value.condition} onValueChange={changeCondition}>
              <SelectTrigger
                id="detail-report-time-condition"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
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
              <Select
                value={value.preset}
                onValueChange={(preset) =>
                  onChange({
                    condition: "RELATIVE",
                    preset: preset as RelativeDatePreset,
                  })
                }
              >
                <SelectTrigger
                  id="detail-report-relative-value"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {relativeDateOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
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
                onChange={(fromDate, toDate) =>
                  onChange({ condition: "CUSTOM", fromDate, toDate })
                }
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={isCustomInvalid}
            className="w-full md:w-auto"
          >
            Áp dụng
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
