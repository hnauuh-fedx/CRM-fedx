import { useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { assignmentEventLabels, assignmentEventTypes, assignmentReportPermissions, type AssignmentReportFilters, type AssignmentReportQuery } from "@admission-crm/shared/assignment-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getAssignmentReport } from "@/services/assignment-report.service";
import { defaultAssignmentFilters, readAssignmentFilters, writeAssignmentFilters, assignmentArrayFilterKeys } from "../assignment-report-model";
import { AssignmentReportFiltersForm } from "./assignment-report-filters";
import { AssignmentReportDetails, type AssignmentDetailTarget } from "./assignment-report-details";
import { AssignmentReportResults } from "./assignment-report-results";

const filterLabels = { departmentIds: "Nhóm", assigneeIds: "Nhân viên", sourceIds: "Nguồn lead", campaignIds: "Chiến dịch", ruleIds: "Automation" };

export function AssignmentReportPanel() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [params] = useSearchParams();
  if (!assignmentReportPermissions.some(auth.can) || !selectedProgramId) return null;
  return <AssignmentReportWorkspace key={`${auth.user?.id}:${selectedProgramId}:${JSON.stringify(readAssignmentFilters(params))}`} />;
}

function AssignmentReportWorkspace() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readAssignmentFilters(params), [params]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "ASSIGNED", desc: true }]);
  const [target, setTarget] = useState<AssignmentDetailTarget | null>(null);
  const query: AssignmentReportQuery = { ...filters, page: pagination.pageIndex + 1, limit: pagination.pageSize,
    sortBy: (sorting[0]?.id ?? "ASSIGNED") as AssignmentReportQuery["sortBy"], sortOrder: sorting[0]?.desc === false ? "asc" : "desc" };
  const report = useQuery({
    queryKey: ["assignment-report", auth.user?.id, selectedProgramId, query],
    queryFn: ({ signal }) => getAssignmentReport(query, auth.accessToken!, signal),
    enabled: Boolean(auth.accessToken && selectedProgramId),
  });
  function apply(next: AssignmentReportFilters) {
    setPagination({ ...pagination, pageIndex: 0 });
    setTarget(null);
    setParams((current) => writeAssignmentFilters(current, next));
  }
  return <Card aria-label="Báo cáo phân bổ và xử lý lead">
    <CardHeader><CardTitle>Báo cáo phân bổ và xử lý lead</CardTitle>
      <CardDescription>Theo dõi lượt giao, cảnh báo và thu hồi trong chương trình đang chọn. Một lead có thể phát sinh nhiều lượt.</CardDescription></CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-5">
      <AssignmentReportFiltersForm key={JSON.stringify(filters)} initial={filters} busy={report.isFetching} onApply={apply} onReset={() => apply(defaultAssignmentFilters())} />
      <div className="flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang áp dụng">
        <span className="text-sm text-muted-foreground">{filters.fromDate} — {filters.toDate}</span>
        {assignmentArrayFilterKeys.filter((key) => filters[key].length).map((key) => <Button key={key} type="button" variant="secondary" size="sm" onClick={() => apply({ ...filters, [key]: [], ...(key === "departmentIds" ? { assigneeIds: [] } : {}) })}>
          {filterLabels[key]}: {filters[key].length}<X aria-hidden="true" data-icon="inline-end" /><span className="sr-only">Bỏ bộ lọc {filterLabels[key]}</span>
        </Button>)}
        {filters.method !== "ALL" && <Button type="button" variant="secondary" size="sm" onClick={() => apply({ ...filters, method: "ALL" })}>{filters.method === "AUTOMATIC" ? "Tự động" : "Thủ công"}<X aria-hidden="true" data-icon="inline-end" /><span className="sr-only">Bỏ lọc hình thức giao</span></Button>}
        {filters.eventTypes.length !== 4 && <Button type="button" variant="secondary" size="sm" className="h-auto max-w-full whitespace-normal text-left" onClick={() => apply({ ...filters, eventTypes: [...assignmentEventTypes] })}>Sự kiện: {filters.eventTypes.map((type) => assignmentEventLabels[type]).join(", ")}<X aria-hidden="true" data-icon="inline-end" /><span className="sr-only">Bỏ lọc loại sự kiện</span></Button>}
      </div>
      {report.isPending && <Skeleton className="h-64" />}
      {report.isError && <ErrorState title="Không thể tải báo cáo phân bổ lead" description="Vui lòng thử lại để cập nhật số liệu." onReload={() => report.refetch()} />}
      {report.isSuccess && <AssignmentReportResults report={report.data} filters={filters} busy={report.isFetching} pagination={pagination} sorting={sorting}
        onPaginationChange={setPagination} onSortingChange={(updater) => { setSorting(updater); setPagination({ ...pagination, pageIndex: 0 }); }} onOpen={setTarget} />}
      {target && <AssignmentReportDetails key={`${JSON.stringify(query)}:${target.type}:${target.assigneeId ?? "all"}`} query={query} target={target} onClose={() => setTarget(null)} />}
    </CardContent>
  </Card>;
}
