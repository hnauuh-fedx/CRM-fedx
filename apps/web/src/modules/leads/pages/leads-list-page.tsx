import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { CreateLeadDialog } from "../components/create-lead-dialog";
import { useLeadListColumns } from "../components/lead-list-columns";
import { useLeadDisplayLayout, getLeadListLayoutScreen } from "../use-lead-display-layout";
import { LeadDisplayLayoutStatus, EditLeadDisplayLayoutButton } from "../components/lead-display-layout-status";
import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { LeadDetailLayout } from "../components/lead-detail-layout";
import { LeadListTable } from "../components/lead-list-table";
import { defaultDisplayColumnWidth, minDisplayColumnWidth, maxDisplayColumnWidth } from "@admission-crm/shared/display-layout";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type Table as DataTable,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ExternalLink, FileSpreadsheet, ListPlus, Upload } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { DataPagination } from "@/components/shared/data-pagination";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { addLeadsToCustomerList, createCustomerList, getCustomerListLeads, getCustomerLists } from "@/services/customer-list.service";
import { assignLeads, deleteLeads, getLead, getLeadActionOptions, getLeadFilterOptions, getLeads, importLeads } from "@/services/lead.service";
import { LeadProgressSelector } from "../components/lead-form";
import { LeadImportErrorsTable } from "../components/lead-import-errors-table";
import { LeadCustomFieldsCard } from "../components/lead-custom-fields-card";
import { InlineLeadSummaryCard } from "../components/inline-lead-summary-card";
import { LeadFilterPanel } from "../components/lead-filter-panel";
import type { FilterConditionState } from "../filter-fields";
import { decodeConditions, applyConditionsToParams } from "../filter-serialization";
import { LeadOpenInitialization } from "../components/lead-open-initialization";
import { useLeadWorkflowTransition } from "../components/transition-note-dialog";
import type {
  LeadActionOptions,
  LeadDetail,
  LeadFilterOptions,
  LeadImportResult,
  LeadListFilters,
  LeadListItem,
  LeadListResponse,
  LeadSortField,
} from "../lead.types";
import {
  ActivityWorkspace,
  PipelineProgressCard,
  SourceOccurrencesCard,
} from "./lead-detail-page";

const compactNumberFormatter = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const sortableColumns = new Set<LeadSortField>(["createdAt", "fullName", "leadCode", "pipelineStage"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const emptyLeads: LeadListItem[] = [];
const emptyFilters: LeadListFilters = {
  status: "",
  search: "",
  pipelineStageId: "",
  sourceId: "",
  majorId: "",
  assigneeId: "",
  fromDate: "",
  toDate: "",
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function LeadImportDialog({
  isPending,
  error,
  result,
  onReset,
  onImport,
}: {
  isPending: boolean;
  error: Error | null;
  result?: LeadImportResult;
  onReset: () => void;
  onImport: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setFile(null);
          setFileError(null);
          onReset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Upload data-icon="inline-start" aria-hidden="true" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[min(72rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Import lead từ Excel</DialogTitle>
          <DialogDescription>
            Chỉ cần các cột bắt buộc; không cần tạo đủ tất cả trường của form lead.
            Có thể dùng trực tiếp file export BizflyCRM với hai dòng tiêu đề.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (file) onImport(file);
          }}
        >
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
            <div>
              <p className="font-medium">Cột bắt buộc</p>
              <p className="mt-1 text-muted-foreground">
                Dùng đúng tên cột:{" "}
                <code className="font-medium text-foreground">fullName</code>,{" "}
                <code className="font-medium text-foreground">phone</code> và{" "}
                <code className="font-medium text-foreground">sourceName</code>{" "}
                hoặc{" "}
                <code className="font-medium text-foreground">sourceId</code>.
              </p>
            </div>
            <div>
              <p className="font-medium">Chương trình tuyển sinh</p>
              <p className="mt-1 text-muted-foreground">
                Hệ thống dùng chương trình đang làm việc. Nếu chưa chọn chương
                trình, file cần thêm
                <code className="ml-1 font-medium text-foreground">
                  institutionProgramId
                </code>
                ,{" "}
                <code className="font-medium text-foreground">programCode</code>{" "}
                hoặc{" "}
                <code className="font-medium text-foreground">programName</code>
                .
              </p>
            </div>
            <p className="text-muted-foreground">
              Các cột như email, pipelineStageId, note, gender và dateOfBirth là
              tùy chọn, có thể bỏ hoàn toàn.
            </p>
            <div>
              <p className="font-medium">File BizflyCRM</p>
              <p className="mt-1 text-muted-foreground">
                Chọn chương trình làm việc trước khi import. Hệ thống giữ họ tên, số điện thoại,
                nguồn HV, ngành đăng ký, quy trình Telesale cấp 1, nhân viên, ghi chú, email và ngày tạo gốc.
                Ngành chưa có sẽ được tạo trong chương trình đang chọn. L3 được chuyển sang L4;
                L0, L1, L2 và L5 giữ tiến trình tương ứng. Nhân viên phải thuộc chương trình này.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="lead-import-file">File Excel</FieldLabel>
            <Input
              id="lead-import-file"
              type="file"
              accept=".xlsx,.xls"
              disabled={isPending}
              aria-describedby="lead-import-help"
              aria-invalid={Boolean(fileError)}
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                const validationMessage = validateLeadImportFile(selectedFile);
                setFileError(validationMessage);
                setFile(validationMessage ? null : selectedFile);
              }}
            />
            <p id="lead-import-help" className="text-sm text-muted-foreground">
              Hỗ trợ tối đa 5.000 dòng cho file Bizfly, 1.000 dòng cho mẫu thông thường và dung lượng 5MB.
              Các dòng lỗi sẽ được bỏ qua và hiển thị lý do.
            </p>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error instanceof ApiError
                ? error.message
                : "Không thể import lead. Vui lòng kiểm tra file và thử lại."}
            </p>
          )}
          {result && <LeadImportResultPanel result={result} />}
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={!file || isPending}>
              <FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
              {isPending ? "Đang import..." : "Import lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function validateLeadImportFile(file: File | null) {
  if (!file) return null;
  if (!/\.(xlsx|xls)$/i.test(file.name))
    return "Vui lòng chọn file Excel có định dạng .xlsx hoặc .xls.";
  if (file.size > 5 * 1024 * 1024) return "File Excel không được vượt quá 5MB.";
  return null;
}

