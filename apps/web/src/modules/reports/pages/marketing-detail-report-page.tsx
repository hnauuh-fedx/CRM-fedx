import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileText, Megaphone, MousePointerClick, Target, TrendingUp } from "lucide-react";

import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { DetailReportTimeFilter, useDetailReportTimeFilter } from "@/modules/reports/components/detail-report-time-filter";
import { getMarketingDetailReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");

export function MarketingDetailReportPage() {
  const auth = useAuth();
  const { draftTimeFilter, setDraftTimeFilter, filters, applyTimeFilter } = useDetailReportTimeFilter();
  const reportQuery = useQuery({
    queryKey: ["reports", "marketing-detail", filters],
    queryFn: () => getMarketingDetailReport(filters, auth.accessToken!),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Báo cáo Marketing chi tiết"
        scopeLabel="Theo quyền truy cập"
        description="Theo dõi hiệu quả chiến dịch, nguồn UTM, biểu mẫu và chuyển đổi từ lead sang hồ sơ."
      />
      <DetailReportTimeFilter value={draftTimeFilter} onChange={setDraftTimeFilter} onApply={applyTimeFilter} />
      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : reportQuery.isError || !reportQuery.data ? (
        <Card className="mx-auto w-full max-w-xl">
          <ErrorState title="Không thể tải báo cáo Marketing" description="Vui lòng thử lại để cập nhật số liệu." onReload={() => reportQuery.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Chiến dịch" value={integerFormatter.format(reportQuery.data.summary.campaignCount)} icon={Megaphone} />
            <MetricCard label="Lượt UTM" value={integerFormatter.format(reportQuery.data.summary.trackingCount)} icon={MousePointerClick} />
            <MetricCard label="Lead phát sinh" value={integerFormatter.format(reportQuery.data.summary.leadCount)} icon={Target} />
            <MetricCard label="Tỷ lệ vào hồ sơ" value={`${reportQuery.data.summary.leadToApplicationRate}%`} icon={TrendingUp} />
            <MetricCard label="Biểu mẫu" value={integerFormatter.format(reportQuery.data.summary.formCount)} icon={FileText} />
            <MetricCard label="Hồ sơ tuyển sinh" value={integerFormatter.format(reportQuery.data.summary.applicationCount)} icon={ClipboardList} />
            <MetricCard label="Sinh viên nhập học" value={integerFormatter.format(reportQuery.data.summary.enrolledStudentCount)} icon={TrendingUp} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <TopCampaignsTable campaigns={reportQuery.data.topCampaigns} />
            <BreakdownCard title="Nguồn UTM hiệu quả" items={reportQuery.data.sourcePerformance.map((item) => ({ id: item.id, name: `${item.name} (${item.conversionRate}%)`, total: item.leadCount }))} emptyText="Chưa có dữ liệu nguồn UTM." />
          </div>
        </>
      )}
    </div>
  );
}

function TopCampaignsTable({ campaigns }: { campaigns: Array<{ id: string | null; name: string; type: string | null; status: string | null; leadCount: number; applicationCount: number; enrolledStudentCount: number; conversionRate: number }> }) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Top chiến dịch theo lead</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {campaigns.length === 0 ? (
          <EmptyState title="Chưa có chiến dịch phù hợp" description="Điều chỉnh khoảng thời gian để xem hiệu quả chiến dịch." />
        ) : (
          <Table>
            <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-5">Chiến dịch</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Hồ sơ</TableHead>
                <TableHead>Sinh viên</TableHead>
                <TableHead>Tỷ lệ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id ?? campaign.name}>
                  <TableCell className="px-5">
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-sm text-muted-foreground">{[campaign.type, campaign.status].filter(Boolean).join(" / ") || "-"}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(campaign.leadCount)}</TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(campaign.applicationCount)}</TableCell>
                  <TableCell className="tabular-nums">{integerFormatter.format(campaign.enrolledStudentCount)}</TableCell>
                  <TableCell className="tabular-nums">{campaign.conversionRate}%</TableCell>
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
    <output className="flex flex-col gap-6" aria-label="Đang tải báo cáo Marketing">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-32" />)}
      </div>
      <Skeleton className="h-80" />
    </output>
  );
}
