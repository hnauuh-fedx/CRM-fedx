import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BarChart3, Download, FileSpreadsheet, LayoutDashboard, Pencil, Plus, RefreshCw, Share2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ReportFilterEditor } from "@/modules/reports/components/report-filter-editor";
import type {
  PersonalReport,
  PersonalReportChartType,
  PersonalReportDateGranularity,
  PersonalReportDatasetDefinition,
  PersonalReportFilterCondition,
  PersonalReportInput,
  PersonalReportModule,
} from "@/modules/reports/report.types";
import {
  archivePersonalReport,
  createPersonalReport,
  exportPersonalReport,
  getPersonalReportOptions,
  getPersonalReportResult,
  getPersonalDashboardConfig,
  listPersonalReports,
  setPersonalReportSharing,
  updatePersonalReport,
  updatePersonalDashboardConfig,
} from "@/services/report.service";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

type FormState = PersonalReportInput;

export function PersonalReportsPage() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("reportId"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [message, setMessage] = useState<string | null>(null);

  const optionsQuery = useQuery({ queryKey: ["reports", "personal", "options"], queryFn: () => getPersonalReportOptions(auth.accessToken!) });
  const reportsQuery = useQuery({ queryKey: ["reports", "personal"], queryFn: () => listPersonalReports(auth.accessToken!) });
  const dashboardConfigQuery = useQuery({
    queryKey: ["reports", "personal", "dashboard", "config", selectedProgramId],
    queryFn: () => getPersonalDashboardConfig(auth.accessToken!),
    enabled: Boolean(auth.accessToken && selectedProgramId),
  });
  const selectedReport = reportsQuery.data?.items.find((report) => report.id === selectedId) ?? null;
  const resultQuery = useQuery({
    queryKey: ["reports", "personal", selectedId, "result"],
    queryFn: () => getPersonalReportResult(selectedId!, auth.accessToken!),
    enabled: Boolean(selectedId),
  });
  const selectedDefinition = optionsQuery.data?.modules.find((module) => module.key === form.module);

  const saveMutation = useMutation({
    mutationFn: () => editingId ? updatePersonalReport(editingId, form, auth.accessToken!) : createPersonalReport(form, auth.accessToken!),
    onSuccess: async (report) => {
      setMessage(editingId ? "Đã cập nhật báo cáo KPI." : "Đã tạo và lưu báo cáo KPI.");
      setSelectedId(report.id);
      setShowBuilder(false);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["reports", "personal"] });
    },
  });
  const shareMutation = useMutation({
    mutationFn: (report: PersonalReport) => setPersonalReportSharing(report.id, !report.isShared, auth.accessToken!),
    onSuccess: async () => { setMessage("Đã cập nhật trạng thái chia sẻ."); await queryClient.invalidateQueries({ queryKey: ["reports", "personal"] }); },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archivePersonalReport(id, auth.accessToken!),
    onSuccess: async () => { setSelectedId(null); setMessage("Đã lưu trữ báo cáo."); await queryClient.invalidateQueries({ queryKey: ["reports", "personal"] }); },
  });
  const exportMutation = useMutation({ mutationFn: ({ id, format }: { id: string; format: "csv" | "xlsx" }) => exportPersonalReport(id, format, auth.accessToken!) });
  const dashboardMutation = useMutation({
    mutationFn: (reportId: string) => {
      const current = dashboardConfigQuery.data?.reportIds ?? [];
      const reportIds = current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId];
      return updatePersonalDashboardConfig(reportIds, auth.accessToken!);
    },
    onSuccess: async () => {
      setMessage("Đã cập nhật dashboard cá nhân.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports", "personal", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reports", "personal", "dashboard", "config"] }),
      ]);
    },
  });

  function beginCreate() {
    const firstDataset = optionsQuery.data?.datasets[0];
    setForm(firstDataset ? singleDatasetForm("", "TABLE", firstDataset) : emptyForm());
    setEditingId(null);
    setShowBuilder(true);
    setMessage(null);
  }

  function beginEdit(report: PersonalReport) {
    const reportDataset = optionsQuery.data?.datasets.find((item) => item.key === report.filters.datasetKey);
    const legacyCondition: PersonalReportFilterCondition[] = reportDataset && report.filters.timePreset
      ? [report.filters.timePreset === "CUSTOM"
        ? { fieldKey: reportDataset.primaryDateField, operator: "DATE_BETWEEN", fromDate: report.filters.fromDate, toDate: report.filters.toDate }
        : { fieldKey: reportDataset.primaryDateField, operator: "DATE_PRESET", value: report.filters.timePreset }]
      : [];
    setForm({
      name: report.name,
      module: report.module,
      metricKeys: report.metricKeys,
      breakdownKey: report.breakdownKey,
      chartType: report.chartType,
      fromDate: report.filters.fromDate,
      toDate: report.filters.toDate,
      mode: report.filters.mode ?? "SUMMARY",
      datasetKey: report.filters.datasetKey,
      rowDimensionKey: report.filters.rowDimensionKey,
      columnDimensionKey: report.filters.columnDimensionKey,
      timePreset: undefined,
      dateGranularity: report.filters.dateGranularity,
      singleDimensionKey: report.filters.singleDimensionKey,
      singleDisplay: report.filters.singleDisplay,
      conditions: report.filters.conditions ?? legacyCondition,
    });
    setEditingId(report.id);
    setShowBuilder(true);
    setMessage(null);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader eyebrow="Báo cáo" title="Báo cáo thống kê" scopeLabel="Theo quyền của người đang xem" description="Tạo thống kê một trường dạng bảng hoặc đường, bảng hai chiều và KPI tổng hợp. Số liệu luôn được tính lại theo phạm vi truy cập của từng người." />
      {message && <Alert><AlertTitle>Hoàn tất</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={beginCreate}><Plus data-icon="inline-start" />Tạo báo cáo thống kê</Button>
        <Button variant="outline" asChild><a href="/bao-cao/dashboard"><BarChart3 data-icon="inline-start" />Dashboard chuẩn</a></Button>
      </div>

      {showBuilder && selectedDefinition && (
        <ReportBuilder
          form={form}
          definitions={optionsQuery.data?.modules ?? []}
          datasets={optionsQuery.data?.datasets ?? []}
          accessToken={auth.accessToken!}
          isEditing={Boolean(editingId)}
          isPending={saveMutation.isPending}
          error={saveMutation.isError ? "Không thể lưu báo cáo. Vui lòng kiểm tra dữ liệu và thử lại." : null}
          onChange={setForm}
          onCancel={() => setShowBuilder(false)}
          onSubmit={() => saveMutation.mutate()}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Báo cáo đã lưu</CardTitle><CardDescription>Gồm báo cáo của bạn và mẫu được đồng nghiệp chia sẻ.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {reportsQuery.isLoading ? <><Skeleton className="h-20" /><Skeleton className="h-20" /></> : reportsQuery.data?.items.length ? reportsQuery.data.items.map((report) => (
              <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className="flex min-h-16 w-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={selectedId === report.id}>
                <span className="flex w-full items-center justify-between gap-2"><span className="font-medium">{report.name}</span>{report.isShared && <Badge variant="secondary">Đã chia sẻ</Badge>}</span>
                <span className="text-sm text-muted-foreground">{report.ownerId === auth.user?.id ? "Của tôi" : `Chia sẻ bởi ${report.ownerName}`}</span>
              </button>
            )) : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia><EmptyTitle>Chưa có báo cáo thống kê</EmptyTitle><EmptyDescription>Tạo báo cáo đầu tiên từ các trường dữ liệu được phép.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={beginCreate}>Tạo báo cáo</Button></EmptyContent></Empty>}
          </CardContent>
        </Card>

        <Card>
          {!selectedReport ? (
            <CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><BarChart3 /></EmptyMedia><EmptyTitle>Chọn một báo cáo</EmptyTitle><EmptyDescription>Kết quả và bảng dữ liệu sẽ hiển thị tại đây.</EmptyDescription></EmptyHeader></Empty></CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{selectedReport.name}</CardTitle>
                <CardDescription>{selectedReport.ownerId === auth.user?.id ? "Báo cáo của bạn" : `Mẫu của ${selectedReport.ownerName}; dữ liệu bên dưới dùng scope của bạn.`}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-wrap gap-2">
                  {auth.can("report.personal.update") && <Button
                    size="sm"
                    variant={dashboardConfigQuery.data?.reportIds.includes(selectedReport.id) ? "secondary" : "outline"}
                    onClick={() => dashboardMutation.mutate(selectedReport.id)}
                    disabled={dashboardMutation.isPending || dashboardConfigQuery.isLoading || selectedReport.institutionProgramId !== selectedProgramId || (!dashboardConfigQuery.data?.reportIds.includes(selectedReport.id) && (dashboardConfigQuery.data?.reportIds.length ?? 0) >= (dashboardConfigQuery.data?.maximumWidgets ?? 12))}
                  >
                    <LayoutDashboard data-icon="inline-start" />
                    {dashboardConfigQuery.data?.reportIds.includes(selectedReport.id) ? "Bỏ khỏi dashboard" : "Sử dụng cho dashboard"}
                  </Button>}
                  <Button size="sm" variant="outline" onClick={() => void resultQuery.refetch()} disabled={resultQuery.isFetching}>
                    <RefreshCw data-icon="inline-start" className={resultQuery.isFetching ? "motion-safe:animate-spin" : undefined} />
                    {resultQuery.isFetching ? "Đang tải…" : "Tải lại"}
                  </Button>
                  {selectedReport.ownerId === auth.user?.id && <Button size="sm" variant="outline" onClick={() => beginEdit(selectedReport)}><Pencil data-icon="inline-start" />Chỉnh sửa</Button>}
                  {selectedReport.ownerId === auth.user?.id && auth.can("report.personal.share") && <Button size="sm" variant="outline" onClick={() => shareMutation.mutate(selectedReport)} disabled={shareMutation.isPending}><Share2 data-icon="inline-start" />{selectedReport.isShared ? "Dừng chia sẻ" : "Chia sẻ"}</Button>}
                  {auth.can("report.personal.export") && <Button size="sm" variant="outline" onClick={() => exportMutation.mutate({ id: selectedReport.id, format: "xlsx" })}><Download data-icon="inline-start" />Excel</Button>}
                  {auth.can("report.personal.export") && <Button size="sm" variant="outline" onClick={() => exportMutation.mutate({ id: selectedReport.id, format: "csv" })}><Download data-icon="inline-start" />CSV</Button>}
                  {selectedReport.ownerId === auth.user?.id && <Button size="sm" variant="ghost" onClick={() => archiveMutation.mutate(selectedReport.id)}><Archive data-icon="inline-start" />Lưu trữ</Button>}
                </div>
                {(exportMutation.isError || shareMutation.isError || archiveMutation.isError || dashboardMutation.isError) && <Alert variant="destructive"><AlertTitle>Không thể thực hiện thao tác</AlertTitle><AlertDescription>Vui lòng thử lại hoặc kiểm tra quyền và chương trình đang chọn.</AlertDescription></Alert>}
                <ReportResult
                  isLoading={resultQuery.isLoading || (resultQuery.isFetching && !resultQuery.data)}
                  isError={resultQuery.isError && !resultQuery.isFetching}
                  result={resultQuery.data}
                />
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReportBuilder({ form, definitions, datasets, accessToken, isEditing, isPending, error, onChange, onCancel, onSubmit }: {
  form: FormState;
  definitions: Awaited<ReturnType<typeof getPersonalReportOptions>>["modules"];
  datasets: Awaited<ReturnType<typeof getPersonalReportOptions>>["datasets"];
  accessToken: string;
  isEditing: boolean;
  isPending: boolean;
  error: string | null;
  onChange: (value: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const definition = definitions.find((item) => item.key === form.module)!;
  const dataset = datasets.find((item) => item.key === form.datasetKey) ?? datasets[0];
  const isSingle = form.mode === "SINGLE";
  const isPivot = form.mode === "PIVOT";
  const reportKind = isSingle ? `SINGLE_${form.singleDisplay ?? "TABLE"}` : (form.mode ?? "PIVOT");
  const conditionsValid = (form.conditions ?? []).every((condition) => condition.operator === "DATE_BETWEEN"
    ? Boolean(condition.fromDate && condition.toDate && condition.toDate >= condition.fromDate)
    : Boolean(condition.value));
  const valid = form.name.trim().length >= 3 && (isSingle
    ? Boolean(dataset && form.singleDimensionKey && form.singleDisplay && (dataset.fields.find((item) => item.key === form.singleDimensionKey)?.type !== "DATE" || form.dateGranularity) && conditionsValid)
    : isPivot
      ? Boolean(dataset && form.rowDimensionKey && form.columnDimensionKey && form.rowDimensionKey !== form.columnDimensionKey && (![form.rowDimensionKey, form.columnDimensionKey].some((key) => dataset.fields.find((item) => item.key === key)?.type === "DATE") || form.dateGranularity) && conditionsValid)
      : form.metricKeys.length > 0);
  function selectDataset(nextDataset: PersonalReportDatasetDefinition) {
    const first = nextDataset.fields[0];
    const second = nextDataset.fields.find((item) => item.key !== first?.key);
    onChange({
      ...form,
      datasetKey: nextDataset.key,
      module: nextDataset.module,
      metricKeys: [nextDataset.countMetricKey],
      singleDimensionKey: first?.key,
      rowDimensionKey: first?.key,
      columnDimensionKey: second?.key,
      conditions: [],
      dateGranularity: "DAY",
    });
  }
  return (
    <Card>
      <CardHeader><CardTitle>{isEditing ? "Chỉnh sửa báo cáo thống kê" : "Tạo báo cáo thống kê"}</CardTitle><CardDescription>Chỉ trường dữ liệu trong danh mục an toàn được truy vấn; không có số điện thoại, email, CCCD hoặc ghi chú riêng tư.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(); }}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="personal-report-name">Tên báo cáo</FieldLabel><Input id="personal-report-name" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Ví dụ: Khách hàng theo nguồn trong tháng này" maxLength={255} required /></Field>
            <Field><FieldLabel>Loại báo cáo</FieldLabel><Select value={reportKind} onValueChange={(value) => onChange(value === "SINGLE_TABLE" ? singleDatasetForm(form.name, "TABLE", dataset) : value === "SINGLE_LINE" ? singleDatasetForm(form.name, "LINE", dataset) : value === "PIVOT" ? pivotDatasetForm(form.name, dataset) : summaryForm(form.name, definitions))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="SINGLE_TABLE">Thống kê 1 trường dạng bảng</SelectItem><SelectItem value="SINGLE_LINE">Thống kê 1 trường dạng biểu đồ đường</SelectItem><SelectItem value="PIVOT">Thống kê 2 trường dạng bảng</SelectItem><SelectItem value="SUMMARY">KPI tổng hợp</SelectItem></SelectGroup></SelectContent></Select></Field>
            {isSingle && dataset ? <>
              <div className="grid gap-5 md:grid-cols-2">
                <Field><FieldLabel>Kho dữ liệu</FieldLabel><Select value={dataset.key} onValueChange={(value) => selectDataset(datasets.find((item) => item.key === value)!)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{datasets.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>Output 1</FieldLabel><Select value={form.singleDimensionKey} onValueChange={(value) => onChange({ ...form, singleDimensionKey: value as FormState["singleDimensionKey"] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.singleDimensions.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {dataset.fields.find((item) => item.key === form.singleDimensionKey)?.type === "DATE" && <Field><FieldLabel>Nhóm thời gian của Output</FieldLabel><Select value={form.dateGranularity} onValueChange={(value) => onChange({ ...form, dateGranularity: value as PersonalReportDateGranularity })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.dateGranularities.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
              </div>
              <ReportFilterEditor dataset={dataset} conditions={form.conditions ?? []} accessToken={accessToken} onChange={(conditions) => onChange({ ...form, conditions })} />
              <Alert><AlertTitle>Phép tính</AlertTitle><AlertDescription>Đếm số khách hàng theo {dataset.singleDimensions.find((item) => item.key === form.singleDimensionKey)?.label.toLocaleLowerCase("vi") ?? "Output 1"} và hiển thị dưới dạng {form.singleDisplay === "LINE" ? "biểu đồ đường" : "bảng có tỷ trọng"}.</AlertDescription></Alert>
            </> : isPivot && dataset ? <>
              <div className="grid gap-5 md:grid-cols-3">
                <Field><FieldLabel>Kho dữ liệu</FieldLabel><Select value={dataset.key} onValueChange={(value) => selectDataset(datasets.find((item) => item.key === value)!)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{datasets.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>Output 1 · Dòng</FieldLabel><Select value={form.rowDimensionKey} onValueChange={(value) => onChange({ ...form, rowDimensionKey: value as FormState["rowDimensionKey"] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.rowDimensions.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>Output 2 · Cột</FieldLabel><Select value={form.columnDimensionKey} onValueChange={(value) => onChange({ ...form, columnDimensionKey: value as FormState["columnDimensionKey"] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.columnDimensions.filter((item) => item.key !== form.rowDimensionKey).map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {[form.rowDimensionKey, form.columnDimensionKey].some((key) => dataset.fields.find((item) => item.key === key)?.type === "DATE") && <Field><FieldLabel>Nhóm thời gian của Output</FieldLabel><Select value={form.dateGranularity} onValueChange={(value) => onChange({ ...form, dateGranularity: value as PersonalReportDateGranularity })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{dataset.dateGranularities.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
              </div>
              <ReportFilterEditor dataset={dataset} conditions={form.conditions ?? []} accessToken={accessToken} onChange={(conditions) => onChange({ ...form, conditions })} />
              <Alert><AlertTitle>Phép tính</AlertTitle><AlertDescription>Đếm số khách hàng theo {dataset.rowDimensions.find((item) => item.key === form.rowDimensionKey)?.label.toLocaleLowerCase("vi") ?? "Output 1"} và {dataset.columnDimensions.find((item) => item.key === form.columnDimensionKey)?.label.toLocaleLowerCase("vi") ?? "Output 2"}. Báo cáo chia sẻ vẫn tính lại theo quyền của người xem.</AlertDescription></Alert>
            </> : <>
              <div className="grid gap-5 md:grid-cols-2">
                <Field><FieldLabel>Module dữ liệu</FieldLabel><Select value={form.module} onValueChange={(value) => { const next = definitions.find((item) => item.key === value)!; onChange({ ...form, module: value as PersonalReportModule, metricKeys: next.metrics[0] ? [next.metrics[0].key] : [], breakdownKey: null }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{definitions.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>Kiểu hiển thị</FieldLabel><Select value={form.chartType} onValueChange={(value) => onChange({ ...form, chartType: value as PersonalReportChartType })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="BAR">Biểu đồ cột</SelectItem><SelectItem value="TABLE">Bảng dữ liệu</SelectItem><SelectItem value="KPI">Thẻ KPI</SelectItem></SelectGroup></SelectContent></Select></Field>
              </div>
              <FieldSet><FieldLegend variant="label">Chỉ số KPI (tối đa 6)</FieldLegend><div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{definition.metrics.map((metric) => { const checked = form.metricKeys.includes(metric.key); return <Field key={metric.key} orientation="horizontal" data-disabled={!checked && form.metricKeys.length >= 6}><Checkbox id={`metric-${metric.key}`} checked={checked} disabled={!checked && form.metricKeys.length >= 6} onCheckedChange={(value) => onChange({ ...form, metricKeys: value === true ? [...form.metricKeys, metric.key] : form.metricKeys.filter((key) => key !== metric.key) })} /><FieldLabel htmlFor={`metric-${metric.key}`}>{metric.label}</FieldLabel></Field>; })}</div></FieldSet>
              <Field><FieldLabel>Phân tích theo</FieldLabel><Select value={form.breakdownKey ?? "NONE"} onValueChange={(value) => onChange({ ...form, breakdownKey: value === "NONE" ? null : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="NONE">Không phân nhóm</SelectItem>{definition.breakdowns.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field><FieldLabel>Khoảng thời gian</FieldLabel><DateRangeFilter fromDate={form.fromDate ?? ""} toDate={form.toDate ?? ""} onChange={(fromDate, toDate) => onChange({ ...form, fromDate, toDate })} /></Field>
            </>}
            {error && <Alert variant="destructive"><AlertTitle>Không thể lưu</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={onCancel}>Hủy</Button><Button type="submit" disabled={!valid || isPending}>{isPending ? "Đang lưu…" : "Lưu báo cáo"}</Button></div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function ReportResult({ isLoading, isError, result }: { isLoading: boolean; isError: boolean; result?: Awaited<ReturnType<typeof getPersonalReportResult>> }) {
  const max = useMemo(() => Math.max(...(result?.rows.map((row) => row.value) ?? [0]), 1), [result]);
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (isError || !result) return <Alert variant="destructive"><AlertTitle>Không thể tải số liệu</AlertTitle><AlertDescription>Không tìm thấy báo cáo trong phạm vi của bạn hoặc máy chủ đang bận.</AlertDescription></Alert>;
  return <div className="flex flex-col gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{result.summary.map((item) => <Card key={item.key}><CardHeader><CardDescription>{item.label}</CardDescription><CardTitle className="text-2xl">{formatMetric(item.value, item.format)}</CardTitle></CardHeader></Card>)}</div>
    {result.pivot && <PivotResult pivot={result.pivot} />}
    {result.single ? <SingleDimensionResult single={result.single} rows={result.rows} /> : result.rows.length > 0 && <>
      {result.report.chartType === "BAR" && <div className="flex flex-col gap-3" role="img" aria-label={`Biểu đồ ${result.report.name}. Bảng dữ liệu chi tiết nằm ngay bên dưới.`}>{result.rows.map((row) => <div key={row.label} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-sm"><span className="truncate" title={row.label}>{row.label}</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` }} /></div><span className="tabular-nums">{numberFormatter.format(row.value)}</span></div>)}</div>}
      <Table><TableHeader><TableRow><TableHead>Nhóm phân tích</TableHead><TableHead className="text-right">Giá trị</TableHead></TableRow></TableHeader><TableBody>{result.rows.map((row) => <TableRow key={row.label}><TableCell>{row.label}</TableCell><TableCell className="text-right tabular-nums">{numberFormatter.format(row.value)}</TableCell></TableRow>)}</TableBody></Table>
    </>}
  </div>;
}

function SingleDimensionResult({ single, rows }: {
  single: NonNullable<Awaited<ReturnType<typeof getPersonalReportResult>>["single"]>;
  rows: Awaited<ReturnType<typeof getPersonalReportResult>>["rows"];
}) {
  if (rows.length === 0) return <Empty><EmptyHeader><EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia><EmptyTitle>Không có dữ liệu trong kỳ</EmptyTitle><EmptyDescription>Hãy chọn một khoảng thời gian khác hoặc kiểm tra phạm vi dữ liệu được cấp.</EmptyDescription></EmptyHeader></Empty>;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <div className="flex flex-col gap-4">
    <div><h3 className="font-semibold">{single.datasetLabel} theo {single.dimensionLabel.toLocaleLowerCase("vi")}</h3><p className="text-sm text-muted-foreground">{single.range ? `Từ ${formatIsoDate(single.range.fromDate)} đến ${formatIsoDate(single.range.toDate)} · ` : ""}Đơn vị: bản ghi.</p></div>
    {single.display === "LINE" && <SingleLineChart label={single.dimensionLabel} rows={rows} />}
    <Table><TableHeader><TableRow><TableHead>{single.dimensionLabel}</TableHead><TableHead className="text-right">Số lượng</TableHead><TableHead className="min-w-48">Tỷ lệ</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{numberFormatter.format(row.value)}</TableCell><TableCell><div className="flex items-center gap-3"><span className="w-14 text-right text-sm tabular-nums">{numberFormatter.format(row.percentage ?? 0)}%</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${row.percentage ?? 0}%` }} /></div></div></TableCell></TableRow>)}<TableRow className="bg-muted/50"><TableCell className="font-semibold">Tổng</TableCell><TableCell className="text-right font-semibold tabular-nums">{numberFormatter.format(total)}</TableCell><TableCell className="font-semibold">100%</TableCell></TableRow></TableBody></Table>
  </div>;
}

function SingleLineChart({ label, rows }: { label: string; rows: Awaited<ReturnType<typeof getPersonalReportResult>>["rows"] }) {
  const width = 800;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 92, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const points = rows.map((row, index) => ({
    ...row,
    x: padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (row.value / maxValue) * plotHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const tickStep = Math.max(1, Math.ceil(rows.length / 10));
  const summary = points.reduce((highest, point) => point.value > highest.value ? point : highest, points[0]);
  return <div className="flex flex-col gap-2">
    <p className="text-sm text-muted-foreground">Cao nhất: {summary.label} với {numberFormatter.format(summary.value)} khách hàng.</p>
    <div className="max-w-full overflow-x-auto rounded-lg border bg-background p-3" tabIndex={0} aria-label="Biểu đồ có thể cuộn ngang trên màn hình nhỏ">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px] text-primary" role="img" aria-labelledby="single-line-title single-line-description">
        <title id="single-line-title">Biểu đồ đường số lượng khách hàng theo {label}</title>
        <desc id="single-line-description">{`Có ${rows.length} nhóm. Cao nhất là ${summary.label} với ${summary.value} khách hàng. Bảng số liệu đầy đủ nằm ngay bên dưới.`}</desc>
        {[0, 1, 2, 3, 4].map((tick) => { const y = padding.top + (tick / 4) * plotHeight; const value = Math.round(maxValue * (1 - tick / 4)); return <g key={tick}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-border" strokeWidth="1" /><text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{numberFormatter.format(value)}</text></g>; })}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r="5" fill="currentColor" className="stroke-background" strokeWidth="2"><title>{point.label}: {numberFormatter.format(point.value)}</title></circle>{(index % tickStep === 0 || index === points.length - 1) && <text x={point.x} y={height - padding.bottom + 22} transform={`rotate(30 ${point.x} ${height - padding.bottom + 22})`} textAnchor="start" className="fill-foreground text-[11px]">{truncateLabel(point.label)}</text>}</g>)}
      </svg>
    </div>
    <div className="flex items-center gap-2 text-sm"><span className="h-0.5 w-8 bg-primary" aria-hidden="true" /><span>Số lượng khách hàng</span></div>
  </div>;
}

function PivotResult({ pivot }: { pivot: NonNullable<Awaited<ReturnType<typeof getPersonalReportResult>>["pivot"]> }) {
  if (pivot.rows.length === 0) return <Empty><EmptyHeader><EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia><EmptyTitle>Không có dữ liệu trong kỳ</EmptyTitle><EmptyDescription>Hãy chọn một khoảng thời gian khác hoặc kiểm tra phạm vi dữ liệu được cấp.</EmptyDescription></EmptyHeader></Empty>;
  return <div className="flex flex-col gap-3">
    <div>
      <h3 className="font-semibold">{pivot.datasetLabel} theo {pivot.rowLabel.toLocaleLowerCase("vi")}</h3>
      <p className="text-sm text-muted-foreground">{pivot.range ? `Từ ${formatIsoDate(pivot.range.fromDate)} đến ${formatIsoDate(pivot.range.toDate)} · ` : ""}Giá trị là số lượng bản ghi.</p>
    </div>
    <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0} aria-label="Bảng thống kê hai chiều, có thể cuộn ngang khi cần">
      <Table className="min-w-max">
        <TableHeader><TableRow><TableHead className="sticky left-0 z-20 min-w-48 bg-background">{pivot.rowLabel}</TableHead>{pivot.columns.map((column) => <TableHead key={column.key} className="min-w-28 text-right">{column.label}</TableHead>)}<TableHead className="sticky right-0 z-20 min-w-24 bg-background text-right">Tổng</TableHead></TableRow></TableHeader>
        <TableBody>
          {pivot.rows.map((row) => <TableRow key={row.key}><TableCell className="sticky left-0 z-10 bg-background font-medium">{row.label}</TableCell>{pivot.columns.map((column) => <TableCell key={column.key} className="text-right tabular-nums">{numberFormatter.format(row.values[column.key] ?? 0)}</TableCell>)}<TableCell className="sticky right-0 z-10 bg-background text-right font-semibold tabular-nums">{numberFormatter.format(row.total)}</TableCell></TableRow>)}
          <TableRow className="bg-muted/50"><TableCell className="sticky left-0 z-10 bg-muted font-semibold">Tổng</TableCell>{pivot.columns.map((column) => <TableCell key={column.key} className="text-right font-semibold tabular-nums">{numberFormatter.format(pivot.columnTotals[column.key] ?? 0)}</TableCell>)}<TableCell className="sticky right-0 z-10 bg-muted text-right font-semibold tabular-nums">{numberFormatter.format(pivot.grandTotal)}</TableCell></TableRow>
        </TableBody>
      </Table>
    </div>
  </div>;
}

function emptyForm(): FormState { return singleForm("", "TABLE"); }
function singleForm(name: string, singleDisplay: "TABLE" | "LINE"): FormState { return { name, mode: "SINGLE", module: "SALE", metricKeys: ["totalLeads"], breakdownKey: null, chartType: "TABLE", datasetKey: "LEADS", singleDimensionKey: "SOURCE", singleDisplay, conditions: [{ fieldKey: "CREATED_DATE", operator: "DATE_PRESET", value: "THIS_MONTH" }], dateGranularity: "DAY" }; }
function pivotForm(name: string): FormState { return { name, mode: "PIVOT", module: "SALE", metricKeys: ["totalLeads"], breakdownKey: null, chartType: "TABLE", datasetKey: "LEADS", rowDimensionKey: "SOURCE", columnDimensionKey: "CREATED_DATE", conditions: [{ fieldKey: "CREATED_DATE", operator: "DATE_PRESET", value: "THIS_MONTH" }], dateGranularity: "DAY" }; }
function singleDatasetForm(name: string, display: "TABLE" | "LINE", dataset?: PersonalReportDatasetDefinition): FormState {
  if (!dataset) return singleForm(name, display);
  return { name, mode: "SINGLE", module: dataset.module, metricKeys: [dataset.countMetricKey], breakdownKey: null, chartType: "TABLE", datasetKey: dataset.key, singleDimensionKey: dataset.fields[0]?.key, singleDisplay: display, conditions: [{ fieldKey: dataset.primaryDateField, operator: "DATE_PRESET", value: "THIS_MONTH" }], dateGranularity: "DAY" };
}
function pivotDatasetForm(name: string, dataset?: PersonalReportDatasetDefinition): FormState {
  if (!dataset) return pivotForm(name);
  return { name, mode: "PIVOT", module: dataset.module, metricKeys: [dataset.countMetricKey], breakdownKey: null, chartType: "TABLE", datasetKey: dataset.key, rowDimensionKey: dataset.fields[0]?.key, columnDimensionKey: dataset.fields[1]?.key, conditions: [{ fieldKey: dataset.primaryDateField, operator: "DATE_PRESET", value: "THIS_MONTH" }], dateGranularity: "DAY" };
}
function summaryForm(name: string, definitions: Awaited<ReturnType<typeof getPersonalReportOptions>>["modules"]): FormState { const first = definitions[0]; return { name, mode: "SUMMARY", module: first?.key ?? "SALE", metricKeys: first?.metrics[0] ? [first.metrics[0].key] : [], breakdownKey: null, chartType: "BAR" }; }
function formatIsoDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
function formatMetric(value: number, format: "NUMBER" | "PERCENT" | "CURRENCY") { return format === "CURRENCY" ? currencyFormatter.format(value) : format === "PERCENT" ? `${numberFormatter.format(value)}%` : numberFormatter.format(value); }
function truncateLabel(value: string) { return value.length > 18 ? `${value.slice(0, 17)}…` : value; }
