import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ClipboardCheck, Database, GraduationCap, Info, RotateCcw, UserCheck } from "lucide-react";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/modules/auth/auth-context";
import type { DirectorDashboardFilters, DirectorDashboardResponse } from "@/modules/dashboard/dashboard.types";
import {
  getDirectorDashboard,
  getDirectorLeadPipelineMatrix,
  getDirectorLeadSourceBreakdown,
} from "@/services/dashboard.service";

const integerFormatter = new Intl.NumberFormat("vi-VN");
const percentFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const sourcePercentFormatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const filterDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

type SharedFilterField = "NONE" | "MAJOR" | "SOURCE" | "ASSIGNEE" | "PIPELINE_STAGE";
type DatePreset = Exclude<DirectorDashboardFilters["timePreset"], undefined>;
type SharedFilterState = {
  field: SharedFilterField;
  operator: "EQUALS" | "NOT_EQUALS";
  value: string;
  timePreset: DatePreset | null;
  fromDate: string;
  toDate: string;
};
type DashboardFilterOptions = {
  majors: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; name: string }>;
};

const emptyFilter: SharedFilterState = {
  field: "NONE",
  operator: "EQUALS",
  value: "",
  timePreset: null,
  fromDate: "",
  toDate: "",
};

const datePresetOptions: Array<{ value: Exclude<DatePreset, "CUSTOM">; label: string }> = [
  { value: "LAST_7_DAYS", label: "7 ngày gần nhất" },
  { value: "THIS_WEEK", label: "Tuần này" },
  { value: "LAST_WEEK", label: "Tuần trước" },
  { value: "THIS_MONTH", label: "Tháng này" },
  { value: "LAST_MONTH", label: "Tháng trước" },
];

