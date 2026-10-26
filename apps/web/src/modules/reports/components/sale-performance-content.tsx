import { BreakdownCard, MetricCard } from "@/components/shared/dashboard-cards";
import { EmptyState } from "@/components/shared/data-states";
import { StaticTableHeader } from "@/components/shared/static-table-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { getSaleDetailReport } from "@/services/report.service";
import {
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  ListChecks,
  Target,
  TrendingUp,
  UserCheck,
} from "lucide-react";
const integerFormatter = new Intl.NumberFormat("vi-VN");
export function SalePerformanceContent({
  report,
  staffTitle,
}: {
  report: Awaited<ReturnType<typeof getSaleDetailReport>>;
  staffTitle: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Lead trong kỳ"
          value={integerFormatter.format(report.summary.totalLeads)}
          icon={Target}
        />
        <MetricCard
          label="Đã phân công"
          value={integerFormatter.format(report.summary.assignedLeads)}
          icon={UserCheck}
        />
        <MetricCard
          label="Chưa phân công"
          value={integerFormatter.format(report.summary.unassignedLeads)}
          icon={BriefcaseBusiness}
        />
        <MetricCard
          label="Tỷ lệ phân công"
          value={`${report.summary.assignmentRate}%`}
          icon={TrendingUp}
        />
        <MetricCard
          label="Hoạt động chăm sóc"
          value={integerFormatter.format(report.summary.activityCount)}
          icon={ListChecks}
        />
        <MetricCard
          label="Nhắc việc chờ xử lý"
          value={integerFormatter.format(report.summary.pendingReminders)}
          icon={Bell}
        />
        <MetricCard
          label="Nhắc việc quá hạn"
          value={integerFormatter.format(report.summary.overdueReminders)}
          icon={Bell}
        />
        <MetricCard
          label="Nhân viên có lead"
          value={integerFormatter.format(report.staffPerformance.length)}
          icon={ClipboardList}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <StaffPerformanceTable
          staff={report.staffPerformance}
          title={staffTitle}
        />
        <BreakdownCard
          title="Pipeline theo giai đoạn"
          items={report.pipelineBreakdown}
          emptyText="Chưa có dữ liệu pipeline."
        />
      </div>
    </>
  );
}
type StaffPerformanceTableProps = {
  title: string;
  staff: Array<{
    id: string | null;
    name: string;
    assignedLeadCount: number;
    applicationCount: number;
    enrolledStudentCount: number;
    conversionRate: number;
  }>;
};

function StaffPerformanceTable({ staff, title }: StaffPerformanceTableProps) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {staff.length === 0 ? (
          <EmptyState
            title="Chưa có nhân viên có lead phù hợp"
            description="Điều chỉnh khoảng thời gian để xem hiệu quả Sale."
          />
        ) : (
          <Table>
            <StaticTableHeader
              columns={[
                { label: "Nhân viên", className: "px-5" },
                { label: "Lead" },
                { label: "Hồ sơ" },
                { label: "Sinh viên" },
                { label: "Tỷ lệ vào hồ sơ", className: "px-5" },
              ]}
              className="bg-muted/55 text-xs uppercase text-muted-foreground"
            />
            <TableBody>
              {staff.map((item) => (
                <TableRow key={item.id ?? item.name}>
                  <TableCell className="px-3 font-medium">
                    {item.name}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {integerFormatter.format(item.assignedLeadCount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {integerFormatter.format(item.applicationCount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {integerFormatter.format(item.enrolledStudentCount)}
                  </TableCell>
                  <TableCell className="px-3 tabular-nums">
                    {item.conversionRate}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
