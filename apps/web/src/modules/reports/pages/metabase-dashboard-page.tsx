import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BarChart3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Minus, RefreshCw, Save, Settings2, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { DashboardKpiEditorDialog } from "@/modules/reports/components/dashboard-kpi-editor-dialog";
import { ReportResult } from "@/modules/reports/pages/personal-reports-page";
import type { DashboardKpiWidgetInput, DashboardKpiWidgetResult, PersonalReportDatasetDefinition, PersonalReportResult } from "@/modules/reports/report.types";
import { getPersonalDashboard, getPersonalReportOptions, updatePersonalDashboardConfig } from "@/services/report.service";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const gridClasses: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5",
};

export function MetabaseDashboardPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { selectedProgramId } = useInstitutionProgram();
  const [isManaging, setIsManaging] = useState(false);
  const [draftReportIds, setDraftReportIds] = useState<string[]>([]);
  const [draftKpis, setDraftKpis] = useState<DashboardKpiWidgetInput[]>([]);
  const [draftColumnCount, setDraftColumnCount] = useState(4);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const dashboardQuery = useQuery({
    queryKey: ["reports", "personal", "dashboard", selectedProgramId],
    queryFn: () => getPersonalDashboard(auth.accessToken!),
    enabled: Boolean(auth.accessToken && selectedProgramId),
  });
  const optionsQuery = useQuery({
    queryKey: ["reports", "personal", "options"],
    queryFn: () => getPersonalReportOptions(auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });
  const saveMutation = useMutation({
    mutationFn: () => updatePersonalDashboardConfig(draftReportIds, auth.accessToken!, { columnCount: draftColumnCount, kpiWidgets: draftKpis }),
    onSuccess: async () => {
      setIsManaging(false);
      setEditingKpiId(null);
      await queryClient.invalidateQueries({ queryKey: ["reports", "personal", "dashboard"] });
    },
  });
  const widgetById = new Map((dashboardQuery.data?.widgets ?? []).map((widget) => [widget.reportId, widget]));
  const resultByKpiId = new Map((dashboardQuery.data?.kpiWidgets ?? []).map((widget) => [widget.id, widget]));
  const visibleWidgets = isManaging ? draftReportIds.flatMap((reportId) => widgetById.get(reportId) ?? []) : (dashboardQuery.data?.widgets ?? []);
  const visibleKpis = isManaging
    ? draftKpis.map((config) => ({ config, result: resultByKpiId.get(config.id) ?? previewKpi(config, optionsQuery.data?.datasets ?? [], dashboardQuery.data?.pipelineStages ?? []) }))
    : (dashboardQuery.data?.kpiWidgets ?? []).map((result) => ({ result, config: dashboardQuery.data?.kpiConfig.find((item) => item.id === result.id) }));
  const editingKpi = draftKpis.find((widget) => widget.id === editingKpiId) ?? null;

  function beginManaging() {
    if (!dashboardQuery.data) return;
    setDraftReportIds(dashboardQuery.data.widgets.map((widget) => widget.reportId));
    setDraftKpis(dashboardQuery.data.kpiConfig);
    setDraftColumnCount(dashboardQuery.data.columnCount);
    saveMutation.reset();
    setIsManaging(true);
  }

  function changeKpiCount(nextCount: number) {
    setDraftKpis((current) => {
      if (nextCount <= current.length) return current.slice(0, nextCount);
      const dataset = optionsQuery.data?.datasets[0];
      if (!dataset) return current;
      return [...current, ...Array.from({ length: nextCount - current.length }, () => newCountKpi(dataset))];
    });
  }

  function moveReport(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= draftReportIds.length) return;
    setDraftReportIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveKpi(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= draftKpis.length) return;
    setDraftKpis((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Báo cáo"
        title="Dashboard thống kê"
        scopeLabel="Theo dashboard cá nhân"
        description="Theo dõi KPI và các báo cáo bạn đã chọn, trong đúng chương trình và phạm vi dữ liệu được cấp."
        actions={isManaging ? <>
          <Button variant="outline" onClick={() => { setIsManaging(false); setEditingKpiId(null); }} disabled={saveMutation.isPending}><X data-icon="inline-start" />Hủy</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || draftKpis.length === 0}><Save data-icon="inline-start" />{saveMutation.isPending ? "Đang lưu…" : "Lưu dashboard"}</Button>
        </> : <>
          {auth.can("report.personal.update") && <Button variant="outline" onClick={beginManaging} disabled={!dashboardQuery.data}><Settings2 data-icon="inline-start" />Quản lý dashboard</Button>}
          <Button variant="outline" onClick={() => void dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}><RefreshCw data-icon="inline-start" className={dashboardQuery.isFetching ? "motion-safe:animate-spin" : undefined} />{dashboardQuery.isFetching ? "Đang tải…" : "Tải lại"}</Button>
        </>}
      />

      {saveMutation.isError && <Alert variant="destructive"><AlertTitle>Không thể lưu dashboard</AlertTitle><AlertDescription>Hãy kiểm tra cấu hình KPI, quyền truy cập và các báo cáo đã chọn rồi thử lại.</AlertDescription></Alert>}

      {dashboardQuery.isLoading ? <DashboardSkeleton /> : dashboardQuery.isError || !dashboardQuery.data ? (
        <Alert variant="destructive"><AlertTitle>Không thể tải dashboard</AlertTitle><AlertDescription>Vui lòng kiểm tra quyền, chương trình đang chọn hoặc kết nối máy chủ rồi thử lại.</AlertDescription></Alert>
      ) : <>
        {isManaging && <DashboardLayoutManager
          kpiCount={draftKpis.length}
          maximumKpis={dashboardQuery.data.maximumKpis}
          columnCount={draftColumnCount}
          onKpiCountChange={changeKpiCount}
          onColumnCountChange={setDraftColumnCount}
        />}

        <section className={`grid gap-4 ${gridClasses[isManaging ? draftColumnCount : dashboardQuery.data.columnCount] ?? gridClasses[4]}`} aria-label="KPI tổng quan">
          {visibleKpis.map(({ config, result }, index) => <KpiCard
            key={result.id}
            result={result}
            isManaging={isManaging}
            onCustomize={config ? () => setEditingKpiId(config.id) : undefined}
            onMoveLeft={isManaging && index > 0 ? () => moveKpi(index, -1) : undefined}
            onMoveRight={isManaging && index < visibleKpis.length - 1 ? () => moveKpi(index, 1) : undefined}
          />)}
        </section>

        {isManaging && <DashboardReportManager
          widgets={draftReportIds.flatMap((id) => widgetById.get(id) ?? [])}
          onMove={moveReport}
          onRemove={(reportId) => setDraftReportIds((current) => current.filter((id) => id !== reportId))}
        />}

        {visibleWidgets.length === 0 ? <Card><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><BarChart3 /></EmptyMedia><EmptyTitle>Chưa có báo cáo trên dashboard</EmptyTitle><EmptyDescription>Hãy mở danh sách báo cáo đã lưu và chọn “Sử dụng cho dashboard”.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild><Link to="/bao-cao/kpi-ca-nhan">Chọn báo cáo</Link></Button></EmptyContent></Empty></CardContent></Card> : (
          <section className="grid gap-6" aria-label="Báo cáo tùy chỉnh trên dashboard">{visibleWidgets.map((widget) => <DashboardReportWidget key={widget.reportId} result={widget.result} />)}</section>
        )}
      </>}

      {editingKpi && optionsQuery.data && dashboardQuery.data && <DashboardKpiEditorDialog
        key={editingKpi.id}
        widget={editingKpi}
        datasets={optionsQuery.data.datasets}
        pipelineStages={dashboardQuery.data.pipelineStages}
        accessToken={auth.accessToken!}
        onCancel={() => setEditingKpiId(null)}
        onSave={(widget) => { setDraftKpis((current) => current.map((item) => item.id === widget.id ? widget : item)); setEditingKpiId(null); }}
      />}
    </div>
  );
}

