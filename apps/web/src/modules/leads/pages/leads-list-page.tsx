import { useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Eye, FileSpreadsheet, ListPlus, Plus, Search, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { addLeadsToCustomerList, createCustomerList, getCustomerListLeads, getCustomerLists } from "@/services/customer-list.service";
import { createLead, getLead, getLeadActionOptions, getLeadFilterOptions, getLeads, importLeads, updateLead, updateLeadCustomFields } from "@/services/lead.service";
import { LeadForm, LeadProgressSelector } from "../components/lead-form";
import { toLeadFormOptions, toLeadFormValues } from "../lead-form.helpers";
import { emptyLeadForm } from "../lead.schema";
import type {
  LeadActionOptions,
  LeadDetail,
  LeadFilterOptions,
  LeadFormInput,
  LeadImportResult,
  LeadListFilters,
  LeadListItem,
  LeadListResponse,
  LeadSortField,
} from "../lead.types";

const pageSize = 20;
const sortableColumns = new Set<LeadSortField>(["createdAt", "fullName", "leadCode", "pipelineStage"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const emptyFilters: LeadListFilters = {
  search: "",
  pipelineStageId: "",
  sourceId: "",
  assigneeId: "",
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

function getLeadWorkflowLabel(lead: LeadListItem) {
  return lead.pipelineStage?.name ?? "Chưa chọn tiến trình";
}

const leadInformationFields: Array<{
  key: keyof LeadListItem;
  label: string;
  format?: (value: string | null) => string;
}> = [
  { key: "email", label: "Email" },
  { key: "birthPlace", label: "Nơi sinh" },
  { key: "specificAddress", label: "Địa chỉ cụ thể" },
  { key: "cccd", label: "CCCD" },
  { key: "cccdIssueDate", label: "Ngày cấp CCCD", format: formatDate },
  { key: "cccdIssuePlace", label: "Nơi cấp CCCD" },
  { key: "ethnicity", label: "Dân tộc" },
  { key: "religion", label: "Tôn giáo" },
  { key: "nationality", label: "Quốc tịch" },
  { key: "graduationYear", label: "Năm tốt nghiệp" },
  { key: "graduationCertificate", label: "Bằng tốt nghiệp" },
  { key: "previousGraduationCertificate", label: "Bằng tốt nghiệp cũ" },
  { key: "graduationMajor", label: "Ngành tốt nghiệp" },
  { key: "graduationRank", label: "Xếp loại TN" },
  { key: "diplomaIssuePlace", label: "Nơi cấp bằng" },
  { key: "academicRank12", label: "Học lực lớp 12" },
  { key: "conductRank12", label: "Hạnh kiểm lớp 12" },
  { key: "highSchoolName", label: "Trường THPT" },
  { key: "highSchoolDistrict", label: "Quận/huyện THPT" },
  { key: "highSchoolProvince", label: "Tỉnh/TP THPT" },
  { key: "hamlet", label: "Ấp/Thôn" },
  { key: "ward", label: "Xã/Phường" },
  { key: "district", label: "Thị xã/Huyện" },
  { key: "province", label: "Tỉnh/Thành phố" },
  { key: "currentAddress", label: "Địa chỉ hiện nay" },
  { key: "permanentAddress", label: "Địa chỉ thường trú" },
  { key: "currentResidence", label: "Nơi ở hiện tại" },
  { key: "currentJob", label: "Công việc hiện nay" },
  { key: "companyName", label: "Cơ quan công tác" },
  { key: "relative1FullName", label: "Người thân 1" },
  { key: "relative1Relationship", label: "Quan hệ 1" },
  { key: "relative1Phone", label: "Điện thoại 1" },
  { key: "relative1Job", label: "Nghề nghiệp 1" },
  { key: "relative1Address", label: "Địa chỉ 1" },
  { key: "relative2FullName", label: "Người thân 2" },
  { key: "relative2Relationship", label: "Quan hệ 2" },
  { key: "relative2Phone", label: "Điện thoại 2" },
  { key: "relative2Job", label: "Nghề nghiệp 2" },
  { key: "relative2Address", label: "Địa chỉ 2" },
  { key: "admissionStatusName", label: "Trạng thái hồ sơ" },
  { key: "trainingCode", label: "Mã ĐT" },
  { key: "classCode", label: "Mã lớp" },
  { key: "subjectGroupCode", label: "Mã tổ hợp môn" },
  { key: "subjectGroupName", label: "Tên tổ hợp môn" },
  { key: "score1", label: "Điểm TH1" },
  { key: "score2", label: "Điểm TH2" },
  { key: "score3", label: "Điểm TH3" },
  { key: "admissionScore", label: "Điểm XT" },
  { key: "enrollmentBatch", label: "Đợt khai giảng" },
  { key: "registrationStation", label: "Trạm đăng ký" },
  { key: "decisionNumber", label: "Số quyết định" },
  { key: "decisionSignedDate", label: "Ngày ký quyết định", format: formatDate },
  { key: "monthlyRevenue", label: "Doanh số tháng" },
  { key: "temperature", label: "Mức độ quan tâm" },
  { key: "gclid", label: "Gclid" },
  { key: "tags", label: "Tags" },
  { key: "note", label: "Ghi chú" },
];

function TableValue({ value }: { value: unknown }) {
  const text = typeof value === "string" && value.trim() ? value : "-";
  return <span className="block max-w-56 truncate" title={text === "-" ? undefined : text}>{text}</span>;
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
    <Dialog onOpenChange={(open) => {
      if (open) {
        setFile(null);
        setFileError(null);
        onReset();
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Upload data-icon="inline-start" aria-hidden="true" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import lead từ Excel</DialogTitle>
          <DialogDescription>
            Chỉ cần các cột bắt buộc; không cần tạo đủ tất cả trường của form lead.
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
                Dùng đúng tên cột: <code className="font-medium text-foreground">fullName</code>,{" "}
                <code className="font-medium text-foreground">phone</code> và{" "}
                <code className="font-medium text-foreground">sourceName</code> hoặc{" "}
                <code className="font-medium text-foreground">sourceId</code>.
              </p>
            </div>
            <div>
              <p className="font-medium">Chương trình tuyển sinh</p>
              <p className="mt-1 text-muted-foreground">
                Hệ thống dùng chương trình đang làm việc. Nếu chưa chọn chương trình, file cần thêm
                <code className="ml-1 font-medium text-foreground">institutionProgramId</code>,{" "}
                <code className="font-medium text-foreground">programCode</code> hoặc{" "}
                <code className="font-medium text-foreground">programName</code>.
              </p>
            </div>
            <p className="text-muted-foreground">
              Các cột như email, pipelineStageId, note, gender và dateOfBirth là tùy chọn, có thể bỏ hoàn toàn.
            </p>
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
              Hỗ trợ tối đa 1.000 dòng và dung lượng 5MB. Các dòng lỗi sẽ được bỏ qua và hiển thị lý do.
            </p>
            {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error instanceof ApiError ? error.message : "Không thể import lead. Vui lòng kiểm tra file và thử lại."}
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
  if (!/\.(xlsx|xls)$/i.test(file.name)) return "Vui lòng chọn file Excel có định dạng .xlsx hoặc .xls.";
  if (file.size > 5 * 1024 * 1024) return "File Excel không được vượt quá 5MB.";
  return null;
}

function LeadImportResultPanel({ result }: { result: LeadImportResult }) {
  return (
    <div className="grid gap-4 rounded-md border bg-muted/20 p-4" role="status">
      <div className="grid gap-3 sm:grid-cols-3">
        <ImportMetric label="Tổng dòng" value={result.totalRows} />
        <ImportMetric label="Đã import" value={result.importedRows} />
        <ImportMetric label="Lỗi" value={result.failedRows} />
      </div>
      {result.errors.length > 0 && (
        <div className="overflow-hidden rounded-md border bg-background">
          <Table>
            <TableHeader className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="w-20 px-4">Dòng</TableHead>
                <TableHead>Ứng viên</TableHead>
                <TableHead>SĐT</TableHead>
                <TableHead className="px-4">Lý do</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.slice(0, 20).map((item) => (
                <TableRow key={`${item.row}-${item.phone ?? item.message}`}>
                  <TableCell className="px-4 tabular-nums">{item.row}</TableCell>
                  <TableCell>{item.fullName ?? "-"}</TableCell>
                  <TableCell>{item.phone ?? "-"}</TableCell>
                  <TableCell className="px-4">{item.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.errors.length > 20 && (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">
              Chỉ hiển thị 20 lỗi đầu tiên. Vui lòng sửa file rồi import lại.
            </p>
          )}
        </div>
      )}
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
  eyebrow?: string;
  title?: string;
  description?: string;
  detailBasePath?: string;
  customerListId?: string;
  enableCustomerListAssignment?: boolean;
  showLeadCreationActions?: boolean;
};

export function LeadsListPage({
  eyebrow = "CRM Sale",
  title = "Danh sách lead",
  description = "Dữ liệu hiển thị trong phạm vi được phân quyền và phân công cho tài khoản của bạn.",
  detailBasePath = "/sale/leads",
  customerListId,
  enableCustomerListAssignment = false,
  showLeadCreationActions = true,
}: LeadsListPageProps = {}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = showLeadCreationActions && auth.can("lead.create");
  const [partialCreateLeadId, setPartialCreateLeadId] = useState<string | null>(null);
  const canUpdate = ["lead.update_all", "lead.update_department", "lead.update_assigned"].some(auth.can);
  const [{ page, editingLeadId, isEditDialogOpen }, setViewState] = useState<{
    page: number;
    editingLeadId: string | null;
    isEditDialogOpen: boolean;
  }>({
    page: 1,
    editingLeadId: null,
    isEditDialogOpen: false,
  });
  const [draftFilters, setDraftFilters] = useState<LeadListFilters>(emptyFilters);
  const [filters, setFilters] = useState<LeadListFilters>(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const primarySort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(primarySort.id as LeadSortField)
    ? (primarySort.id as LeadSortField)
    : "createdAt";
  const sortOrder = primarySort.desc ? "desc" : "asc";
  const leadsQuery = useQuery({
    queryKey: customerListId
      ? ["customer-lists", "leads", customerListId, page, pageSize, sortBy, sortOrder, filters]
      : ["leads", "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () =>
      customerListId
        ? getCustomerListLeads(customerListId, { page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!)
        : getLeads({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["leads", "options"],
    queryFn: () => getLeadFilterOptions(auth.accessToken!),
  });
  const customerListCapabilityQuery = useQuery({
    queryKey: ["customer-lists", "capabilities"],
    queryFn: () => getCustomerLists({ page: 1, limit: 1 }, auth.accessToken!),
    enabled: enableCustomerListAssignment
      && (auth.can("customer_list.view_all") || auth.can("customer_list.manage")),
  });
  const actionOptionsQuery = useQuery({
    queryKey: ["leads", "action-options"],
    queryFn: () => getLeadActionOptions(auth.accessToken!),
    enabled: canCreate || canUpdate,
  });
  const createMutation = useMutation({
    mutationFn: async (input: LeadFormInput) => {
      const createdLead = await createLead(input, auth.accessToken!);
      setPartialCreateLeadId(createdLead.id);
      const values = Object.entries(input.customFieldValues).map(([fieldId, value]) => ({ fieldId, value }));
      if (values.length > 0) await updateLeadCustomFields(createdLead.id, { values }, auth.accessToken!);
      return createdLead;
    },
    onSuccess: (createdLead) => {
      setPartialCreateLeadId(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      navigate(`${detailBasePath}/${createdLead.id}`);
    },
  });
  const importMutation = useMutation({
    mutationFn: (file: File) => importLeads(file, auth.accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
    },
  });
  const editingLeadQuery = useQuery({
    queryKey: ["leads", "detail", editingLeadId],
    queryFn: () => getLead(editingLeadId!, auth.accessToken!),
    enabled: canUpdate && Boolean(editingLeadId),
  });
  const updateMutation = useMutation({
    mutationFn: async (input: LeadFormInput) => {
      const result = await updateLead(editingLeadId!, input, auth.accessToken!);
      const values = Object.entries(input.customFieldValues).map(([fieldId, value]) => ({ fieldId, value }));
      if (values.length > 0) await updateLeadCustomFields(editingLeadId!, { values }, auth.accessToken!);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      setViewState((current) => ({ ...current, isEditDialogOpen: false }));
    },
  });
  const data = leadsQuery.data?.data ?? [];
  const pagination = leadsQuery.data?.pagination;

  const columns = useMemo<ColumnDef<LeadListItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Chọn tất cả lead trên trang này"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={`Chọn lead ${row.original.fullName}`}
          />
        ),
        enableSorting: false,
      },
      {
        id: "view",
        header: () => <span className="sr-only">Xem chi tiết</span>,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon" className="size-9 shrink-0">
            <Link
              to={`${detailBasePath}/${row.original.id}`}
              aria-label={`Xem chi tiết ${row.original.fullName}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Eye aria-hidden="true" />
            </Link>
          </Button>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "fullName",
        header: "Họ và tên",
        cell: ({ row }) => (
          <div className="min-w-56">
            <span className="font-medium">{row.original.fullName}</span>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Số điện thoại",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.phone} />,
      },
      {
        id: "pipelineStage",
        header: "Quy trình Telesale",
        cell: ({ row }) => <Badge variant="secondary">{getLeadWorkflowLabel(row.original)}</Badge>,
      },
      {
        id: "source",
        header: "Nguồn HV",
        enableSorting: false,
        cell: ({ row }) => row.original.source?.name ?? "-",
      },
      {
        id: "assignee",
        header: "Nhân viên sale",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.assignee?.fullName} />,
      },
      {
        accessorKey: "gender",
        header: "Giới tính",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.gender} />,
      },
      {
        accessorKey: "dateOfBirth",
        header: "Ngày sinh",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={formatDate(row.original.dateOfBirth)} />,
      },
      {
        accessorKey: "majorName",
        header: "Ngành đăng ký",
        enableSorting: false,
        cell: ({ row }) => <TableValue value={row.original.majorName} />,
      },
      ...leadInformationFields.map(({ key, label, format }) => ({
        id: key,
        header: label,
        enableSorting: false,
        cell: ({ row }: { row: { original: LeadListItem } }) => (
          <TableValue value={format ? format((row.original[key] as string | null) ?? null) : row.original[key]} />
        ),
      })),
    ],
    [detailBasePath],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    getRowId: (row) => row.id,
    manualSorting: true,
    enableMultiSort: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length > 0 ? next.slice(0, 1) : [{ id: "createdAt", desc: true }];
      });
      setViewState((current) => ({ ...current, page: 1 }));
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-400 flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        scopeLabel="Theo phạm vi truy cập"
        description={description}
        actions={canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
          <LeadImportDialog
            isPending={importMutation.isPending}
            error={importMutation.error}
            result={importMutation.data}
            onReset={() => importMutation.reset()}
            onImport={(file) => importMutation.mutate(file)}
          />
          <Dialog onOpenChange={(open) => { if (open) { createMutation.reset(); setPartialCreateLeadId(null); } }}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus data-icon="inline-start" aria-hidden="true" />
                Thêm ứng viên
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-368">
              <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
                <DialogTitle>Thêm thông tin ứng viên</DialogTitle>
                <DialogDescription>
                  Nhập thông tin cơ bản trước; có thể bổ sung học vấn, hồ sơ tuyển sinh và người thân ngay trong lần tạo.
                </DialogDescription>
              </DialogHeader>
              {createMutation.isError && (
                <p role="alert" className="mx-6 mt-4 text-sm text-destructive">
                  {createMutation.error instanceof ApiError ? createMutation.error.message : "Không thể tạo lead. Vui lòng thử lại."}
                </p>
              )}
              {partialCreateLeadId && createMutation.isError && <p className="mx-6 mt-2 text-sm text-muted-foreground">Lead đã được tạo nhưng thông tin bổ sung chưa lưu. <Link className="font-medium text-primary underline" to={`${detailBasePath}/${partialCreateLeadId}`}>Mở lead để lưu lại</Link>.</p>}
              {actionOptionsQuery.isLoading ? (
                <p role="status" className="px-6 py-5 text-sm text-muted-foreground">
                  Đang tải thông tin tạo lead…
                </p>
              ) : actionOptionsQuery.isError ? (
                <p role="alert" className="px-6 py-5 text-sm text-destructive">
                  Không thể tải nguồn lead. Vui lòng đóng cửa sổ và thử lại.
                </p>
              ) : (
                <LeadForm
                  defaultValues={emptyLeadForm}
                  options={{
                    sources: actionOptionsQuery.data?.sources ?? [],
                    stages: actionOptionsQuery.data?.stages ?? [],
                    telesales: actionOptionsQuery.data?.telesales ?? [],
                    institutionPrograms: actionOptionsQuery.data?.institutionPrograms ?? [],
                    majors: actionOptionsQuery.data?.majors ?? [],
                    admissionStatuses: actionOptionsQuery.data?.admissionStatuses ?? [],
                    tags: actionOptionsQuery.data?.tags ?? [],
                  }}
                  submitLabel="Lưu ứng viên"
                  isPending={createMutation.isPending}
                  dialogLayout
                  onSubmit={(values) => createMutation.mutate(values)}
                />
              )}
            </DialogContent>
          </Dialog>
          </div>
        ) : undefined}
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Tiến trình</CardTitle>
          <CardDescription>Chọn một bước để lọc danh sách lead đang ở tiến trình đó.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <LeadProgressSelector
            value={filters.pipelineStageId}
            stages={optionsQuery.data?.stages ?? []}
            allOptionLabel="Tất cả"
            allOptionCount={optionsQuery.data?.totalLeads ?? 0}
            singleRowDesktop
            onChange={(pipelineStageId) => {
              setDraftFilters((current) => ({ ...current, pipelineStageId }));
              setFilters((current) => ({ ...current, pipelineStageId }));
              setViewState((current) => ({ ...current, page: 1 }));
            }}
          />
        </CardContent>
      </Card>

      <LeadFiltersCard
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
        onApply={() => {
          setFilters(draftFilters);
          setViewState((current) => ({ ...current, page: 1 }));
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setViewState((current) => ({ ...current, page: 1 }));
        }}
      />
      <LeadResultsCard
        table={table}
        data={data}
        pagination={pagination}
        page={page}
        queryState={{
          isLoading: leadsQuery.isLoading,
          isError: leadsQuery.isError,
          isFetching: leadsQuery.isFetching,
        }}
        onReload={() => leadsQuery.refetch()}
        onPrevious={() => setViewState((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
        onNext={() => setViewState((current) => ({ ...current, page: current.page + 1 }))}
        canEdit={canUpdate}
        onEditLead={(leadId) => {
          updateMutation.reset();
          setViewState((current) => ({ ...current, editingLeadId: leadId, isEditDialogOpen: true }));
        }}
        canAssignToCustomerList={enableCustomerListAssignment && (
          customerListCapabilityQuery.data?.capabilities.canManage
          ?? auth.can("customer_list.manage")
        )}
        selectedCount={Object.keys(rowSelection).length}
        onAssignToCustomerList={() => setAssignmentOpen(true)}
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
      <EditLeadDialog
        isOpen={isEditDialogOpen}
        lead={editingLeadQuery.data?.data}
        options={actionOptionsQuery.data}
        status={
          editingLeadQuery.isPending || actionOptionsQuery.isPending
            ? "loading"
            : editingLeadQuery.isError || actionOptionsQuery.isError
              ? "error"
              : "ready"
        }
        isSaving={updateMutation.isPending}
        mutationError={updateMutation.error}
        onOpenChange={(open) => {
          if (!open) {
            setViewState((current) => ({ ...current, isEditDialogOpen: false }));
            updateMutation.reset();
          }
        }}
        onAfterClose={() => {
          setViewState((current) => current.isEditDialogOpen
            ? current
            : { ...current, editingLeadId: null });
        }}
        onSubmit={(values) => updateMutation.mutate(values)}
      />
    </div>
  );
}

type EditLeadDialogProps = {
  isOpen: boolean;
  lead?: LeadDetail;
  options?: LeadActionOptions;
  status: "loading" | "error" | "ready";
  isSaving: boolean;
  mutationError: Error | null;
  onOpenChange: (open: boolean) => void;
  onAfterClose: () => void;
  onSubmit: (values: LeadFormInput) => void;
};

function EditLeadDialog({
  isOpen,
  lead,
  options,
  status,
  isSaving,
  mutationError,
  onOpenChange,
  onAfterClose,
  onSubmit,
}: EditLeadDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-368"
        onCloseAutoFocus={onAfterClose}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
          <DialogTitle>Chỉnh sửa thông tin ứng viên</DialogTitle>
          <DialogDescription>
            Cập nhật hồ sơ, tiến trình và thông tin tuyển sinh của ứng viên.
          </DialogDescription>
        </DialogHeader>
        {mutationError && (
          <p role="alert" className="mx-6 mt-4 text-sm text-destructive">
            {mutationError instanceof ApiError ? mutationError.message : "Không thể lưu thay đổi. Vui lòng thử lại."}
          </p>
        )}
        {status === "loading" ? (
          <p role="status" className="px-6 py-5 text-sm text-muted-foreground">Đang tải thông tin ứng viên…</p>
        ) : status === "error" || !lead || !options ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            Không thể tải thông tin ứng viên. Vui lòng đóng cửa sổ và thử lại.
          </p>
        ) : (
          <LeadForm
            defaultValues={toLeadFormValues(lead)}
            options={toLeadFormOptions(lead, options)}
            leadId={lead.id}
            submitLabel="Lưu thay đổi"
            isPending={isSaving}
            dialogLayout
            onSubmit={onSubmit}
          />
        )}
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
        if (newListName.trim().length < 2) throw new Error("Tên danh sách phải có ít nhất 2 ký tự.");
        const created = await createCustomerList({ name: newListName.trim() }, auth.accessToken!);
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
          <DialogDescription>Đã chọn {leadIds.length} Lead. Các Lead đã có trong danh sách sẽ không bị thêm trùng.</DialogDescription>
        </DialogHeader>
        {isCreating ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-customer-list-name">Tên danh sách mới</FieldLabel>
              <Input id="new-customer-list-name" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Nhập tên danh sách" autoFocus />
            </Field>
            <Button type="button" variant="ghost" className="w-fit" onClick={() => setIsCreating(false)}>Chọn danh sách đã có</Button>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customer-list-assignment">Danh sách nhận Lead</FieldLabel>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger id="customer-list-assignment" className="w-full"><SelectValue placeholder={listsQuery.isLoading ? "Đang tải danh sách…" : "Chọn danh sách"} /></SelectTrigger>
                <SelectContent>{(listsQuery.data?.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.customerCount})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Button type="button" variant="outline" className="w-fit" onClick={() => setIsCreating(true)}><ListPlus aria-hidden="true" />Tạo danh sách mới</Button>
          </FieldGroup>
        )}
        {listsQuery.isError && <p role="alert" className="text-sm text-destructive">Không thể tải các danh sách hiện có.</p>}
        {assignmentMutation.isError && <p role="alert" className="text-sm text-destructive">{assignmentMutation.error instanceof ApiError ? assignmentMutation.error.message : assignmentMutation.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="button" disabled={assignmentMutation.isPending || leadIds.length === 0 || (!isCreating && !selectedListId)} onClick={() => assignmentMutation.mutate()}>{assignmentMutation.isPending ? "Đang gán…" : "Gán vào danh sách"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LeadFiltersCardProps = {
  filters: LeadListFilters;
  options?: LeadFilterOptions;
  onChange: (field: keyof LeadListFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function LeadFiltersCard({ filters, options, onChange, onApply, onReset }: LeadFiltersCardProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc</CardTitle>
        <CardDescription>Tìm theo mã hoặc họ tên; lọc danh sách trong phạm vi được xem.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(150px,1fr))_auto]">
          <Field className="gap-2">
            <FieldLabel htmlFor="lead-search">Tìm kiếm</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="lead-search"
                className="pl-9"
                value={filters.search}
                placeholder="Nhập mã lead hoặc họ tên"
                onChange={(event) => onChange("search", event.target.value)}
              />
            </div>
          </Field>
          <FilterSelect
            id="lead-pipeline-stage"
            label="Quy trình"
            value={filters.pipelineStageId}
            onChange={(value) => onChange("pipelineStageId", value)}
            options={(options?.stages ?? []).map((stage) => ({
              value: stage.id,
              label: stage.name,
            }))}
          />
          <FilterSelect
            id="lead-source"
            label="Nguồn lead"
            value={filters.sourceId}
            onChange={(value) => onChange("sourceId", value)}
            options={(options?.sources ?? []).map((source) => ({
              value: source.id,
              label: source.name,
            }))}
          />
          <FilterSelect
            id="lead-assignee"
            label="Nhân viên"
            value={filters.assigneeId}
            onChange={(value) => onChange("assigneeId", value)}
            options={(options?.assignees ?? []).map((assignee) => ({
              value: assignee.id,
              label: assignee.fullName,
            }))}
          />
          <div className="flex items-end gap-2">
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={onReset}>
              Xóa lọc
            </Button>
          </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type LeadResultsCardProps = {
  table: DataTable<LeadListItem>;
  data: LeadListItem[];
  pagination?: LeadListResponse["pagination"];
  page: number;
  queryState: {
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
  };
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
  canEdit: boolean;
  onEditLead: (leadId: string) => void;
  canAssignToCustomerList: boolean;
  selectedCount: number;
  onAssignToCustomerList: () => void;
};

function LeadResultsCard({
  table,
  data,
  pagination,
  page,
  queryState,
  onReload,
  onPrevious,
  onNext,
  canEdit,
  onEditLead,
  canAssignToCustomerList,
  selectedCount,
  onAssignToCustomerList,
}: LeadResultsCardProps) {
  const { isLoading, isError, isFetching } = queryState;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="border-b py-5">
        <CardTitle>Thông tin lead</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị đầy đủ thông tin hồ sơ của ${data.length} trong tổng số ${pagination.total} lead. Kéo ngang để xem thêm trường.`
            : "Đang lấy dữ liệu lead…"}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                Hành động
                <ChevronDown data-icon="inline-end" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled>Gán sale</DropdownMenuItem>
                <DropdownMenuItem disabled={!canAssignToCustomerList || selectedCount === 0} onSelect={onAssignToCustomerList}>
                  Gán vào danh sách{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem disabled variant="destructive">Xóa hàng loạt</DropdownMenuItem>
                <DropdownMenuItem disabled>Cập nhật hàng loạt</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải danh sách lead"
            description="Vui lòng kiểm tra kết nối hoặc thử tải lại dữ liệu."
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
          <LeadTable table={table} canEdit={canEdit} onEditLead={onEditLead} />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
          <p className="text-muted-foreground">
            Trang {pagination.page} / {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}>
              <ChevronLeft aria-hidden="true" />
              Trang trước
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>
              Trang sau
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function LeadTable({
  table,
  canEdit,
  onEditLead,
}: {
  table: DataTable<LeadListItem>;
  canEdit: boolean;
  onEditLead: (leadId: string) => void;
}) {
  function openLeadWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, leadId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEditLead(leadId);
    }
  }

  return (
      <Table className="min-w-max">
        <caption className="sr-only">Toàn bộ trường thông tin lead được phép truy cập</caption>
        <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-muted/55">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                const isSelectColumn = header.column.id === "select";
                const isViewColumn = header.column.id === "view";
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={
                      isSelectColumn
                        ? "sticky left-0 z-20 w-12 min-w-12 max-w-12 bg-muted px-4 text-center"
                        : isViewColumn
                          ? "sticky left-12 z-20 w-14 min-w-14 max-w-14 border-r bg-muted px-2 text-center"
                          : "px-5 font-medium text-muted-foreground"
                    }
                    aria-sort={
                      sortDirection === "asc"
                        ? "ascending"
                        : sortDirection === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sắp xếp theo ${String(header.column.columnDef.header)}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDirection === "asc" ? (
                        <ArrowUp aria-hidden="true" />
                        ) : sortDirection === "desc" ? (
                          <ArrowDown aria-hidden="true" />
                        ) : (
                          <ArrowUpDown aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={canEdit ? "group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : "group"}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? `Chỉnh sửa thông tin ${row.original.fullName}` : undefined}
              onClick={canEdit ? () => onEditLead(row.original.id) : undefined}
              onKeyDown={canEdit ? (event) => openLeadWithKeyboard(event, row.original.id) : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const isSelectColumn = cell.column.id === "select";
                const isViewColumn = cell.column.id === "view";
                return (
                  <TableCell
                    key={cell.id}
                    className={
                      isSelectColumn
                        ? "sticky left-0 z-10 w-12 min-w-12 max-w-12 bg-background px-4 py-4 text-center group-hover:bg-muted group-data-[state=selected]:bg-muted"
                        : isViewColumn
                          ? "sticky left-12 z-10 w-14 min-w-14 max-w-14 border-r bg-background px-2 py-4 text-center group-hover:bg-muted group-data-[state=selected]:bg-muted"
                          : "px-5 py-4"
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );
}
