import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileText, Megaphone, MousePointerClick, Target, TrendingUp, Wallet } from "lucide-react";

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
import { getMarketingDetailReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export function MarketingDetailReportPage() {
  const auth = useAuth();
  const initialFilters = useMemo(() => defaultDateRange(), []);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
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
            <MetricCard label="Ngân sách" value={currencyFormatter.format(reportQuery.data.summary.totalBudget)} icon={Wallet} />
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

function TopCampaignsTable({ campaigns }: { campaigns: Array<{ id: string | null; name: string; type: string | null; status: string | null; budget: number; leadCount: number; applicationCount: number; enrolledStudentCount: number; conversionRate: number; costPerLead: number | null }> }) {
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
                <TableHead className="px-5">CPL</TableHead>
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
                  <TableCell className="px-5 tabular-nums">{campaign.costPerLead === null ? "-" : currencyFormatter.format(campaign.costPerLead)}</TableCell>
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
