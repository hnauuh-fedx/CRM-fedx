import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ClipboardList, GraduationCap, Target, TrendingUp, UserCheck, Wallet } from "lucide-react";

import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { getDirectorDashboard } from "@/services/dashboard.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function DirectorDashboardPage() {
  const auth = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: () => getDirectorDashboard(auth.accessToken!),
  });

  if (dashboardQuery.isLoading) {
    return (
      <output className="mx-auto flex max-w-7xl flex-col gap-6" aria-label="Đang tải dashboard điều hành">
        <Skeleton className="h-20 max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <span className="sr-only">Đang tải dashboard điều hành</span>
      </output>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Card className="mx-auto max-w-xl">
        <ErrorState
          title="Không thể tải dashboard giám đốc"
          description="Vui lòng thử lại để cập nhật các chỉ số tổng hợp."
          onReload={() => dashboardQuery.refetch()}
        />
      </Card>
    );
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Điều hành"
        title="Dashboard giám đốc"
        scopeLabel="Toàn hệ thống"
        actions={
          auth.can("user.manage") ? (
            <Button asChild>
              <Link to="/quan-ly/nguoi-dung">Quản lý người dùng</Link>
            </Button>
          ) : undefined
        }
        description="Tổng hợp tình hình tuyển sinh, chuyển đổi và hiệu quả phân công hiện tại."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Tổng lead"
          value={integerFormatter.format(dashboard.summary.totalLeads)}
          icon={Target}
        />
        <MetricCard
          label="Hồ sơ tuyển sinh"
          value={integerFormatter.format(dashboard.summary.totalApplications)}
          icon={ClipboardList}
        />
        <MetricCard
          label="Sinh viên nhập học"
          value={integerFormatter.format(dashboard.summary.enrolledStudents)}
          icon={GraduationCap}
        />
        <MetricCard
          label="Lead sang hồ sơ"
          value={`${dashboard.summary.leadToApplicationRate}%`}
          icon={TrendingUp}
        />
        <MetricCard
          label="Hồ sơ sang SV"
          value={`${dashboard.summary.applicationToStudentRate}%`}
          icon={UserCheck}
        />
        <MetricCard
          label="Doanh thu tháng"
          value={currencyFormatter.format(dashboard.summary.monthlyRevenue)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownCard
          title="Lead theo nguồn"
          description="Các nguồn tạo nhiều lead nhất."
          items={dashboard.leadsBySource}
          emptyText="Chưa có dữ liệu nguồn lead."
        />
        <BreakdownCard
          title="Pipeline lead"
          description="Phân bổ lead theo giai đoạn xử lý."
          items={dashboard.leadsByStage}
          emptyText="Chưa có dữ liệu pipeline."
        />
        <BreakdownCard
          title="Lead theo phòng ban"
          description="Phân bổ theo đơn vị phụ trách chính."
          items={dashboard.leadsByDepartment}
          emptyText="Chưa có dữ liệu phòng ban."
        />
        <BreakdownCard
          title="KPI nhân viên"
          description="Số lead đang được gán cho từng nhân viên."
          items={dashboard.staffKpi.map((item) => ({
            id: item.id,
            name: item.fullName,
            total: item.assignedLeads,
          }))}
          emptyText="Chưa có dữ liệu phân công."
        />
        <BreakdownCard
          title="Funnel tuyển sinh"
          description="Hồ sơ theo trạng thái tuyển sinh."
          items={dashboard.admissionFunnel}
          emptyText="Chưa có hồ sơ tuyển sinh."
        />
      </div>
    </div>
  );
}
