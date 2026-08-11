import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Headphones, School, TicketCheck, TrendingUp, Users } from "lucide-react";

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
import type { StudentReportStudent } from "@/modules/reports/report.types";
import { getStudentDetailReport } from "@/services/report.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function StudentDetailReportPage() {
  const auth = useAuth();
  const initialFilters = useMemo(() => defaultDateRange(), []);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const reportQuery = useQuery({
    queryKey: ["reports", "student-detail", filters],
    queryFn: () => getStudentDetailReport(filters, auth.accessToken!),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Báo cáo Sinh viên chi tiết"
        scopeLabel="Theo quyền truy cập"
        description="Theo dõi sinh viên đã nhập học, phân bổ lớp, khoa, ngành và yêu cầu dịch vụ sinh viên."
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
          <ErrorState title="Không thể tải báo cáo Sinh viên" description="Vui lòng thử lại để cập nhật số liệu." onReload={() => reportQuery.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Sinh viên trong kỳ" value={integerFormatter.format(reportQuery.data.summary.totalStudents)} icon={GraduationCap} />
            <MetricCard label="Đang học" value={integerFormatter.format(reportQuery.data.summary.activeStudents)} icon={Users} />
            <MetricCard label="Đã xếp lớp" value={integerFormatter.format(reportQuery.data.summary.studentsWithClass)} icon={School} />
            <MetricCard label="Tỷ lệ xếp lớp" value={`${reportQuery.data.summary.classAssignmentRate}%`} icon={TrendingUp} />
            <MetricCard label="Yêu cầu dịch vụ" value={integerFormatter.format(reportQuery.data.summary.serviceRequestCount)} icon={Headphones} />
            <MetricCard label="Dịch vụ đang mở" value={integerFormatter.format(reportQuery.data.summary.openServiceRequestCount)} icon={TicketCheck} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <RecentStudentsTable students={reportQuery.data.recentStudents} />
            <div className="grid gap-6">
              <BreakdownCard title="Sinh viên theo khoa" items={reportQuery.data.studentsByFaculty} emptyText="Chưa có dữ liệu khoa." />
              <BreakdownCard title="Sinh viên theo lớp" items={reportQuery.data.studentsByClass} emptyText="Chưa có dữ liệu lớp." />
              <BreakdownCard title="Loại dịch vụ sinh viên" items={reportQuery.data.serviceTypes} emptyText="Chưa có yêu cầu dịch vụ." />
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

function RecentStudentsTable({ students }: { students: StudentReportStudent[] }) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Sinh viên mới nhất</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {students.length === 0 ? (
          <EmptyState title="Chưa có sinh viên phù hợp" description="Điều chỉnh khoảng thời gian để xem danh sách sinh viên." />
        ) : (
          <Table>
            <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="px-5">Sinh viên</TableHead>
                <TableHead>Ngành / khoa</TableHead>
                <TableHead>Lớp</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="px-5">Ngày nhập học</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="px-5">
                    <p className="font-medium">{student.leadName}</p>
                    <p className="text-sm text-muted-foreground">{student.studentCode}</p>
                  </TableCell>
                  <TableCell>
                    <p>{student.majorName}</p>
                    <p className="text-sm text-muted-foreground">{student.facultyName ?? "-"}</p>
                  </TableCell>
                  <TableCell>{student.className ?? "-"}</TableCell>
                  <TableCell>{formatStatus(student.status)}</TableCell>
                  <TableCell className="px-5">{formatDate(student.enrolledAt) ?? "-"}</TableCell>
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
    <output className="flex flex-col gap-6" aria-label="Đang tải báo cáo Sinh viên">
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