export function DirectorDashboardPage() {
  const auth = useAuth();
  const [filter, setFilter] = useState<SharedFilterState>(emptyFilter);
  const [matrixFilter, setMatrixFilter] = useState<SharedFilterState>(emptyFilter);
  const [sourceFilter, setSourceFilter] = useState<SharedFilterState>(emptyFilter);
  const requestFilters = useMemo(() => toRequestFilters(filter), [filter]);
  const matrixRequestFilters = useMemo(() => toRequestFilters(matrixFilter), [matrixFilter]);
  const sourceRequestFilters = useMemo(() => toRequestFilters(sourceFilter), [sourceFilter]);
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", "director", requestFilters],
    queryFn: () => getDirectorDashboard(auth.accessToken!, requestFilters),
    placeholderData: (previousData) => previousData,
  });
  const matrixQuery = useQuery({
    queryKey: ["dashboard", "director", "lead-pipeline-matrix", matrixRequestFilters],
    queryFn: () => getDirectorLeadPipelineMatrix(auth.accessToken!, matrixRequestFilters),
    placeholderData: (previousData) => previousData,
  });
  const sourceQuery = useQuery({
    queryKey: ["dashboard", "director", "lead-source-breakdown", sourceRequestFilters],
    queryFn: () => getDirectorLeadSourceBreakdown(auth.accessToken!, sourceRequestFilters),
    placeholderData: (previousData) => previousData,
  });

  if (dashboardQuery.isLoading) return <DirectorDashboardSkeleton />;

  if (!dashboardQuery.data) {
    return (
      <Card className="mx-auto max-w-xl">
        <ErrorState
          title="Không thể tải dashboard giám đốc"
          description="Vui lòng thử lại để cập nhật các chỉ số tổng hợp."
          onReload={() => dashboardQuery.refetch()}
        />
      </Card>
    );
  }

  const dashboard = dashboardQuery.data;
  const activeFilterDescription = getActiveFilterDescription(filter, dashboard.filterOptions);
  const activeMatrixFilterDescription = getActiveFilterDescription(matrixFilter, dashboard.filterOptions);
  const activeSourceFilterDescription = getActiveFilterDescription(sourceFilter, dashboard.filterOptions);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Điều hành"
        title="Dashboard giám đốc"
        scopeLabel="Theo chương trình đang chọn"
        actions={auth.can("user.manage") ? (
          <Button asChild><Link to="/quan-ly/nguoi-dung">Quản lý người dùng</Link></Button>
        ) : undefined}
        description="Theo dõi dữ liệu và tỷ lệ chuyển đổi tuyển sinh theo tiến trình hiện tại."
      />

      <Card className={cn(
        "gap-5 border-border/70 py-5 shadow-xs transition-colors",
        activeFilterDescription && "border-primary/40 bg-primary/5",
      )}>
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-5">
          <CardTitle className="text-2xl font-bold">Thống kê tổng</CardTitle>
          {dashboardQuery.isFetching && (
            <span className="text-xs text-muted-foreground" role="status">Đang cập nhật…</span>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5 px-5">
          <SharedDashboardFilter
            filter={filter}
            options={dashboard.filterOptions}
            activeDescription={activeFilterDescription}
            onChange={setFilter}
            onReset={() => setFilter(emptyFilter)}
          />

          {dashboardQuery.isError && (
            <p role="alert" className="text-sm text-destructive">
              Không thể cập nhật bộ lọc. Các số liệu gần nhất vẫn đang được hiển thị.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DirectorKpiCard
              title="Tổng data"
              value={dashboard.summary.totalData}
              icon={Database}
              description="Tổng số data đã được tạo và chưa bị xóa trong phạm vi bộ lọc chung."
            />
            <DirectorKpiCard
              title="Tổng data đúng đối tượng (lead)"
              value={dashboard.summary.qualifiedLeads}
              icon={UserCheck}
              description="Số lead đang ở giai đoạn L2 hoặc cao hơn trong cùng pipeline."
            />
            <DirectorKpiCard
              title="Tổng lead đã đăng ký"
              value={dashboard.summary.registeredLeads}
              percentage={dashboard.summary.registeredConversionRate}
              icon={ClipboardCheck}
              description={`${integerFormatter.format(dashboard.summary.registeredLeads)} trên ${integerFormatter.format(dashboard.summary.qualifiedLeads)} lead từ L2 trở đi hiện đang ở L4 hoặc cao hơn.`}
            />
            <DirectorKpiCard
              title="Tổng học viên"
              value={dashboard.summary.totalStudents}
              percentage={dashboard.summary.studentConversionRate}
              icon={GraduationCap}
              description={`${integerFormatter.format(dashboard.summary.totalStudents)} trên ${integerFormatter.format(dashboard.summary.qualifiedLeads)} lead từ L2 trở đi hiện đang ở L5 hoặc cao hơn.`}
            />
          </div>
        </CardContent>
      </Card>

      <LeadPipelineMatrix
        matrix={matrixQuery.data ?? dashboard.leadPipelineMatrix}
        filter={matrixFilter}
        options={dashboard.filterOptions}
        activeDescription={activeMatrixFilterDescription}
        isFetching={matrixQuery.isFetching}
        isError={matrixQuery.isError}
        onFilterChange={setMatrixFilter}
        onReset={() => setMatrixFilter(emptyFilter)}
      />
      <LeadSourceBreakdown
        breakdown={sourceQuery.data ?? dashboard.leadSourceBreakdown}
        filter={sourceFilter}
        options={dashboard.filterOptions}
        activeDescription={activeSourceFilterDescription}
        isFetching={sourceQuery.isFetching}
        isError={sourceQuery.isError}
        onFilterChange={setSourceFilter}
        onReset={() => setSourceFilter(emptyFilter)}
      />
    </div>
  );
}

function LeadSourceBreakdown({
  breakdown,
  filter,
  options,
  activeDescription,
  isFetching,
  isError,
  onFilterChange,
  onReset,
}: {
  breakdown: DirectorDashboardResponse["leadSourceBreakdown"];
  filter: SharedFilterState;
  options: DashboardFilterOptions;
  activeDescription: string | null;
  isFetching: boolean;
  isError: boolean;
  onFilterChange: (filter: SharedFilterState) => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-5">
        <CardTitle className="text-2xl font-bold">Phân bổ data theo nguồn</CardTitle>
        {isFetching && <span className="text-xs text-muted-foreground" role="status">Đang cập nhật…</span>}
        {/* <CardDescription>
          Tổng số và tỷ lệ data theo từng nguồn khách hàng.
        </CardDescription> */}
      </CardHeader>
      <div className={cn(
        "border-b px-5 py-4 transition-colors",
        activeDescription && "bg-primary/5",
      )}>
        <SharedDashboardFilter
          filter={filter}
          options={options}
          activeDescription={activeDescription}
          availableFields={["MAJOR", "ASSIGNEE", "PIPELINE_STAGE"]}
          onChange={onFilterChange}
          onReset={onReset}
        />
        {isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Không thể cập nhật bộ lọc bảng nguồn. Dữ liệu gần nhất vẫn đang được hiển thị.
          </p>
        )}
      </div>
      <CardContent className="p-0">
        <Table className="w-full table-fixed">
          <TableCaption className="sr-only">
            Bảng tổng số và tỷ lệ data theo nguồn khách hàng
          </TableCaption>
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[14%]" />
            <col />
          </colgroup>
          <TableHeader className="bg-muted/80">
            <TableRow className="hover:!bg-transparent">
              <TableHead scope="col" className="border-r px-4 font-semibold whitespace-normal">
                Nguồn khách hàng
              </TableHead>
              <TableHead scope="col" className="border-r px-4 text-right font-semibold whitespace-normal">
                Số lượng
              </TableHead>
              <TableHead scope="col" className="px-4 font-semibold whitespace-normal">
                Tỷ lệ
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  Không có data phù hợp với bộ lọc đang áp dụng.
                </TableCell>
              </TableRow>
            ) : breakdown.rows.map((row) => (
              <TableRow key={row.id ?? "UNASSIGNED_SOURCE"}>
                <TableCell className="border-r px-4 py-3 font-medium whitespace-normal break-words">
                  {row.name}
                </TableCell>
                <TableCell className="border-r px-4 py-3 text-right tabular-nums">
                  {integerFormatter.format(row.total)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                    <span className="text-right tabular-nums">
                      {sourcePercentFormatter.format(row.percentage)}%
                    </span>
                    <Progress
                      value={row.percentage}
                      aria-label={`Tỷ lệ nguồn ${row.name}: ${sourcePercentFormatter.format(row.percentage)}%`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              <TableCell className="border-r px-4 py-3 font-semibold">Tổng</TableCell>
              <TableCell className="border-r px-4 py-3 text-right font-bold tabular-nums">
                {integerFormatter.format(breakdown.total)}
              </TableCell>
              <TableCell className="px-4 py-3 font-bold tabular-nums">
                {breakdown.total > 0 ? "100%" : "0%"}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function LeadPipelineMatrix({
  matrix,
  filter,
  options,
  activeDescription,
  isFetching,
  isError,
  onFilterChange,
  onReset,
}: {
  matrix: DirectorDashboardResponse["leadPipelineMatrix"];
  filter: SharedFilterState;
  options: DashboardFilterOptions;
  activeDescription: string | null;
  isFetching: boolean;
  isError: boolean;
  onFilterChange: (filter: SharedFilterState) => void;
  onReset: () => void;
}) {
  const columnCount = matrix.columns.length + 2;

  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-5">
        <CardTitle className="text-2xl font-bold">Phân bổ data theo nhân viên và tiến trình</CardTitle>
        {isFetching && <span className="text-xs text-muted-foreground" role="status">Đang cập nhật…</span>}
        {/* <CardDescription>
          Số lượng data đang được mỗi nhân viên phụ trách tại từng giai đoạn pipeline.
        </CardDescription> */}
      </CardHeader>
      <div className={cn(
        "border-b px-5 py-4 transition-colors",
        activeDescription && "bg-primary/5",
      )}>
        <SharedDashboardFilter
          filter={filter}
          options={options}
          activeDescription={activeDescription}
          availableFields={["MAJOR", "SOURCE"]}
          onChange={onFilterChange}
          onReset={onReset}
        />
        {isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Không thể cập nhật bộ lọc bảng. Dữ liệu gần nhất vẫn đang được hiển thị.
          </p>
        )}
      </div>
      <CardContent className="p-0">
        <Table className="w-full table-fixed">
          <TableCaption className="sr-only">
            Bảng tổng số data theo nhân viên phụ trách và giai đoạn pipeline
          </TableCaption>
          <colgroup>
            <col className="w-[18%]" />
            {matrix.columns.map((column) => <col key={column.key} />)}
            <col className="w-[8%]" />
          </colgroup>
          <TableHeader className="bg-blue-300">
            <TableRow className="border-b-2 hover:!bg-transparent">
              <TableHead scope="col" className="h-auto border-r px-2 py-3 text-xs font-semibold whitespace-normal lg:px-3 lg:text-sm 2xl:px-4">
                Nhân viên phụ trách
              </TableHead>
              {matrix.columns.map((column, index) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  title={column.name}
                  aria-label={column.name}
                  className={cn(
                    "h-auto border-r px-1 py-3 text-center text-xs leading-tight font-semibold whitespace-normal lg:px-2",
                  )}
                >
                  <PipelineColumnHeading name={column.name} isUnassigned={column.id === null} />
                </TableHead>
              ))}
              <TableHead scope="col" className="h-auto px-2 py-3 text-right text-xs font-semibold whitespace-normal lg:px-3 lg:text-sm 2xl:px-4">
                Tổng
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  Không có data phù hợp với bộ lọc đang áp dụng.
                </TableCell>
              </TableRow>
            ) : matrix.rows.map((row) => (
              <TableRow key={row.id ?? "UNASSIGNED_ASSIGNEE"}>
                <TableCell className="border-r px-2 py-3 text-xs font-bold whitespace-normal break-words lg:px-3 lg:text-sm 2xl:px-4">
                  {row.name}
                </TableCell>
                {matrix.columns.map((column, index) => {
                  const value = row.values[column.key] ?? 0;
                  return (
                    <TableCell
                      key={column.key}
                      className={cn(
                        "border-r px-1 py-3 text-center text-xs whitespace-normal break-all tabular-nums lg:px-2 lg:text-sm",
                        index === 0 && "bg-muted/25",
                        value === 0 ? "text-muted-foreground" : "font-bold",
                      )}
                    >
                      {integerFormatter.format(value)}
                    </TableCell>
                  );
                })}
                <TableCell className="px-2 py-3 text-right text-xs font-semibold whitespace-normal break-all text-primary tabular-nums lg:px-3 lg:text-sm 2xl:px-4">
                  {integerFormatter.format(row.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              <TableCell className="border-r px-2 py-3 text-xs font-semibold whitespace-normal lg:px-3 lg:text-sm 2xl:px-4">
                Tổng
              </TableCell>
              {matrix.columns.map((column, index) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "border-r px-1 py-3 text-center text-xs font-semibold whitespace-normal break-all text-primary tabular-nums lg:px-2 lg:text-sm",
                    index === 0 && "bg-muted/80",
                  )}
                >
                  {integerFormatter.format(column.total)}
                </TableCell>
              ))}
              <TableCell className="px-2 py-3 text-right text-xs font-bold whitespace-normal break-all text-primary tabular-nums lg:px-3 lg:text-sm 2xl:px-4">
                {integerFormatter.format(matrix.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function PipelineColumnHeading({ name, isUnassigned }: { name: string; isUnassigned: boolean }) {
  const marker = name.match(/\((L\d+)\)/i)?.[1]?.toUpperCase();
  const label = marker ? name.replace(/\s*\(L\d+\)\s*/i, "").trim() : name;
  const compactLabel = isUnassigned ? "Chưa chọn" : (marker ?? label);

  return (
    <>
      <span className="2xl:hidden">{compactLabel}</span>
      <span className="hidden flex-col items-center gap-1 2xl:flex">
        <span>{label}</span>
        {marker && <span className="text-muted-foreground">{marker}</span>}
      </span>
    </>
  );
}

function SharedDashboardFilter({ filter, options, activeDescription, availableFields = ["MAJOR", "SOURCE", "ASSIGNEE"], onChange, onReset }: {
  filter: SharedFilterState;
  options: DashboardFilterOptions;
  activeDescription: string | null;
  availableFields?: Array<Exclude<SharedFilterField, "NONE">>;
  onChange: (filter: SharedFilterState) => void;
  onReset: () => void;
}) {
  function changeField(field: SharedFilterField) {
    onChange({
      ...filter,
      field,
      operator: "EQUALS",
      value: "",
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.15fr_0.9fr_1.5fr_auto] xl:items-end">
        <Field>
          <FieldLabel>Trường thông tin</FieldLabel>
          <Select value={filter.field} onValueChange={(value) => changeField(value as SharedFilterField)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="NONE">Chưa chọn</SelectItem>
              {availableFields.includes("MAJOR") && <SelectItem value="MAJOR">Ngành đăng ký</SelectItem>}
              {availableFields.includes("SOURCE") && <SelectItem value="SOURCE">Nguồn</SelectItem>}
              {availableFields.includes("ASSIGNEE") && <SelectItem value="ASSIGNEE">Nhân viên</SelectItem>}
              {availableFields.includes("PIPELINE_STAGE") && <SelectItem value="PIPELINE_STAGE">Tiến trình</SelectItem>}
            </SelectGroup></SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Điều kiện</FieldLabel>
          <DashboardFilterCondition filter={filter} onChange={onChange} />
        </Field>

        <Field>
          <FieldLabel>Giá trị</FieldLabel>
          <DashboardFilterValue filter={filter} options={options} onChange={onChange} />
        </Field>
        <Button
          type="button"
          variant="outline"
          className="w-full md:w-auto"
          onClick={onReset}
          disabled={filter.field === "NONE" && !filter.timePreset}
        >
          <RotateCcw aria-hidden="true" /> Xóa lọc
        </Button>
        <QuickDateFilters filter={filter} onChange={onChange} />
        {activeDescription && (
          <p className="rounded-lg border border-primary/20 bg-background/80 px-3 py-2 text-sm text-primary md:col-span-2 xl:col-span-4" role="status" aria-live="polite">
            <span className="font-medium">Đang áp dụng:</span> {activeDescription}
          </p>
        )}
    </div>
  );
}

function DashboardFilterCondition({ filter, onChange }: {
  filter: SharedFilterState;
  onChange: (filter: SharedFilterState) => void;
}) {
  return (
    <Select
      value={filter.operator}
      disabled={filter.field === "NONE"}
      onValueChange={(operator) => onChange({ ...filter, operator: operator as SharedFilterState["operator"] })}
    >
      <SelectTrigger className="w-full"><SelectValue placeholder="Chọn trường trước" /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="EQUALS">Bằng</SelectItem>
        <SelectItem value="NOT_EQUALS">Không bằng</SelectItem>
      </SelectGroup></SelectContent>
    </Select>
  );
}

function DashboardFilterValue({ filter, options, onChange }: {
  filter: SharedFilterState;
  options: DashboardFilterOptions;
  onChange: (filter: SharedFilterState) => void;
}) {
  const categoryOptions = getCategoryOptions(filter.field, options);
  return (
    <Select
      value={filter.value}
      disabled={filter.field === "NONE" || categoryOptions.length === 0}
      onValueChange={(value) => onChange({ ...filter, value })}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={filter.field === "NONE" ? "Chọn trường trước" : "Chọn giá trị"} />
      </SelectTrigger>
      <SelectContent><SelectGroup>
        {categoryOptions.length === 0
          ? <SelectItem value="NO_OPTIONS" disabled>Không có dữ liệu</SelectItem>
          : categoryOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  );
}

function QuickDateFilters({ filter, onChange }: {
  filter: SharedFilterState;
  onChange: (filter: SharedFilterState) => void;
}) {
  const quarterOptions = getQuarterFilterOptions();
  const selectedQuarter = quarterOptions.find((option) => (
    option.isCurrent
      ? filter.timePreset === "THIS_QUARTER"
      : filter.timePreset === "CUSTOM"
        && filter.fromDate === option.fromDate
        && filter.toDate === option.toDate
  ));
  const isCustomDateActive = filter.timePreset === "CUSTOM" && !selectedQuarter;

  return (
    <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-4">
      <p className="text-sm font-medium">Ngày tạo</p>
      <div className="flex flex-wrap gap-2" aria-label="Lọc nhanh theo ngày tạo">
        {datePresetOptions.map((option) => {
          const isActive = filter.timePreset === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              onClick={() => onChange({ ...filter, timePreset: option.value, fromDate: "", toDate: "" })}
            >
              {option.label}
            </Button>
          );
        })}
        <Select
          value={selectedQuarter?.value ?? ""}
          onValueChange={(value) => {
            const option = quarterOptions.find((item) => item.value === value);
            if (!option) return;
            onChange(option.isCurrent
              ? { ...filter, timePreset: "THIS_QUARTER", fromDate: "", toDate: "" }
              : { ...filter, timePreset: "CUSTOM", fromDate: option.fromDate, toDate: option.toDate });
          }}
        >
          <SelectTrigger size="sm" aria-label="Lọc ngày tạo theo quý">
            <SelectValue placeholder="Theo quý" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {quarterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <DateRangeFilter
          className="w-auto"
          buttonClassName={isCustomDateActive ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : undefined}
          isActive={isCustomDateActive}
          placeholder="Khoảng tùy chọn"
          fromDate={filter.fromDate}
          toDate={filter.toDate}
          onOpenChange={(open) => {
            if (open && filter.timePreset !== "CUSTOM") {
              onChange({ ...filter, timePreset: "CUSTOM", fromDate: "", toDate: "" });
            }
          }}
          onChange={(fromDate, toDate) => onChange({ ...filter, timePreset: "CUSTOM", fromDate, toDate })}
        />
      </div>
    </div>
  );
}

function getCategoryOptions(field: SharedFilterField, options: DashboardFilterOptions) {
  if (field === "MAJOR") return options.majors;
  if (field === "SOURCE") return options.sources;
  if (field === "ASSIGNEE") return options.assignees;
  if (field === "PIPELINE_STAGE") return options.stages;
  return [];
}

function getActiveFilterDescription(filter: SharedFilterState, options: DashboardFilterOptions) {
  const descriptions: string[] = [];
  const operatorLabel = filter.operator === "NOT_EQUALS" ? "không bằng" : "bằng";
  if (filter.field === "MAJOR" && filter.value) descriptions.push(`Ngành đăng ký ${operatorLabel} “${options.majors.find((item) => item.id === filter.value)?.name ?? "Không xác định"}”.`);
  if (filter.field === "SOURCE" && filter.value) descriptions.push(`Nguồn ${operatorLabel} “${options.sources.find((item) => item.id === filter.value)?.name ?? "Không xác định"}”.`);
  if (filter.field === "ASSIGNEE" && filter.value) descriptions.push(`Nhân viên ${operatorLabel} “${options.assignees.find((item) => item.id === filter.value)?.name ?? "Không xác định"}”.`);
  if (filter.field === "PIPELINE_STAGE" && filter.value) descriptions.push(`Tiến trình ${operatorLabel} “${options.stages.find((item) => item.id === filter.value)?.name ?? "Không xác định"}”.`);
  if (filter.timePreset === "CUSTOM" && filter.fromDate && filter.toDate) {
    const selectedQuarter = getQuarterFilterOptions().find((option) => (
      !option.isCurrent && option.fromDate === filter.fromDate && option.toDate === filter.toDate
    ));
    descriptions.push(selectedQuarter
      ? `Ngày tạo trong ${selectedQuarter.label.toLowerCase()} năm ${new Date().getFullYear()}.`
      : `Ngày tạo từ ${formatFilterDate(filter.fromDate)} đến ${formatFilterDate(filter.toDate)}.`);
  } else if (filter.timePreset && filter.timePreset !== "CUSTOM") {
    descriptions.push(`Ngày tạo trong ${relativeDateLabel(filter.timePreset)}.`);
  }
  return descriptions.length > 0 ? descriptions.join(" ") : null;
}

function formatFilterDate(value: string) {
  return filterDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function relativeDateLabel(value: string) {
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
  return ({
    LAST_7_DAYS: "7 ngày gần nhất",
    THIS_WEEK: "tuần này",
    LAST_WEEK: "tuần trước",
    THIS_MONTH: "tháng này",
    LAST_MONTH: "tháng trước",
    THIS_QUARTER: `quý này (Quý ${currentQuarter})`,
    LAST_QUARTER: "quý trước",
  } as Record<string, string>)[value] ?? "khoảng đã chọn";
}

function getQuarterFilterOptions(today = new Date()) {
  const year = today.getFullYear();
  const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
  const options = [{
    value: "CURRENT_QUARTER",
    label: `Quý này (Quý ${currentQuarter})`,
    fromDate: "",
    toDate: "",
    isCurrent: true,
  }];

  for (let quarter = 1; quarter < currentQuarter; quarter += 1) {
    options.push({
      value: `QUARTER_${quarter}`,
      label: `Quý ${quarter}`,
      fromDate: toDateInputValue(new Date(year, (quarter - 1) * 3, 1)),
      toDate: toDateInputValue(new Date(year, quarter * 3, 0)),
      isCurrent: false,
    });
  }

  return options;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DirectorKpiCard({ title, value, percentage, icon: Icon, description }: {
  title: string;
  value: number;
  percentage?: number;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  description: string;
}) {
  return (
    <Card className="relative min-h-44 gap-5 border-border/70 py-5 shadow-xs">
      <CardHeader className="grid min-h-14 grid-cols-[1fr_auto] items-start gap-3 px-5">
        <CardTitle className="text-base leading-snug text-primary">{title}</CardTitle>
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-5" aria-hidden={true} />
        </span>
      </CardHeader>
      <CardContent className="flex items-start justify-between gap-4 px-5">
        <p className="text-4xl leading-none font-semibold tracking-tight tabular-nums">{integerFormatter.format(value)}</p>
        {percentage !== undefined && (
          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-2xl leading-none font-semibold text-primary tabular-nums" aria-label={`Tỷ lệ chuyển đổi ${percentFormatter.format(percentage)} phần trăm`}>
            {percentFormatter.format(percentage)}%
          </div>
        )}
      </CardContent>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon-sm" variant="ghost" className="absolute right-3 bottom-3 text-primary" aria-label={`Xem mô tả ô ${title}`}>
            <Info aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72" side="left">{description}</TooltipContent>
      </Tooltip>
    </Card>
  );
}

function DirectorDashboardSkeleton() {
  return (
    <output className="mx-auto flex max-w-7xl flex-col gap-6" aria-label="Đang tải dashboard điều hành">
      <Skeleton className="h-20 max-w-xl" />
      <Skeleton className="h-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-44" />)}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
      <span className="sr-only">Đang tải dashboard điều hành</span>
    </output>
  );
}

function toRequestFilters(filter: SharedFilterState): DirectorDashboardFilters {
  const request: DirectorDashboardFilters = {};
  if (filter.field === "MAJOR" && filter.value) request.majorId = filter.value;
  if (filter.field === "SOURCE" && filter.value) request.sourceId = filter.value;
  if (filter.field === "ASSIGNEE" && filter.value) request.assigneeId = filter.value;
  if (filter.field === "PIPELINE_STAGE" && filter.value) request.pipelineStageId = filter.value;
  if (request.majorId || request.sourceId || request.assigneeId || request.pipelineStageId) request.filterOperator = filter.operator;
  if (filter.timePreset && filter.timePreset !== "CUSTOM") request.timePreset = filter.timePreset;
  if (filter.timePreset === "CUSTOM" && filter.fromDate && filter.toDate) {
    request.timePreset = "CUSTOM";
    request.fromDate = filter.fromDate;
    request.toDate = filter.toDate;
  }
  return request;
}