function LeadImportResultPanel({ result }: { result: LeadImportResult }) {
  return (
    <div className="grid min-w-0 gap-4 rounded-md border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-3" role="status">
        <ImportMetric label="Tổng dòng" value={result.totalRows} />
        <ImportMetric label="Đã import" value={result.importedRows} />
        <ImportMetric label="Lỗi" value={result.failedRows} />
      </div>
      {result.errors.length > 0 && <LeadImportErrorsTable errors={result.errors} />}
    </div>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

type LeadsListPageProps = {
  audience?: "candidates" | "students" | "all";
  eyebrow?: string;
  title?: string;
  description?: string;
  detailBasePath?: string;
  customerListId?: string;
  enableCustomerListAssignment?: boolean;
  showLeadCreationActions?: boolean;
};

export function LeadsListPage({
  audience = "candidates",
  eyebrow = "CRM Sale",
  title = "Danh sách lead",
  description = "Dữ liệu hiển thị trong phạm vi được phân quyền và phân công cho tài khoản của bạn.",
  detailBasePath = "/sale/leads",
  customerListId,
  enableCustomerListAssignment = false,
  showLeadCreationActions = true,
}: LeadsListPageProps = {}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canCreate = showLeadCreationActions && auth.can("lead.create");
  const canUpdate = ["lead.update_all", "lead.update_department", "lead.update_assigned"].some(auth.can);
  const canDelete = auth.can("lead.delete");
  const isSaleList = !enableCustomerListAssignment;
  const canAssignSale = isSaleList && (auth.can("lead.assign") || auth.can("lead.reassign"));
  const [{ page, pageSize, editingLeadId, isEditDialogOpen }, setViewState] = useState<{
    page: number;
    pageSize: number;
    editingLeadId: string | null;
    isEditDialogOpen: boolean;
  }>({
    page: 1,
    pageSize: 20,
    editingLeadId: null,
    isEditDialogOpen: false,
  });
  const [draftFilters, setDraftFilters] =
    useState<LeadListFilters>(emptyFilters);
  const [filters, setFilters] = useState<LeadListFilters>(emptyFilters);
  const [searchParams, setSearchParams] = useSearchParams();
  // Bộ lọc nâng cao được giữ trên URL để tải lại trang không mất điều kiện.
  const [filterConditions, setFilterConditions] = useState<FilterConditionState[]>(() => decodeConditions(searchParams));
  const canViewSensitiveLeadData = ["lead.sensitive.view", "lead.update_all", "lead.update_department", "lead.update_assigned"].some(auth.can);
  function applyFilterConditions(conditions: FilterConditionState[]) {
    setFilterConditions(conditions);
    setSearchParams((current) => applyConditionsToParams(new URLSearchParams(current), conditions), { replace: true });
    setViewState((current) => ({ ...current, page: 1 }));
  }
  useEffect(() => {
    if (draftFilters.search === filters.search) return;
    const timeout = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: draftFilters.search }));
      setViewState((current) => ({ ...current, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [draftFilters.search, filters.search]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [saleAssignmentOpen, setSaleAssignmentOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const primarySort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(primarySort.id as LeadSortField)
    ? (primarySort.id as LeadSortField)
    : "createdAt";
  const sortOrder = primarySort.desc ? "desc" : "asc";
  const leadsQuery = useQuery({
    queryKey: customerListId
      ? ["customer-lists", "leads", customerListId, page, pageSize, sortBy, sortOrder, filters, filterConditions]
      : ["leads", "list", audience, page, pageSize, sortBy, sortOrder, filters, filterConditions],
    queryFn: () =>
      customerListId
        ? getCustomerListLeads(customerListId, { page, limit: pageSize, sortBy, sortOrder, ...filters, filterConditions }, auth.accessToken!)
        : getLeads({ audience, page, limit: pageSize, sortBy, sortOrder, ...filters, filterConditions }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["leads", "options", audience],
    queryFn: () => getLeadFilterOptions(auth.accessToken!, audience),
  });
  const customerListCapabilityQuery = useQuery({
    queryKey: ["customer-lists", "capabilities"],
    queryFn: () => getCustomerLists({ page: 1, limit: 1 }, auth.accessToken!),
    enabled:
      enableCustomerListAssignment &&
      (auth.can("customer_list.view_all") || auth.can("customer_list.manage")),
  });
  const actionOptionsQuery = useQuery({
    queryKey: ["leads", "action-options"],
    queryFn: () => getLeadActionOptions(auth.accessToken!),
    enabled: canCreate || canUpdate || canAssignSale || Boolean(editingLeadId),
  });
  const importMutation = useMutation({
    mutationFn: (file: File) => importLeads(file, auth.accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
    },
  });
  const data = leadsQuery.data?.data ?? emptyLeads;
  const pagination = leadsQuery.data?.pagination;

  const layoutScreen = getLeadListLayoutScreen(detailBasePath);
  const columns = useLeadListColumns(detailBasePath);
  const { query: displayLayout, isLoading: isLayoutLoading, columnVisibility, columnOrder, columnPinning, columnSizing, layoutContainerRef } = useLeadDisplayLayout(true, columns, layoutScreen);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, columnVisibility, columnOrder, columnPinning, columnSizing },
    defaultColumn: { size: defaultDisplayColumnWidth, minSize: minDisplayColumnWidth, maxSize: maxDisplayColumnWidth },
    getRowId: (row) => row.id,
    manualSorting: true,
    enableMultiSort: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      setSorting((current) => updateLeadSorting(current, updater));
      setViewState((current) => ({ ...current, page: 1 }));
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageLoadingBoundary variant="lead-list" queries={[leadsQuery, optionsQuery, displayLayout]}>
      <div className="mx-auto flex w-full min-w-0 max-w-400 flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        scopeLabel="Theo phạm vi truy cập"
        description={description}
        actions={
            <div className="flex flex-wrap items-center gap-2">
              <EditLeadDisplayLayoutButton layout={displayLayout.data} screen={layoutScreen} />
              {canCreate && <>
              <LeadImportDialog
                isPending={importMutation.isPending}
                error={importMutation.error}
                result={importMutation.data}
                onReset={() => importMutation.reset()}
                onImport={(file) => importMutation.mutate(file)}
              />
              <CreateLeadDialog
                actionOptionsQuery={actionOptionsQuery}
                detailBasePath={detailBasePath}
              />
              </>}
            </div>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Tiến trình</CardTitle>
          <CardDescription>
            Chọn một bước để lọc danh sách lead đang ở tiến trình đó.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5">
          <LeadProgressSelector
            value={filters.pipelineStageId}
            stages={optionsQuery.data?.stages ?? []}
            allOptionLabel="Tất cả"
            allOptionCount={optionsQuery.data?.totalLeads ?? 0}
            allOptionSelected={!filters.pipelineStageId && filters.status !== "FAIL"}
            singleRowDesktop
            onChange={(pipelineStageId) => {
              setDraftFilters((current) => ({ ...current, pipelineStageId, status: "" }));
              setFilters((current) => ({ ...current, pipelineStageId, status: "" }));
              setViewState((current) => ({ ...current, page: 1 }));
            }}
          />
          {!customerListId && (
            <Field className="gap-2 sm:max-w-48">
              <FieldLabel htmlFor="lead-fail-filter">Trạng thái</FieldLabel>
              <Button
                id="lead-fail-filter"
                type="button"
                variant={filters.status === "FAIL" ? "destructive" : "outline"}
                aria-pressed={filters.status === "FAIL"}
                aria-label="Lọc lead ở trạng thái Fail"
                className="min-h-14 w-full justify-between"
                onClick={() => {
                  setDraftFilters((current) => ({ ...current, pipelineStageId: "", status: "FAIL" }));
                  setFilters((current) => ({ ...current, pipelineStageId: "", status: "FAIL" }));
                  setViewState((current) => ({ ...current, page: 1 }));
                }}
              >
                Fail
                <Badge variant="secondary" className="tabular-nums">
                  {compactNumberFormatter.format(optionsQuery.data?.failedLeads ?? 0)}
                </Badge>
              </Button>
            </Field>
          )}
        </CardContent>
      </Card>

      <LeadFilterPanel
        filters={draftFilters}
        options={optionsQuery.data}
        filterConditions={filterConditions}
        canViewSensitiveLeadData={canViewSensitiveLeadData}
        onChange={(field, value) => {
          setDraftFilters((current) => ({ ...current, [field]: value }));
          if (field !== "search") {
            setFilters((current) => ({ ...current, [field]: value }));
            setViewState((current) => ({ ...current, page: 1 }));
          }
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          applyFilterConditions([]);
        }}
        onApplyConditions={applyFilterConditions}
      />
      <LeadDisplayLayoutStatus enabled query={displayLayout} screen={layoutScreen} />
      <LeadResultsCard
        isLayoutLoading={isLayoutLoading}
        layoutContainerRef={layoutContainerRef}
        table={table}
        data={data}
        pagination={pagination}
        page={page}
        pageSize={pageSize}
        queryState={{
          isLoading: leadsQuery.isLoading,
          isError: leadsQuery.isError,
          isFetching: leadsQuery.isFetching,
          // Lỗi điều kiện lọc (400/403) có thông báo cụ thể từ API, nên hiển thị thay cho lỗi chung.
          errorMessage: leadsQuery.error instanceof ApiError && [400, 403].includes(leadsQuery.error.status)
            ? leadsQuery.error.message
            : undefined,
        }}
        onReload={() => leadsQuery.refetch()}
        onPageChange={(nextPage) => setViewState((current) => ({ ...current, page: nextPage }))}
        onPageSizeChange={(nextPageSize) => setViewState((current) => ({ ...current, page: 1, pageSize: nextPageSize }))}
        onEditLead={(leadId) => {
          setViewState((current) => ({
            ...current,
            editingLeadId: leadId,
            isEditDialogOpen: true,
          }));
        }}
        canAssignToCustomerList={
          enableCustomerListAssignment &&
          (customerListCapabilityQuery.data?.capabilities.canManage ??
            auth.can("customer_list.manage"))
        }
        selectedCount={Object.keys(rowSelection).length}
        onAssignToCustomerList={() => setAssignmentOpen(true)}
        showSaleActions={isSaleList}
        canAssignSale={canAssignSale}
        onAssignSale={() => setSaleAssignmentOpen(true)}
        canDelete={canDelete}
        onDelete={() => setBulkDeleteOpen(true)}
        onClearSelection={() => setRowSelection({})}
      />
      <AssignToCustomerListDialog
        open={assignmentOpen}
        leadIds={Object.keys(rowSelection)}
        onOpenChange={setAssignmentOpen}
        onSuccess={() => {
          setRowSelection({});
          queryClient.invalidateQueries({ queryKey: ["customer-lists"] });
        }}
      />
      <AssignSaleDialog
        open={saleAssignmentOpen}
        leadIds={Object.keys(rowSelection)}
        telesales={actionOptionsQuery.data?.telesales ?? []}
        optionsLoading={actionOptionsQuery.isLoading}
        optionsError={actionOptionsQuery.isError}
        onOpenChange={setSaleAssignmentOpen}
        onSuccess={() => {
          setRowSelection({});
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["sale"] });
        }}
      />
      <BulkDeleteLeadsDialog
        open={bulkDeleteOpen}
        leadIds={Object.keys(rowSelection)}
        onOpenChange={setBulkDeleteOpen}
        onSuccess={() => {
          setRowSelection({});
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["sale"] });
          queryClient.invalidateQueries({ queryKey: ["customer-lists"] });
        }}
      />
      <LeadEditDialogController
        key={editingLeadId ?? "closed"}
        editingLeadId={editingLeadId}
        isEditDialogOpen={isEditDialogOpen}
        actionOptionsQuery={actionOptionsQuery}
        optionsQuery={optionsQuery}
        canUpdate={canUpdate}
        setViewState={setViewState}
      />
    </div>
    </PageLoadingBoundary>
  );
}

type EditLeadDialogProps = {
  isOpen: boolean;
  lead?: LeadDetail;
  options?: LeadActionOptions;
  fallbackStages?: LeadFilterOptions["stages"];
  stagesLoading: boolean;
  stagesLoadError: boolean;
  canUpdate: boolean;
  status: "loading" | "error" | "ready";
  onOpenChange: (open: boolean) => void;
  onAfterClose: () => void;
};

function EditLeadDialog({
  isOpen,
  lead,
  options,
  fallbackStages,
  stagesLoading,
  stagesLoadError,
  canUpdate,
  status,
  onOpenChange,
  onAfterClose,
}: EditLeadDialogProps) {
  const auth = useAuth();
  const canWriteStudent = lead?.recordType !== "student" || ["student.update", "student.update_all"].some(auth.can);
  const canNote = canWriteStudent && (canUpdate || auth.can("lead_note.create"));
  const canFile = canWriteStudent && (canUpdate || auth.can("file.upload"));
  const transition = useLeadWorkflowTransition(lead);
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-400"
        onCloseAutoFocus={onAfterClose}
      >
        <EditLeadHeader lead={lead} />
        {status === "loading" ? (
          <p role="status" className="px-6 py-5 text-sm text-muted-foreground">
            Đang tải thông tin ứng viên…
          </p>
        ) : status === "error" || !lead ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            Không thể tải thông tin ứng viên. Vui lòng đóng cửa sổ và thử lại.
          </p>
        ) : (
          <EditLeadContent
            lead={lead}
            options={options}
            fallbackStages={fallbackStages}
            stagesLoading={stagesLoading}
            stagesLoadError={stagesLoadError}
            canUpdate={canUpdate && canWriteStudent}
            isOpen={isOpen}
            transition={transition}
            canNote={canNote}
            canFile={canFile}
            accessToken={auth.accessToken!}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type AssignSaleDialogProps = {
  open: boolean;
  leadIds: string[];
  telesales: Array<{ id: string; fullName: string }>;
  optionsLoading: boolean;
  optionsError: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function AssignSaleDialog({
  open,
  leadIds,
  telesales,
  optionsLoading,
  optionsError,
  onOpenChange,
  onSuccess,
}: AssignSaleDialogProps) {
  const auth = useAuth();
  const [assigneeId, setAssigneeId] = useState("");
  const assignmentMutation = useMutation({
    mutationFn: () => assignLeads(leadIds, assigneeId, auth.accessToken!),
    onSuccess: () => {
      onSuccess();
      setAssigneeId("");
      onOpenChange(false);
    },
  });
  const setOpen = (next: boolean) => {
    if (assignmentMutation.isPending) return;
    if (next) assignmentMutation.reset();
    else setAssigneeId("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán nhân viên sale</DialogTitle>
          <DialogDescription>
            Chọn nhân viên sale phụ trách cho {leadIds.length} lead đang được
            chọn.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={assignmentMutation.isError}>
            <FieldLabel htmlFor="bulk-lead-assignee">Nhân viên sale</FieldLabel>
            <Select
              value={assigneeId}
              onValueChange={setAssigneeId}
              disabled={optionsLoading || assignmentMutation.isPending}
            >
              <SelectTrigger
                id="bulk-lead-assignee"
                className="w-full"
                aria-invalid={assignmentMutation.isError}
              >
                <SelectValue
                  placeholder={
                    optionsLoading
                      ? "Đang tải nhân viên sale…"
                      : "Chọn nhân viên sale"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {telesales.map((telesale) => (
                    <SelectItem key={telesale.id} value={telesale.id}>
                      {telesale.fullName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {optionsError && (
            <p role="alert" className="text-sm text-destructive">
              Không thể tải danh sách nhân viên sale. Vui lòng đóng cửa sổ và
              thử lại.
            </p>
          )}
          {!optionsLoading && !optionsError && telesales.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              Không có nhân viên sale phù hợp trong phạm vi phân công của bạn.
            </p>
          )}
          {assignmentMutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {assignmentMutation.error instanceof ApiError
                ? assignmentMutation.error.message
                : "Không thể gán nhân viên sale. Vui lòng thử lại."}
            </p>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={assignmentMutation.isPending}
            onClick={() => setOpen(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={
              !assigneeId ||
              leadIds.length === 0 ||
              optionsLoading ||
              optionsError ||
              assignmentMutation.isPending
            }
            onClick={() => assignmentMutation.mutate()}
          >
            {assignmentMutation.isPending && (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            )}
            {assignmentMutation.isPending ? "Đang gán…" : "Xác nhận gán sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteLeadsDialog({
  open,
  leadIds,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  leadIds: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const auth = useAuth();
  const [confirmationValue, setConfirmationValue] = useState("");
  const requiredConfirmation = `Xác nhận xóa ${leadIds.length} lead`;
  const hasConfirmationError =
    confirmationValue.length > 0 && confirmationValue !== requiredConfirmation;
  const deleteMutation = useMutation({
    mutationFn: () => deleteLeads(leadIds, auth.accessToken!),
    onSuccess: () => {
      onSuccess();
      setConfirmationValue("");
      onOpenChange(false);
    },
  });
  const setOpen = (next: boolean) => {
    if (deleteMutation.isPending) return;
    if (next) deleteMutation.reset();
    else setConfirmationValue("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa hàng loạt</DialogTitle>
          <DialogDescription>
            Bạn đang chuẩn bị xóa {leadIds.length} lead. Thao tác này sẽ đưa các
            lead ra khỏi danh sách hoạt động.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmationValue === requiredConfirmation)
              deleteMutation.mutate();
          }}
        >
          <FieldGroup>
            <Field
              data-invalid={hasConfirmationError || deleteMutation.isError}
            >
              <FieldLabel htmlFor="bulk-delete-confirmation">
                Nhập nội dung xác nhận
              </FieldLabel>
              <FieldDescription>
                Nhập chính xác:{" "}
                <span className="font-semibold text-foreground">
                  {requiredConfirmation}
                </span>
              </FieldDescription>
              <Input
                id="bulk-delete-confirmation"
                value={confirmationValue}
                onChange={(event) => setConfirmationValue(event.target.value)}
                placeholder={requiredConfirmation}
                autoComplete="off"
                spellCheck={false}
                disabled={deleteMutation.isPending}
                aria-invalid={hasConfirmationError || deleteMutation.isError}
                autoFocus
              />
              {hasConfirmationError && (
                <FieldError>Nội dung xác nhận chưa chính xác.</FieldError>
              )}
              {deleteMutation.isError && (
                <FieldError>
                  {deleteMutation.error instanceof ApiError
                    ? deleteMutation.error.message
                    : "Không thể xóa các lead đã chọn. Vui lòng thử lại."}
                </FieldError>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                leadIds.length === 0 ||
                confirmationValue !== requiredConfirmation ||
                deleteMutation.isPending
              }
            >
              {deleteMutation.isPending && (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              )}
              {deleteMutation.isPending
                ? "Đang xóa…"
                : `Xóa ${leadIds.length} lead`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignToCustomerListDialog({
  open,
  leadIds,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  leadIds: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const auth = useAuth();
  const [selectedListId, setSelectedListId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const listsQuery = useQuery({
    queryKey: ["customer-lists", "assignment-options"],
    queryFn: () => getCustomerLists({ page: 1, limit: 100 }, auth.accessToken!),
    enabled: open,
  });
  const assignmentMutation = useMutation({
    mutationFn: async () => {
      let listId = selectedListId;
      if (isCreating) {
        if (newListName.trim().length < 2)
          throw new Error("Tên danh sách phải có ít nhất 2 ký tự.");
        const created = await createCustomerList(
          { name: newListName.trim() },
          auth.accessToken!,
        );
        listId = created.id;
      }
      if (!listId) throw new Error("Vui lòng chọn một danh sách.");
      return addLeadsToCustomerList(listId, leadIds, auth.accessToken!);
    },
    onSuccess: () => {
      onSuccess();
      setSelectedListId("");
      setNewListName("");
      setIsCreating(false);
      onOpenChange(false);
    },
  });
  const setOpen = (next: boolean) => {
    if (next) assignmentMutation.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán Lead vào danh sách</DialogTitle>
          <DialogDescription>
            Đã chọn {leadIds.length} Lead. Các Lead đã có trong danh sách sẽ
            không bị thêm trùng.
          </DialogDescription>
        </DialogHeader>
        {isCreating ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-customer-list-name">
                Tên danh sách mới
              </FieldLabel>
              <Input
                id="new-customer-list-name"
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                placeholder="Nhập tên danh sách"
                autoFocus
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              className="w-fit"
              onClick={() => setIsCreating(false)}
            >
              Chọn danh sách đã có
            </Button>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customer-list-assignment">
                Danh sách nhận Lead
              </FieldLabel>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger id="customer-list-assignment" className="w-full">
                  <SelectValue
                    placeholder={
                      listsQuery.isLoading
                        ? "Đang tải danh sách…"
                        : "Chọn danh sách"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(listsQuery.data?.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.customerCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => setIsCreating(true)}
            >
              <ListPlus aria-hidden="true" />
              Tạo danh sách mới
            </Button>
          </FieldGroup>
        )}
        {listsQuery.isError && (
          <p role="alert" className="text-sm text-destructive">
            Không thể tải các danh sách hiện có.
          </p>
        )}
        {assignmentMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {assignmentMutation.error instanceof ApiError
              ? assignmentMutation.error.message
              : assignmentMutation.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={
              assignmentMutation.isPending ||
              leadIds.length === 0 ||
              (!isCreating && !selectedListId)
            }
            onClick={() => assignmentMutation.mutate()}
          >
            {assignmentMutation.isPending ? "Đang gán…" : "Gán vào danh sách"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LeadResultsCardProps = {
  isLayoutLoading: boolean;
  layoutContainerRef: (node: HTMLDivElement | null) => void;
  table: DataTable<LeadListItem>;
  data: LeadListItem[];
  pagination?: LeadListResponse["pagination"];
  page: number;
  pageSize: number;
  queryState: {
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
    errorMessage?: string;
  };
  onReload: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEditLead: (leadId: string) => void;
  canAssignToCustomerList: boolean;
  selectedCount: number;
  onAssignToCustomerList: () => void;
  showSaleActions: boolean;
  canAssignSale: boolean;
  onAssignSale: () => void;
  canDelete: boolean;
  onDelete: () => void;
  onClearSelection: () => void;
};

type LeadBulkActionsMenuProps = Pick<
  LeadResultsCardProps,
  | "canAssignToCustomerList"
  | "selectedCount"
  | "onAssignToCustomerList"
  | "showSaleActions"
  | "canAssignSale"
  | "onAssignSale"
  | "canDelete"
  | "onDelete"
  | "onClearSelection"
>;

function LeadBulkActionsMenu({
  canAssignToCustomerList,
  selectedCount,
  onAssignToCustomerList,
  showSaleActions,
  canAssignSale,
  onAssignSale,
  canDelete,
  onDelete,
  onClearSelection,
}: LeadBulkActionsMenuProps) {
  const selectionLabel = selectedCount > 0 ? ` (${selectedCount})` : "";
  const hasNoSelection = selectedCount === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          Hành động
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          {canAssignSale && (
            <DropdownMenuItem disabled={hasNoSelection} onSelect={onAssignSale}>
              Gán sale{selectionLabel}
            </DropdownMenuItem>
          )}
          {canAssignToCustomerList && (
            <DropdownMenuItem
              disabled={hasNoSelection}
              onSelect={onAssignToCustomerList}
            >
              Gán vào danh sách{selectionLabel}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              disabled={hasNoSelection}
              variant="destructive"
              onSelect={onDelete}
            >
              Xóa hàng loạt{selectionLabel}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled>Cập nhật hàng loạt</DropdownMenuItem>
          {showSaleActions && (
            <DropdownMenuItem
              disabled={hasNoSelection}
              onSelect={onClearSelection}
            >
              Hủy chọn{selectionLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadResultsCard({
  isLayoutLoading,
  layoutContainerRef,
  table,
  data,
  pagination,
  page,
  pageSize,
  queryState,
  onReload,
  onPageChange,
  onPageSizeChange,
  onEditLead,
  canAssignToCustomerList,
  selectedCount,
  onAssignToCustomerList,
  showSaleActions,
  canAssignSale,
  onAssignSale,
  canDelete,
  onDelete,
  onClearSelection,
}: LeadResultsCardProps) {
  const { isLoading: isDataLoading, isError, isFetching, errorMessage } = queryState;
  const isLoading = isDataLoading || isLayoutLoading;
  return (
    <Card ref={layoutContainerRef} className="isolate gap-0 overflow-clip border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Thông tin lead</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị đầy đủ thông tin hồ sơ của ${data.length} trong tổng số ${pagination.total} lead. Kéo ngang để xem thêm trường.`
            : "Đang lấy dữ liệu lead…"}
        </CardDescription>
        <CardAction>
          <LeadBulkActionsMenu
            canAssignToCustomerList={canAssignToCustomerList}
            selectedCount={selectedCount}
            onAssignToCustomerList={onAssignToCustomerList}
            showSaleActions={showSaleActions}
            canAssignSale={canAssignSale}
            onAssignSale={onAssignSale}
            canDelete={canDelete}
            onDelete={onDelete}
            onClearSelection={onClearSelection}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải danh sách lead"
            description={errorMessage ?? "Vui lòng kiểm tra kết nối hoặc thử tải lại dữ liệu."}
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải danh sách lead" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có lead trong phạm vi hiển thị"
            description="Danh sách sẽ cập nhật khi lead được tạo hoặc phân công cho bạn."
          />
        ) : (
          <LeadListTable table={table} onEditLead={onEditLead} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <DataPagination
          pagination={{
            page: pagination.page,
            totalPages: pagination.totalPages,
            total: pagination.total,
            limit: pagination.limit,
          }}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          isFetching={isFetching}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </Card>
  );
}

function EditLeadHeader({ lead }: { lead?: LeadDetail }) {
  return (
    <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14 lg:[zoom:0.9]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <DialogTitle>{lead?.fullName ?? "Chi tiết Lead"}</DialogTitle>
          <DialogDescription>
            {lead
              ? `${lead.leadCode ?? "Chưa có mã Lead"} · Tạo ngày ${formatDate(lead.createdAt)}`
              : "Thông tin hồ sơ và lịch sử xử lý Lead."}
          </DialogDescription>
        </div>
        {lead && (
          <Button asChild type="button" size="sm" variant="outline">
            <Link to={`/sale/leads/${lead.id}`}>
              <ExternalLink aria-hidden="true" />
              Mở trang chi tiết
            </Link>
          </Button>
        )}
      </div>
    </DialogHeader>
  );
}
function EditLeadContent({
  lead,
  options,
  fallbackStages,
  stagesLoading,
  stagesLoadError,
  canUpdate,
  isOpen,
  transition,
  canNote,
  canFile,
  accessToken,
}: Pick<
  EditLeadDialogProps,
  | "options"
  | "fallbackStages"
  | "stagesLoading"
  | "stagesLoadError"
  | "canUpdate"
  | "isOpen"
> & {
  lead: LeadDetail;
  transition: ReturnType<typeof useLeadWorkflowTransition>;
  canNote: boolean;
  canFile: boolean;
  accessToken: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:[zoom:0.9]">
      <LeadOpenInitialization key={lead.id} lead={lead} isOpen={isOpen} />
      <PipelineProgressCard
        lead={lead}
        options={options}
        fallbackStages={fallbackStages}
        onStageChange={canUpdate ? transition.changeStage : undefined}
        onStatusChange={canUpdate ? transition.changeStatus : undefined}
        isChanging={transition.isPending}
        isLoading={stagesLoading}
        hasLoadError={stagesLoadError}
      />
      {transition.dialog}
      {transition.error && (
        <p role="alert" className="-mt-4 text-sm text-destructive">
          {transition.error.message}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.48fr)]">
        <aside className="flex min-w-0 flex-col gap-6">
          <LeadDetailLayout lead={lead} enabled canUpdate={canUpdate} options={options}>
          <InlineLeadSummaryCard
            lead={lead}
            options={options}
            canUpdate={canUpdate}
          />
          </LeadDetailLayout>
          <SourceOccurrencesCard lead={lead} />
          <LeadCustomFieldsCard leadId={lead.id} />
        </aside>
        <ActivityWorkspace
          lead={lead}
          canNote={canNote}
          canFile={canFile}
          accessToken={accessToken}
        />
      </div>
    </div>
  );
}

type LeadEditDialogControllerProps = {
  editingLeadId: string | null;
  isEditDialogOpen: boolean;
  actionOptionsQuery: UseQueryResult<LeadActionOptions>;
  optionsQuery: UseQueryResult<LeadFilterOptions>;
  canUpdate: boolean;
  setViewState: Dispatch<
    SetStateAction<{
      page: number;
      pageSize: number;
      editingLeadId: string | null;
      isEditDialogOpen: boolean;
    }>
  >;
};

function LeadEditDialogController({
  editingLeadId,
  isEditDialogOpen,
  actionOptionsQuery,
  optionsQuery,
  canUpdate,
  setViewState,
}: LeadEditDialogControllerProps) {
  const auth = useAuth();
  const editingLeadQuery = useQuery({
    queryKey: ["leads", "detail", editingLeadId],
    queryFn: () => getLead(editingLeadId!, auth.accessToken!),
    enabled: Boolean(editingLeadId),
  });
  return (
    <EditLeadDialog
      isOpen={isEditDialogOpen}
      lead={editingLeadQuery.data?.data}
      options={actionOptionsQuery.data}
      fallbackStages={optionsQuery.data?.stages}
      stagesLoading={
        (actionOptionsQuery.data?.stages.length ?? 0) === 0 &&
        (optionsQuery.data?.stages.length ?? 0) === 0 &&
        (actionOptionsQuery.isPending || optionsQuery.isPending)
      }
      stagesLoadError={actionOptionsQuery.isError && optionsQuery.isError}
      canUpdate={canUpdate}
      status={
        editingLeadQuery.isPending
          ? "loading"
          : editingLeadQuery.isError
            ? "error"
            : "ready"
      }
      onOpenChange={(open) => {
        if (!open) {
          setViewState((current) => ({ ...current, isEditDialogOpen: false }));
        }
      }}
      onAfterClose={() => {
        setViewState((current) =>
          current.isEditDialogOpen
            ? current
            : { ...current, editingLeadId: null },
        );
      }}
    />
  );
}

function updateLeadSorting(
  current: SortingState,
  updater: SortingState | ((state: SortingState) => SortingState),
): SortingState {
  const next = typeof updater === "function" ? updater(current) : updater;
  return next.length > 0 ? next.slice(0, 1) : [{ id: "createdAt", desc: true }];
}
