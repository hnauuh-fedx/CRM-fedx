import { useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type Header,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChartColumn, ChevronLeft, ChevronRight, ClipboardList, ContactRound, GraduationCap, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { MetricCard } from "@/components/shared/dashboard-cards";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { getUtmAnalytics, getUtmGeneratedLeads, getUtmTrackingFilterOptions, getUtmTrackings } from "@/services/marketing-reference.service";
import type {
  UtmAnalyticsDimension,
  UtmAnalyticsGroup,
  UtmAnalyticsResponse,
  UtmGeneratedLeadResponse,
  UtmTrackingFilters,
  UtmTrackingFilterOptions,
  UtmTrackingItem,
  UtmTrackingListResponse,
  UtmTrackingSortField,
} from "../marketing-reference.types";

const pageSize = 20;
const emptyFilters: UtmTrackingFilters = { search: "", source: "", medium: "", campaignId: "", fromDate: "", toDate: "" };
const sortableColumns = new Set<UtmTrackingSortField>(["createdAt", "source", "medium"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const integerFormatter = new Intl.NumberFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

type AnalysisState = {
  dimension: UtmAnalyticsDimension;
  page: number;
  selectedGroup: UtmAnalyticsGroup | null;
  leadPage: number;
};
type AnalysisAction =
  | { type: "dimension"; dimension: UtmAnalyticsDimension }
  | { type: "page"; page: number }
  | { type: "select"; group: UtmAnalyticsGroup | null }
  | { type: "leadPage"; page: number }
  | { type: "reset" };

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case "dimension":
      return { dimension: action.dimension, page: 1, selectedGroup: null, leadPage: 1 };
    case "page":
      return { ...state, page: action.page };
    case "select":
      return { ...state, selectedGroup: action.group, leadPage: 1 };
    case "leadPage":
      return { ...state, leadPage: action.page };
    case "reset":
      return { ...state, page: 1, selectedGroup: null, leadPage: 1 };
  }
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function UtmTrackingsPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [analysis, dispatchAnalysis] = useReducer(analysisReducer, {
    dimension: "source",
    page: 1,
    selectedGroup: null,
    leadPage: 1,
  });
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as UtmTrackingSortField)
    ? (selectedSort.id as UtmTrackingSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["utm-trackings", "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getUtmTrackings({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["utm-trackings", "options"],
    queryFn: () => getUtmTrackingFilterOptions(auth.accessToken!),
  });
  const analysisFilters = {
    source: filters.source,
    medium: filters.medium,
    campaignId: filters.campaignId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
  const analyticsQuery = useQuery({
    queryKey: ["utm-trackings", "analytics", analysis.dimension, analysis.page, pageSize, analysisFilters],
    queryFn: () => getUtmAnalytics({ dimension: analysis.dimension, page: analysis.page, limit: pageSize, ...analysisFilters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const leadsQuery = useQuery({
    queryKey: ["utm-trackings", "generated-leads", analysis.selectedGroup?.groupKey, analysis.dimension, analysis.leadPage, analysisFilters],
    queryFn: () => getUtmGeneratedLeads({
      page: analysis.leadPage,
      limit: 10,
      ...analysisFilters,
      ...getGroupFilter(analysis.selectedGroup!, analysis.dimension),
    }, auth.accessToken!),
    enabled: Boolean(analysis.selectedGroup),
    placeholderData: (previousData) => previousData,
  });
  const data = listQuery.data?.data ?? [];
  const table = useReactTable({
    data,
    columns: useColumns(),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? next.slice(0, 1) : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Phân tích UTM"
        scopeLabel={auth.can("campaign.view_all") ? "Toàn hệ thống" : "Phạm vi được cấp"}
        description="Đo hiệu quả theo nguồn, chiến dịch và tổ hợp UTM; xem trực tiếp các lead phát sinh trong phạm vi được cấp."
      />
      <Filters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) => setDraftFilters((current) => ({ ...current, [field]: value }))}
        onApply={() => {
          setFilters(draftFilters);
          setPage(1);
          dispatchAnalysis({ type: "reset" });
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setPage(1);
          dispatchAnalysis({ type: "reset" });
        }}
      />
      <Analytics
        dimension={analysis.dimension}
        page={analysis.page}
        response={analyticsQuery.data}
        isLoading={analyticsQuery.isLoading}
        isError={analyticsQuery.isError}
        isFetching={analyticsQuery.isFetching}
        onDimensionChange={(dimension) => dispatchAnalysis({ type: "dimension", dimension })}
        onSelect={(group) => dispatchAnalysis({ type: "select", group })}
        onReload={() => analyticsQuery.refetch()}
        onPrevious={() => dispatchAnalysis({ type: "page", page: Math.max(1, analysis.page - 1) })}
        onNext={() => dispatchAnalysis({ type: "page", page: analysis.page + 1 })}
      />
      <Results
        table={table}
        data={data}
        pagination={listQuery.data?.pagination}
        page={page}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onReload={() => listQuery.refetch()}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
      <LeadDialog
        group={analysis.selectedGroup}
        dimension={analysis.dimension}
        response={leadsQuery.data}
        page={analysis.leadPage}
        isLoading={leadsQuery.isLoading}
        isError={leadsQuery.isError}
        isFetching={leadsQuery.isFetching}
        onClose={() => dispatchAnalysis({ type: "select", group: null })}
        onReload={() => leadsQuery.refetch()}
        onPrevious={() => dispatchAnalysis({ type: "leadPage", page: Math.max(1, analysis.leadPage - 1) })}
        onNext={() => dispatchAnalysis({ type: "leadPage", page: analysis.leadPage + 1 })}
      />
    </div>
  );
}

function useColumns() {
  return useMemo<ColumnDef<UtmTrackingItem>[]>(
    () => [
      { accessorKey: "source", header: "Nguồn", cell: ({ row }) => row.original.source ?? "-" },
      { accessorKey: "medium", header: "Medium", cell: ({ row }) => row.original.medium ?? "-" },
      { id: "campaign", header: "Chiến dịch", enableSorting: false, cell: ({ row }) => row.original.campaign?.name ?? row.original.campaignName ?? "-" },
      { id: "lead", header: "Lead ghi nhận", enableSorting: false, cell: ({ row }) => row.original.lead ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})` : "-" },
      { id: "landingPage", header: "Landing page", enableSorting: false, cell: ({ row }) => row.original.landingPage ?? "-" },
      { accessorKey: "createdAt", header: "Ngày ghi nhận", cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    [],
  );
}

function Filters({ filters, options, onChange, onApply, onReset }: {
  filters: UtmTrackingFilters;
  options?: UtmTrackingFilterOptions;
  onChange: (field: keyof UtmTrackingFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc UTM</CardTitle>
        <CardDescription>Tìm theo UTM, landing page, chiến dịch hoặc tên lead.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-[minmax(220px,2fr)_repeat(5,minmax(145px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="utm-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="utm-search" className="pl-9" placeholder="Nhập UTM hoặc tên lead" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
              </div>
            </Field>
            <FilterSelect id="utm-source" label="Nguồn" value={filters.source} onChange={(value) => onChange("source", value)} options={(options?.sources ?? []).map((source) => ({ value: source, label: source }))} />
            <FilterSelect id="utm-medium" label="Medium" value={filters.medium} onChange={(value) => onChange("medium", value)} options={(options?.media ?? []).map((medium) => ({ value: medium, label: medium }))} />
            <FilterSelect id="utm-campaign" label="Chiến dịch" value={filters.campaignId} onChange={(value) => onChange("campaignId", value)} options={(options?.campaigns ?? []).map((campaign) => ({ value: campaign.id, label: campaign.name }))} />
            <Field className="gap-2">
              <FieldLabel>Thời gian</FieldLabel>
              <DateRangeFilter 
                fromDate={filters.fromDate} 
                toDate={filters.toDate} 
                onChange={(from, to) => {
                  onChange("fromDate", from);
                  onChange("toDate", to);
                }} 
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit">Áp dụng</Button>
              <Button type="button" variant="outline" onClick={onReset}>Xóa lọc</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Analytics(props: {
  dimension: UtmAnalyticsDimension;
  page: number;
  response?: UtmAnalyticsResponse;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onDimensionChange: (dimension: UtmAnalyticsDimension) => void;
  onSelect: (group: UtmAnalyticsGroup) => void;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { dimension, page, response, isLoading, isError, isFetching, onDimensionChange, onSelect, onReload, onPrevious, onNext } = props;
  const summary = response?.summary;
  return (
    <section className="flex flex-col gap-5" aria-label="Phân tích hiệu quả UTM">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lượt ghi nhận" value={integerFormatter.format(summary?.trackingCount ?? 0)} icon={ChartColumn} />
        <MetricCard label="Lead phát sinh" value={integerFormatter.format(summary?.leadCount ?? 0)} icon={ContactRound} />
        <MetricCard label="Hồ sơ tuyển sinh" value={integerFormatter.format(summary?.applicationCount ?? 0)} icon={ClipboardList} />
        <MetricCard label="Sinh viên nhập học" value={integerFormatter.format(summary?.enrolledStudentCount ?? 0)} icon={GraduationCap} />
      </div>
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-4 border-b py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Hiệu quả chuyển đổi theo UTM</CardTitle>
            <CardDescription>Chọn một dòng để xem các lead đã phát sinh từ nhóm tương ứng.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Chiều phân tích">
            {([
              ["source", "Theo nguồn"],
              ["campaign", "Theo chiến dịch"],
              ["utm", "Theo UTM"],
            ] as Array<[UtmAnalyticsDimension, string]>).map(([value, label]) => (
              <Button key={value} type="button" variant={dimension === value ? "default" : "outline"} size="sm" aria-pressed={dimension === value} onClick={() => onDimensionChange(value)}>
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <ErrorState title="Không thể tải phân tích UTM" description="Vui lòng thử lại để cập nhật chỉ số chuyển đổi." onReload={onReload} />
          ) : isLoading ? (
            <TableLoadingState label="Đang tải phân tích UTM" />
          ) : !response?.data.length ? (
            <EmptyState title="Chưa có dữ liệu phân tích phù hợp" description="Điều chỉnh bộ lọc hoặc khoảng thời gian để xem hiệu quả UTM." />
          ) : (
            <Table className="min-w-240">
              <caption className="sr-only">Hiệu quả chuyển đổi theo UTM</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <TableHead className="px-5">Nhóm phân tích</TableHead>
                  <TableHead>Ghi nhận</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Hồ sơ</TableHead>
                  <TableHead>Sinh viên</TableHead>
                  <TableHead>Tỷ lệ vào hồ sơ</TableHead>
                  <TableHead>Chi phí / lead</TableHead>
                  <TableHead className="px-5 text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.data.map((group) => (
                  <TableRow key={group.groupKey}>
                    <TableCell className="px-5 py-4 font-medium">{getGroupLabel(group, dimension)}</TableCell>
                    <TableCell className="tabular-nums">{integerFormatter.format(group.trackingCount)}</TableCell>
                    <TableCell className="tabular-nums">{integerFormatter.format(group.leadCount)}</TableCell>
                    <TableCell className="tabular-nums">{integerFormatter.format(group.applicationCount)}</TableCell>
                    <TableCell className="tabular-nums">{integerFormatter.format(group.enrolledStudentCount)}</TableCell>
                    <TableCell className="tabular-nums">{group.conversionRate}%</TableCell>
                    <TableCell className="tabular-nums">{group.costPerLead === null ? "-" : currencyFormatter.format(group.costPerLead)}</TableCell>
                    <TableCell className="px-5 text-right">
                      <Button type="button" size="sm" variant="outline" disabled={group.leadCount === 0} onClick={() => onSelect(group)}>
                        Xem lead
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {response && response.pagination.total > 0 && (
          <Pager page={page} pagination={response.pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />
        )}
      </Card>
    </section>
  );
}

function LeadDialog(props: {
  group: UtmAnalyticsGroup | null;
  dimension: UtmAnalyticsDimension;
  response?: UtmGeneratedLeadResponse;
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onClose: () => void;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { group, dimension, response, page, isLoading, isError, isFetching, onClose, onReload, onPrevious, onNext } = props;
  return (
    <Dialog open={Boolean(group)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[calc(100vw-2rem)] xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Lead phát sinh từ {group ? getGroupLabel(group, dimension) : "UTM"}</DialogTitle>
          <DialogDescription>Danh sách chỉ gồm lead thuộc phạm vi dữ liệu bạn được phép xem.</DialogDescription>
        </DialogHeader>
        {isError ? (
          <ErrorState title="Không thể tải danh sách lead" description="Vui lòng thử lại để xem lead phát sinh." onReload={onReload} />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải lead phát sinh" />
        ) : !response?.data.length ? (
          <EmptyState title="Không có lead phù hợp" description="Nhóm phân tích này chưa có lead trong bộ lọc hiện tại." />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table className="min-w-210">
              <caption className="sr-only">Danh sách lead phát sinh từ UTM</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <TableHead className="px-4">Lead</TableHead>
                  <TableHead>Giai đoạn</TableHead>
                  <TableHead>Attribution</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="px-4">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.data.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="p-4">
                      <p className="font-medium">{lead.fullName}</p>
                      <p className="text-sm text-muted-foreground">{lead.leadCode ?? "Chưa có mã lead"}</p>
                    </TableCell>
                    <TableCell>{lead.pipelineStageName ?? lead.status ?? "-"}</TableCell>
                    <TableCell>
                      {lead.attribution
                        ? [lead.attribution.source, lead.attribution.medium, lead.attribution.campaign?.name ?? lead.attribution.utmCampaign].filter(Boolean).join(" / ")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {lead.hasApplication && <Badge variant="secondary">Có hồ sơ</Badge>}
                        {lead.hasStudent && <Badge variant="secondary">Đã nhập học</Badge>}
                        {!lead.hasApplication && !lead.hasStudent && <span className="text-muted-foreground">Lead mới</span>}
                      </div>
                    </TableCell>
                    <TableCell className="px-4">{formatDate(lead.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {response && response.pagination.total > 0 && (
          <Pager page={page} pagination={response.pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function getGroupLabel(group: UtmAnalyticsGroup, dimension: UtmAnalyticsDimension) {
  if (dimension === "campaign") {
    return group.campaign?.name ?? group.utmCampaign ?? "Chưa xác định";
  }
  if (dimension === "utm") {
    return [group.source, group.medium, group.utmCampaign].map((item) => item ?? "(not-set)").join(" / ");
  }
  return group.source ?? "Chưa xác định";
}

function getGroupFilter(group: UtmAnalyticsGroup, dimension: UtmAnalyticsDimension) {
  if (dimension === "campaign") {
    return group.campaign
      ? { groupCampaignId: group.campaign.id }
      : { groupCampaign: group.utmCampaign ?? "__unset__" };
  }
  if (dimension === "utm") {
    return {
      groupSource: group.source ?? "__unset__",
      groupMedium: group.medium ?? "__unset__",
      groupCampaign: group.utmCampaign ?? "__unset__",
    };
  }
  return { groupSource: group.source ?? "__unset__" };
}

function Results(props: {
  table: DataTable<UtmTrackingItem>;
  data: UtmTrackingItem[];
  pagination?: UtmTrackingListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { table, data, pagination, page, isLoading, isError, isFetching, onReload, onPrevious, onNext } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Theo dõi UTM</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} lượt ghi nhận` : "Đang lấy dữ liệu UTM…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải dữ liệu UTM" description="Vui lòng thử lại để cập nhật dữ liệu theo dõi." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải dữ liệu UTM" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có UTM phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm lượt theo dõi cần kiểm tra." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && <Pager page={page} pagination={pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<UtmTrackingItem> }) {
  return (
    <Table className="min-w-260">
      <caption className="sr-only">Danh sách theo dõi UTM</caption>
      <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
        {table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => <SortHeader key={header.id} header={header} />)}</TableRow>)}
      </TableHeader>
      <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
  );
}

function SortHeader({ header }: { header: Header<UtmTrackingItem, unknown> }) {
  const direction = header.column.getIsSorted();
  return <TableHead scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
}

function Pager({ page, pagination, isFetching, onPrevious, onNext }: { page: number; pagination: UtmTrackingListResponse["pagination"]; isFetching: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>;
}
