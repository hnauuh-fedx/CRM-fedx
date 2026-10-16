import { SalePerformanceContent } from "@/modules/reports/components/sale-performance-content";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { getSaleDetailReport } from "@/services/report.service";

export function SaleKpiPage() {
  const auth = useAuth();
  const initialFilters = useMemo(() => defaultDateRange(), []);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const reportQuery = useQuery({
    queryKey: ["reports", "sale-detail", filters],
    queryFn: () => getSaleDetailReport(filters, auth.accessToken!),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sale"
        title="KPI đội nhóm"
        scopeLabel="Theo phòng ban / Quyền truy cập"
        description="Theo dõi hiệu suất làm việc, tỷ lệ chuyển đổi và hoạt động của từng nhân viên Telesale."
      />
      <ReportFilters
        filters={draftFilters}
        onChange={(key, value) =>
          setDraftFilters((current) => ({ ...current, [key]: value }))
        }
        onApply={() => setFilters(draftFilters)}
        onReset={() => {
          setDraftFilters(defaultDateRange());
          setFilters(defaultDateRange());
        }}
      />
      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : reportQuery.isError || !reportQuery.data ? (
        <Card className="mx-auto w-full max-w-xl">
          <ErrorState
            title="Không thể tải KPI đội nhóm"
            description="Vui lòng thử lại để cập nhật số liệu."
            onReload={() => reportQuery.refetch()}
          />
        </Card>
      ) : (
        <SalePerformanceContent
          report={reportQuery.data}
          staffTitle="Hiệu quả làm việc đội ngũ"
        />
      )}
    </div>
  );
}

type ReportFiltersProps = {
  filters: { fromDate: string; toDate: string };
  onChange: (key: "fromDate" | "toDate", value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function ReportFilters({
  filters,
  onChange,
  onApply,
  onReset,
}: ReportFiltersProps) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardContent className="pt-6">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <div className="grid gap-2 w-full sm:w-auto">
            <Label>Thời gian</Label>
            <DateRangeFilter
              fromDate={filters.fromDate}
              toDate={filters.toDate}
              onChange={(from, to) => {
                onChange("fromDate", from);
                onChange("toDate", to);
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={onReset}>
              Tháng này
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <output className="flex flex-col gap-6" aria-label="Đang tải KPI đội nhóm">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </output>
  );
}

function defaultDateRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromDate: toDateInput(firstDay), toDate: toDateInput(now) };
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
