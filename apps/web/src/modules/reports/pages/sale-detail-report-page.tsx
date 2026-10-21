import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import {
  DetailReportTimeFilter,
  useDetailReportTimeFilter,
} from "@/modules/reports/components/detail-report-time-filter";
import { SalePerformanceContent } from "@/modules/reports/components/sale-performance-content";
import { getSaleDetailReport } from "@/services/report.service";
import { useQuery } from "@tanstack/react-query";
export function SaleDetailReportPage() {
  const auth = useAuth();
  const { draftTimeFilter, setDraftTimeFilter, filters, applyTimeFilter } =
    useDetailReportTimeFilter();
  const reportQuery = useQuery({
    queryKey: ["reports", "sale-detail", filters],
    queryFn: () => getSaleDetailReport(filters, auth.accessToken!),
  });

  return (
    <PageLoadingBoundary variant="dashboard" queries={[reportQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Báo cáo Sale chi tiết"
        scopeLabel="Theo quyền truy cập"
        description="Theo dõi lead được phân công, pipeline, hoạt động chăm sóc, nhắc việc và chuyển đổi theo nhân viên."
      />
      <DetailReportTimeFilter
        value={draftTimeFilter}
        onChange={setDraftTimeFilter}
        onApply={applyTimeFilter}
      />
      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : reportQuery.isError || !reportQuery.data ? (
        <Card className="mx-auto w-full max-w-xl">
          <ErrorState
            title="Không thể tải báo cáo Sale"
            description="Vui lòng thử lại để cập nhật số liệu."
            onReload={() => reportQuery.refetch()}
          />
        </Card>
      ) : (
        <SalePerformanceContent
          report={reportQuery.data}
          staffTitle="Hiệu quả theo nhân viên"
        />
      )}
    </div>
    </PageLoadingBoundary>
  );
}

function ReportSkeleton() {
  return (
    <output className="flex flex-col gap-6" aria-label="Đang tải báo cáo Sale">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </output>
  );
}
