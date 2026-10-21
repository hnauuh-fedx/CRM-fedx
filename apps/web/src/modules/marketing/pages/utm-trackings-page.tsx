import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
const pageSize = 20;
import { ServerDataTable } from "@/components/shared/server-data-table";
import { StaticTableHeader } from "@/components/shared/static-table-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChartColumn,
  ClipboardList,
  ContactRound,
  GraduationCap,
  Search,
} from "lucide-react";
import { useMemo, useReducer, useState } from "react";
import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { MetricCard } from "@/components/shared/dashboard-cards";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import {
  getUtmAnalytics,
  getUtmGeneratedLeads,
  getUtmTrackingFilterOptions,
  getUtmTrackings,
} from "@/services/marketing-reference.service";
import type {
  UtmAnalyticsDimension,
  UtmAnalyticsGroup,
  UtmAnalyticsResponse,
  UtmGeneratedLeadResponse,
  UtmTrackingFilterOptions,
  UtmTrackingFilters,
  UtmTrackingItem,
  UtmTrackingListResponse,
  UtmTrackingSortField,
} from "../marketing-reference.types";
const emptyFilters: UtmTrackingFilters = {
  search: "",
  source: "",
  medium: "",
  campaignId: "",
  fromDate: "",
  toDate: "",
};
const sortableColumns = new Set<UtmTrackingSortField>([
  "createdAt",
  "source",
  "medium",
]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const integerFormatter = new Intl.NumberFormat("vi-VN");

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

function analysisReducer(
  state: AnalysisState,
  action: AnalysisAction,
): AnalysisState {
  switch (action.type) {
    case "dimension":
      return {
        dimension: action.dimension,
        page: 1,
        selectedGroup: null,
        leadPage: 1,
      };
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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
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
    queryKey: [
      "utm-trackings",
      "list",
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters,
    ],
    queryFn: () =>
      getUtmTrackings(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        auth.accessToken!,
      ),
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
    queryKey: [
      "utm-trackings",
      "analytics",
      analysis.dimension,
      analysis.page,
      pageSize,
      analysisFilters,
    ],
    queryFn: () =>
      getUtmAnalytics(
        {
          dimension: analysis.dimension,
          page: analysis.page,
          limit: pageSize,
          ...analysisFilters,
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const leadsQuery = useQuery({
    queryKey: [
      "utm-trackings",
      "generated-leads",
      analysis.selectedGroup?.groupKey,
      analysis.dimension,
      analysis.leadPage,
      analysisFilters,
    ],
    queryFn: () =>
      getUtmGeneratedLeads(
        {
          page: analysis.leadPage,
          limit: 10,
          ...analysisFilters,
          ...getGroupFilter(analysis.selectedGroup!, analysis.dimension),
        },
        auth.accessToken!,
      ),
    enabled: Boolean(analysis.selectedGroup),
    placeholderData: (previousData) => previousData,
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const table = useReactTable({
    data,
    columns: useColumns(),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length
          ? next.slice(0, 1)
          : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery, optionsQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Phân tích UTM"
        scopeLabel={
          auth.can("campaign.view_all") ? "Toàn hệ thống" : "Phạm vi được cấp"
        }
        description="Đo hiệu quả theo nguồn, chiến dịch và tổ hợp UTM; xem trực tiếp các lead phát sinh trong phạm vi được cấp."
      />
      <Filters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
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
        onDimensionChange={(dimension) =>
          dispatchAnalysis({ type: "dimension", dimension })
        }
        onSelect={(group) => dispatchAnalysis({ type: "select", group })}
        onReload={() => analyticsQuery.refetch()}
        onPrevious={() =>
          dispatchAnalysis({
            type: "page",
            page: Math.max(1, analysis.page - 1),
          })
        }
        onNext={() =>
          dispatchAnalysis({ type: "page", page: analysis.page + 1 })
        }
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
        onPrevious={() =>
          dispatchAnalysis({
            type: "leadPage",
            page: Math.max(1, analysis.leadPage - 1),
          })
        }
        onNext={() =>
          dispatchAnalysis({ type: "leadPage", page: analysis.leadPage + 1 })
        }
      />
    </div>
    </PageLoadingBoundary>
  );
}

function useColumns() {
  return useMemo<ColumnDef<UtmTrackingItem>[]>(
    () => [
      {
        accessorKey: "source",
        header: "Nguồn",
        cell: ({ row }) => row.original.source ?? "-",
      },
      {
        accessorKey: "medium",
        header: "Medium",
        cell: ({ row }) => row.original.medium ?? "-",
      },
      {
        id: "campaign",
        header: "Chiến dịch",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.campaign?.name ?? row.original.campaignName ?? "-",
      },
      {
        id: "lead",
        header: "Lead ghi nhận",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lead
            ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})`
            : "-",
      },
      {
        id: "landingPage",
        header: "Landing page",
        enableSorting: false,
        cell: ({ row }) => row.original.landingPage ?? "-",
      },
      {
        accessorKey: "createdAt",
        header: "Ngày ghi nhận",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
    ],
    [],
  );
}

type FiltersProps = {
  filters: UtmTrackingFilters;
  options?: UtmTrackingFilterOptions;
  onChange: (field: keyof UtmTrackingFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: FiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc UTM</CardTitle>
        <CardDescription>
          Tìm theo UTM, landing page, chiến dịch hoặc tên lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-[minmax(220px,2fr)_repeat(5,minmax(145px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="utm-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="utm-search"
                  className="pl-9"
                  placeholder="Nhập UTM hoặc tên lead"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="utm-source"
              label="Nguồn"
              value={filters.source}
              onChange={(value) => onChange("source", value)}
              options={(options?.sources ?? []).map((source) => ({
                value: source,
                label: source,
              }))}
            />
            <FilterSelect
              id="utm-medium"
              label="Medium"
              value={filters.medium}
              onChange={(value) => onChange("medium", value)}
              options={(options?.media ?? []).map((medium) => ({
                value: medium,
                label: medium,
              }))}
            />
            <FilterSelect
              id="utm-campaign"
              label="Chiến dịch"
              value={filters.campaignId}
              onChange={(value) => onChange("campaignId", value)}
              options={(options?.campaigns ?? []).map((campaign) => ({
                value: campaign.id,
                label: campaign.name,
              }))}
            />
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
            <AutoFilterActions
              snapshot={filters}
              onApply={onApply}
              onReset={onReset}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type AnalyticsProps = {
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
};

function Analytics(props: AnalyticsProps) {
  const {
    dimension,
    page,
    response,
    isLoading,
    isError,
    isFetching,
    onDimensionChange,
    onSelect,
    onReload,
    onPrevious,
    onNext,
  } = props;
  const summary = response?.summary;
  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Phân tích hiệu quả UTM"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Lượt ghi nhận"
          value={integerFormatter.format(summary?.trackingCount ?? 0)}
          icon={ChartColumn}
        />
        <MetricCard
          label="Lead phát sinh"
          value={integerFormatter.format(summary?.leadCount ?? 0)}
          icon={ContactRound}
        />
        <MetricCard
          label="Hồ sơ tuyển sinh"
          value={integerFormatter.format(summary?.applicationCount ?? 0)}
          icon={ClipboardList}
        />
        <MetricCard
          label="Sinh viên nhập học"
          value={integerFormatter.format(summary?.enrolledStudentCount ?? 0)}
          icon={GraduationCap}
        />
      </div>
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-4 border-b py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Hiệu quả chuyển đổi theo UTM</CardTitle>
            <CardDescription>
              Chọn một dòng để xem các lead đã phát sinh từ nhóm tương ứng.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Chiều phân tích">
            {(
              [
                ["source", "Theo nguồn"],
                ["campaign", "Theo chiến dịch"],
                ["utm", "Theo UTM"],
              ] as Array<[UtmAnalyticsDimension, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={dimension === value ? "default" : "outline"}
                size="sm"
                aria-pressed={dimension === value}
                onClick={() => onDimensionChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <ErrorState
              title="Không thể tải phân tích UTM"
              description="Vui lòng thử lại để cập nhật chỉ số chuyển đổi."
              onReload={onReload}
            />
          ) : isLoading ? (
            <TableLoadingState label="Đang tải phân tích UTM" />
          ) : !response?.data.length ? (
            <EmptyState
              title="Chưa có dữ liệu phân tích phù hợp"
              description="Điều chỉnh bộ lọc hoặc khoảng thời gian để xem hiệu quả UTM."
            />
          ) : (
            <Table className="min-w-240">
              <caption className="sr-only">
                Hiệu quả chuyển đổi theo UTM
              </caption>
              <StaticTableHeader
                columns={[
                  { label: "Nhóm phân tích", className: "px-5" },
                  { label: "Ghi nhận" },
                  { label: "Lead" },
                  { label: "Hồ sơ" },
                  { label: "Sinh viên" },
                  { label: "Tỷ lệ vào hồ sơ" },
                  { label: "Chi tiết", className: "px-5 text-right" },
                ]}
                className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground"
                rowClassName="hover:bg-muted/55"
              />
              <TableBody>
                {response.data.map((group) => (
                  <TableRow key={group.groupKey}>
                    <TableCell className="px-5 py-4 font-medium">
                      {getGroupLabel(group, dimension)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {integerFormatter.format(group.trackingCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {integerFormatter.format(group.leadCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {integerFormatter.format(group.applicationCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {integerFormatter.format(group.enrolledStudentCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {group.conversionRate}%
                    </TableCell>
                    <TableCell className="px-5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={group.leadCount === 0}
                        onClick={() => onSelect(group)}
                      >
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
          <Pager
            page={page}
            pagination={response.pagination}
            isFetching={isFetching}
            onPrevious={onPrevious}
            onNext={onNext}
          />
        )}
      </Card>
    </section>
  );
}

type LeadDialogProps = {
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
};

function LeadDialog(props: LeadDialogProps) {
  const {
    group,
    dimension,
    response,
    page,
    isLoading,
    isError,
    isFetching,
    onClose,
    onReload,
    onPrevious,
    onNext,
  } = props;
  return (
    <Dialog
      open={Boolean(group)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[calc(100vw-2rem)] xl:max-w-[72rem]">
        <DialogHeader>
          <DialogTitle>
            Lead phát sinh từ {group ? getGroupLabel(group, dimension) : "UTM"}
          </DialogTitle>
          <DialogDescription>
            Danh sách chỉ gồm lead thuộc phạm vi dữ liệu bạn được phép xem.
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <ErrorState
            title="Không thể tải danh sách lead"
            description="Vui lòng thử lại để xem lead phát sinh."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải lead phát sinh" />
        ) : !response?.data.length ? (
          <EmptyState
            title="Không có lead phù hợp"
            description="Nhóm phân tích này chưa có lead trong bộ lọc hiện tại."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table className="min-w-210">
              <caption className="sr-only">
                Danh sách lead phát sinh từ UTM
              </caption>
              <StaticTableHeader
                columns={[
                  { label: "Lead", className: "px-4" },
                  { label: "Giai đoạn" },
                  { label: "Attribution" },
                  { label: "Kết quả" },
                  { label: "Ngày tạo", className: "px-4" },
                ]}
                className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground"
                rowClassName="hover:bg-muted/55"
              />
              <TableBody>
                {response.data.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="p-4">
                      <p className="font-medium">{lead.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {lead.leadCode ?? "Chưa có mã lead"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {lead.pipelineStageName ?? "Chưa chọn tiến trình"}
                    </TableCell>
                    <TableCell>
                      {lead.attribution
                        ? [
                            lead.attribution.source,
                            lead.attribution.medium,
                            lead.attribution.campaign?.name ??
                              lead.attribution.utmCampaign,
                          ]
                            .filter(Boolean)
                            .join(" / ")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {lead.hasApplication && (
                          <Badge variant="secondary">Có hồ sơ</Badge>
                        )}
                        {lead.hasStudent && (
                          <Badge variant="secondary">Đã nhập học</Badge>
                        )}
                        {!lead.hasApplication && !lead.hasStudent && (
                          <span className="text-muted-foreground">
                            Lead mới
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      {formatDate(lead.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {response && response.pagination.total > 0 && (
          <Pager
            page={page}
            pagination={response.pagination}
            isFetching={isFetching}
            onPrevious={onPrevious}
            onNext={onNext}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function getGroupLabel(
  group: UtmAnalyticsGroup,
  dimension: UtmAnalyticsDimension,
) {
  if (dimension === "campaign") {
    return group.campaign?.name ?? group.utmCampaign ?? "Chưa xác định";
  }
  if (dimension === "utm") {
    return [group.source, group.medium, group.utmCampaign]
      .map((item) => item ?? "(not-set)")
      .join(" / ");
  }
  return group.source ?? "Chưa xác định";
}

function getGroupFilter(
  group: UtmAnalyticsGroup,
  dimension: UtmAnalyticsDimension,
) {
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

type ResultsProps = {
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
};

function Results(props: ResultsProps) {
  const {
    table,
    data,
    pagination,
    page,
    isLoading,
    isError,
    isFetching,
    onReload,
    onPrevious,
    onNext,
  } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Theo dõi UTM</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} lượt ghi nhận`
            : "Đang lấy dữ liệu UTM…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải dữ liệu UTM"
            description="Vui lòng thử lại để cập nhật dữ liệu theo dõi."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải dữ liệu UTM" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có UTM phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm lượt theo dõi cần kiểm tra."
          />
        ) : (
          <SortableTable table={table} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <Pager
          page={page}
          pagination={pagination}
          isFetching={isFetching}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<UtmTrackingItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Danh sách theo dõi UTM"
      className="min-w-260"
    />
  );
}

function Pager({
  page,
  pagination,
  isFetching,
  onPrevious,
  onNext,
}: {
  page: number;
  pagination: UtmTrackingListResponse["pagination"];
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <TablePagination
      page={page}
      pagination={pagination}
      isFetching={isFetching}
      className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"
      labels={{ previous: "Trang trước", next: "Trang sau" }}
      onPrevious={onPrevious}
      onNext={onNext}
    />
  );
}