function DashboardLayoutManager({ kpiCount, maximumKpis, columnCount, onKpiCountChange, onColumnCountChange }: {
  kpiCount: number; maximumKpis: number; columnCount: number; onKpiCountChange: (value: number) => void; onColumnCountChange: (value: number) => void;
}) {
  return <Card><CardHeader><CardTitle>Bố cục ô KPI</CardTitle><CardDescription>Chọn số ô và số cột. Bấm “Tùy chỉnh” trên từng ô để chọn loại thống kê riêng.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
    <Field><FieldLabel>Số lượng ô KPI</FieldLabel><Select value={String(kpiCount)} onValueChange={(value) => onKpiCountChange(Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Array.from({ length: maximumKpis }, (_, index) => index + 1).map((value) => <SelectItem key={value} value={String(value)}>{value} ô</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Số cột hiển thị</FieldLabel><Select value={String(columnCount)} onValueChange={(value) => onColumnCountChange(Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[1, 2, 3, 4, 5].map((value) => <SelectItem key={value} value={String(value)}>{value} cột</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </CardContent></Card>;
}

function KpiCard({ result, isManaging, onCustomize, onMoveLeft, onMoveRight }: {
  result: DashboardKpiWidgetResult; isManaging: boolean; onCustomize?: () => void; onMoveLeft?: () => void; onMoveRight?: () => void;
}) {
  return <Card className="min-h-44"><CardHeader className="h-full gap-3">
    <div className="flex items-start justify-between gap-2"><CardDescription className="line-clamp-2">{result.title}</CardDescription>{isManaging && onCustomize && <Button type="button" size="sm" variant="ghost" onClick={onCustomize}><Settings2 data-icon="inline-start" />Tùy chỉnh</Button>}</div>
    <CardTitle className="text-4xl tabular-nums">{numberFormatter.format(result.value)}{result.format === "PERCENT" ? "%" : ""}</CardTitle>
    <div className="mt-auto flex flex-col gap-1 text-sm text-muted-foreground">
      {result.trend ? <TrendLabel trend={result.trend} /> : <span>{result.description}</span>}
      {result.trend && result.description.startsWith("Bộ lọc:") && <span>{result.description}</span>}
    </div>
    {isManaging && <div className="flex justify-end gap-2 border-t pt-2"><Button type="button" size="icon" variant="outline" onClick={onMoveLeft} disabled={!onMoveLeft} aria-label={`Di chuyển ${result.title} sang trái`}><ChevronLeft /></Button><Button type="button" size="icon" variant="outline" onClick={onMoveRight} disabled={!onMoveRight} aria-label={`Di chuyển ${result.title} sang phải`}><ChevronRight /></Button></div>}
  </CardHeader></Card>;
}

function TrendLabel({ trend }: { trend: NonNullable<DashboardKpiWidgetResult["trend"]> }) {
  if (trend.direction === "FLAT") return <span className="flex items-center gap-1.5"><Minus className="size-4" aria-hidden="true" />Không thay đổi so với {trend.previousLabel}</span>;
  const isUp = trend.direction === "UP";
  const Icon = isUp ? ArrowUp : ArrowDown;
  return <span className={`flex items-center gap-1.5 font-medium ${isUp ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}><Icon className="size-4" aria-hidden="true" />{isUp ? "Tăng" : "Giảm"} {numberFormatter.format(trend.percentageChange)}% so với {trend.previousLabel}</span>;
}

function DashboardReportManager({ widgets, onMove, onRemove }: {
  widgets: Array<{ reportId: string; result: PersonalReportResult }>;
  onMove: (index: number, offset: number) => void;
  onRemove: (reportId: string) => void;
}) {
  return <Card><CardHeader><CardTitle>Báo cáo đã ghim</CardTitle><CardDescription>Sắp xếp hoặc bỏ báo cáo khỏi dashboard. Báo cáo gốc không bị xóa.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {widgets.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Chưa có báo cáo được ghim.</p> : widgets.map((widget, index) => <div key={widget.reportId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span className="min-w-0 flex-1 font-medium">{widget.result.report.name}</span>
      <Button size="icon" variant="outline" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Đưa ${widget.result.report.name} lên trên`}><ChevronUp /></Button>
      <Button size="icon" variant="outline" onClick={() => onMove(index, 1)} disabled={index === widgets.length - 1} aria-label={`Đưa ${widget.result.report.name} xuống dưới`}><ChevronDown /></Button>
      <Button size="sm" variant="outline" asChild><Link to={`/bao-cao/kpi-ca-nhan?reportId=${widget.reportId}`}><ExternalLink data-icon="inline-start" />Mở để chỉnh sửa</Link></Button>
      <Button size="sm" variant="ghost" onClick={() => onRemove(widget.reportId)}><Trash2 data-icon="inline-start" />Bỏ khỏi dashboard</Button>
    </div>)}
  </CardContent></Card>;
}

function DashboardReportWidget({ result }: { result: PersonalReportResult }) {
  return <Card><CardHeader><CardTitle>{result.report.name}</CardTitle><CardDescription>Báo cáo tùy chỉnh · dữ liệu được tính lại theo phạm vi hiện tại</CardDescription></CardHeader><CardContent><ReportResult isLoading={false} isError={false} result={result} /></CardContent></Card>;
}

function newCountKpi(dataset: PersonalReportDatasetDefinition): DashboardKpiWidgetInput {
  return { id: crypto.randomUUID(), type: "COUNT", datasetKey: dataset.key, conditions: [] };
}

function previewKpi(config: DashboardKpiWidgetInput, datasets: PersonalReportDatasetDefinition[], stages: Array<{ id: string; name: string }>): DashboardKpiWidgetResult {
  const dataset = datasets.find((item) => item.key === config.datasetKey);
  const source = stages.find((stage) => stage.id === config.sourceStageId)?.name;
  const target = stages.find((stage) => stage.id === config.targetStageId)?.name;
  const period = config.comparisonPeriod === "WEEK" ? "tuần này" : config.comparisonPeriod === "QUARTER" ? "quý này" : "tháng này";
  const title = config.title || (config.type === "CONVERSION" ? `Tỷ lệ chuyển đổi từ ${source ?? "tiến trình nguồn"} sang ${target ?? "tiến trình đích"}` : config.type === "TREND" ? `${dataset?.label ?? "Dữ liệu"} ${period}` : `Tổng số ${dataset?.label.toLocaleLowerCase("vi") ?? "bản ghi"}`);
  return { id: config.id, type: config.type, title, description: "Cấu hình mới sẽ được tính sau khi lưu dashboard.", value: 0, format: config.type === "CONVERSION" ? "PERCENT" : "NUMBER", trend: null };
}

function DashboardSkeleton() {
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div><Skeleton className="h-80" /></>;
}
