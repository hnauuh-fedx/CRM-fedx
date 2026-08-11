import { useQuery } from "@tanstack/react-query";
import { ClipboardList, GraduationCap, Target, TrendingUp, Wallet } from "lucide-react";

import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { getOverviewReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export function OverviewReportPage() {
  const auth = useAuth();
  const reportQuery = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: () => getOverviewReport(auth.accessToken!),
  });

  if (reportQuery.isLoading) {
    return (
      <output className="mx-auto flex max-w-7xl flex-col gap-6" aria-label="Đang tải báo cáo tổng hợp">
        <Skeleton className="h-20 max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-32" />)}
        </div>
        <Skeleton className="h-72" />
      </output>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <Card className="mx-auto max-w-xl">
        <ErrorState
          title="Không thể tải báo cáo tổng hợp"
          description="Vui lòng thử lại để cập nhật số liệu."
          onReload={() => reportQuery.refetch()}
        />
      </Card>
    );
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Báo cáo tổng hợp"
        scopeLabel="Toàn hệ thống"
        description="Số liệu toàn hệ thống phục vụ theo dõi tuyển sinh và nhập học."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Tổng lead" value={integerFormatter.format(report.summary.totalLeads)} icon={Target} />
        <MetricCard label="Hồ sơ tuyển sinh" value={integerFormatter.format(report.summary.totalApplications)} icon={ClipboardList} />
        <MetricCard label="Sinh viên" value={integerFormatter.format(report.summary.totalStudents)} icon={GraduationCap} />
        <MetricCard label="Tỷ lệ nhập học" value={`${report.summary.conversionRate}%`} icon={TrendingUp} />
        <MetricCard label="Doanh thu tháng" value={currencyFormatter.format(report.summary.monthlyRevenue)} icon={Wallet} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownCard title="Hồ sơ theo trạng thái" items={report.applicationsByStatus} emptyText="Chưa có dữ liệu hồ sơ." />
        <BreakdownCard title="Hồ sơ theo ngành" items={report.applicationsByMajor} emptyText="Chưa có dữ liệu ngành." />
        <BreakdownCard title="Sinh viên theo khoa" items={report.studentsByFaculty} emptyText="Chưa có dữ liệu sinh viên." />
      </div>
    </div>
  );
}
