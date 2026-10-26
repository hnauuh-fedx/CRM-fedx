import { PageLoadingState } from "@/components/shared/page-loading-state";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, GraduationCap, Target, TrendingUp } from "lucide-react";

import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/modules/auth/auth-context";
import { getOverviewReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");

export function OverviewReportPage() {
  const auth = useAuth();
  const reportQuery = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: () => getOverviewReport(auth.accessToken!),
  });

  if (reportQuery.isLoading) return <PageLoadingState variant="dashboard" label="Đang tải báo cáo tổng hợp" />;

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tổng lead" value={integerFormatter.format(report.summary.totalLeads)} icon={Target} />
        <MetricCard label="Hồ sơ tuyển sinh" value={integerFormatter.format(report.summary.totalApplications)} icon={ClipboardList} />
        <MetricCard label="Sinh viên" value={integerFormatter.format(report.summary.totalStudents)} icon={GraduationCap} />
        <MetricCard label="Tỷ lệ nhập học" value={`${report.summary.conversionRate}%`} icon={TrendingUp} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownCard title="Hồ sơ theo trạng thái" items={report.applicationsByStatus} emptyText="Chưa có dữ liệu hồ sơ." />
        <BreakdownCard title="Hồ sơ theo ngành" items={report.applicationsByMajor} emptyText="Chưa có dữ liệu ngành." />
      </div>
    </div>
  );
}
