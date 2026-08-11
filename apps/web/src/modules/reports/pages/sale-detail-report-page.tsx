import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BriefcaseBusiness, ClipboardList, ListChecks, Target, TrendingUp, UserCheck } from "lucide-react";

import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { getSaleDetailReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");

export function SaleDetailReportPage() {
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
        eyebrow="Báo cáo"
        title="Báo cáo Sale chi tiết"
        scopeLabel="Theo quyền truy cập"
        description="Theo dõi lead được phân công, pipeline, hoạt động chăm sóc, nhắc việc và chuyển đổi theo nhân viên."
      />
      <ReportFilters
        filters={draftFilters}
        onChange={(key, value) => setDraftFilters((current) => ({ ...current, [key]: value }))}
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
          <ErrorState title="Không thể tải báo cáo Sale" description="Vui lòng thử lại để cập nhật số liệu." onReload={() => reportQuery.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Lead trong kỳ" value={integerFormatter.format(reportQuery.data.summary.totalLeads)} icon={Target} />
            <MetricCard label="Đã phân công" value={integerFormatter.format(reportQuery.data.summary.assignedLeads)} icon={UserCheck} />
            <MetricCard label="Chưa phân công" value={integerFormatter.format(reportQuery.data.summary.unassignedLeads)} icon={BriefcaseBusiness} />
            <MetricCard label="Tỷ lệ phân công" value={`${reportQuery.data.summary.assignmentRate}%`} icon={TrendingUp} />
            <MetricCard label="Hoạt động chăm sóc" value={integerFormatter.format(reportQuery.data.summary.activityCount)} icon={ListChecks} />
            <MetricCard label="Nhắc việc chờ xử lý" value={integerFormatter.format(reportQuery.data.summary.pendingReminders)} icon={Bell} />
            <MetricCard label="Nhắc việc quá hạn" value={integerFormatter.format(reportQuery.data.summary.overdueReminders)} icon={Bell} />
            <MetricCard label="Nhân viên có lead" value={integerFormatter.format(reportQuery.data.staffPerformance.length)} icon={ClipboardList} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <StaffPerformanceTable staff={reportQuery.data.staffPerformance} />
            <BreakdownCard title="Pipeline theo giai đoạn" items={reportQuery.data.pipelineBreakdown} emptyText="Chưa có dữ liệu pipeline." />
          </div>
        </>
      )}
    </div>
  );
}

function ReportFilters({ filters, onChange, onApply, onReset }: {
  filters: { fromDate: string; toDate: string };
  onChange: (key: "fromDate" | "toDate", value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardContent className="pt-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
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
            <Button type="button" variant="outline" onClick={onReset}>Tháng này</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StaffPerformanceTable({ staff }: { staff: Array<{ id: string | null; name: string; assignedLeadCount: number; applicationCount: number; enrolledStudentCount: number; conversionRate: number }> }) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Hiệu quả theo nhân viên</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {staff.length === 0 ? (
          <EmptyState title="Chưa có nhân viên có lead phù hợp" description="Điều chỉnh khoảng thời gian để xem hiệu quả Sale." />
        ) : (
          <Table>
            <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-5">Nhân viên</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Hồ sơ</TableHead>
                <TableHead>Sinh viên</TableHead>
                <TableHead className="px-5">Tỷ lệ vào hồ sơ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((item) => (
                <TableRow key={item.id ?? item.name}>
                  <TableCell className="px-5 font-medium">{item.name}</TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(item.assignedLeadCount)}</TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(item.applicationCount)}</TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(item.enrolledStudentCount)}</TableCell>
                  <TableCell className="px-5 tabular-nums">{item.conversionRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <output className="flex flex-col gap-6" aria-label="Đang tải báo cáo Sale">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-32" />)}
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
