import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileWarning, GraduationCap, ReceiptText, TrendingUp, Wallet } from "lucide-react";

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
import type { AdmissionReportApplication } from "@/modules/reports/report.types";
import { getAdmissionDetailReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function AdmissionDetailReportPage() {
  const auth = useAuth();
  const initialFilters = useMemo(() => defaultDateRange(), []);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const reportQuery = useQuery({
    queryKey: ["reports", "admission-detail", filters],
    queryFn: () => getAdmissionDetailReport(filters, auth.accessToken!),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Báo cáo Tuyển sinh chi tiết"
        scopeLabel="Theo quyền truy cập"
        description="Theo dõi hồ sơ tuyển sinh, trạng thái xử lý, tài liệu, học phí và chuyển đổi sang sinh viên."
      />
      <ReportFilters
        filters={draftFilters}
        onChange={(key, value) => setDraftFilters((current) => ({ ...current, [key]: value }))}
        onApply={() => setFilters(draftFilters)}
        onReset={() => {
          const resetFilters = defaultDateRange();
          setDraftFilters(resetFilters);
          setFilters(resetFilters);
        }}
      />
      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : reportQuery.isError || !reportQuery.data ? (
        <Card className="mx-auto w-full max-w-xl">
          <ErrorState title="Không thể tải báo cáo Tuyển sinh" description="Vui lòng thử lại để cập nhật số liệu." onReload={() => reportQuery.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Hồ sơ trong kỳ" value={integerFormatter.format(reportQuery.data.summary.totalApplications)} icon={ClipboardList} />
            <MetricCard label="Sinh viên nhập học" value={integerFormatter.format(reportQuery.data.summary.enrolledStudentCount)} icon={GraduationCap} />
            <MetricCard label="Tỷ lệ chuyển đổi" value={`${reportQuery.data.summary.conversionRate}%`} icon={TrendingUp} />
            <MetricCard label="Doanh thu dự kiến" value={currencyFormatter.format(reportQuery.data.summary.monthlyRevenue)} icon={Wallet} />
            <MetricCard label="Tài liệu đã ghi nhận" value={integerFormatter.format(reportQuery.data.summary.documentCount)} icon={ReceiptText} />
            <MetricCard label="Tài liệu cần xử lý" value={integerFormatter.format(reportQuery.data.summary.pendingDocumentCount)} icon={FileWarning} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <RecentApplicationsTable applications={reportQuery.data.recentApplications} />
            <div className="grid gap-6">
              <BreakdownCard title="Hồ sơ theo trạng thái" items={reportQuery.data.applicationsByStatus} emptyText="Chưa có dữ liệu trạng thái hồ sơ." />
              <BreakdownCard title="Hồ sơ theo ngành" items={reportQuery.data.applicationsByMajor} emptyText="Chưa có dữ liệu ngành tuyển sinh." />
              <BreakdownCard title="Trạng thái học phí" items={reportQuery.data.tuitionStatusBreakdown} emptyText="Chưa có dữ liệu học phí." />
            </div>
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

function RecentApplicationsTable({ applications }: { applications: AdmissionReportApplication[] }) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Hồ sơ mới nhất</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {applications.length === 0 ? (
          <EmptyState title="Chưa có hồ sơ phù hợp" description="Điều chỉnh khoảng thời gian để xem hồ sơ tuyển sinh." />
        ) : (
          <Table>
            <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-5">Hồ sơ</TableHead>
                <TableHead>Ngành</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Học phí</TableHead>
                <TableHead className="px-5">Doanh thu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="px-5">
                    <p className="font-medium">{application.leadName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[application.admissionCode, formatDate(application.applicationReceivedDate)].filter(Boolean).join(" / ") || "-"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{application.majorName}</p>
                    <p className="text-sm text-muted-foreground">{application.facultyName ?? "-"}</p>
                  </TableCell>
                  <TableCell>{application.statusName}</TableCell>
                  <TableCell>{formatStatus(application.tuitionStatus)}</TableCell>
                  <TableCell className="px-5 tabular-nums">{currencyFormatter.format(application.monthlyRevenue)}</TableCell>
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
    <output className="flex flex-col gap-6" aria-label="Đang tải báo cáo Tuyển sinh">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32" />)}
      </div>
      <Skeleton className="h-96" />
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

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : null;
}

function formatStatus(value: string | null) {
  if (!value) return "Chưa xác định";
  return value.split(/[_-]+/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
