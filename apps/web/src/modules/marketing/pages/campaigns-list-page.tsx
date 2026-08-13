import { useEffect, useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import { createCampaign, deleteCampaign, getCampaignFilterOptions, getCampaigns, updateCampaign } from "@/services/campaign.service";
import type {
  CampaignFilterOptions,
  CampaignInput,
  CampaignListFilters,
  CampaignListItem,
  CampaignListResponse,
  CampaignSortField,
} from "../campaign.types";

const pageSize = 20;
const emptyFilters: CampaignListFilters = { search: "", status: "", type: "" };
const emptyCampaignForm: CampaignInput = {
  name: "",
  type: "",
  status: "planning",
  startDate: "",
  endDate: "",
  budget: 0,
  institutionProgramId: "",
};
const campaignFormSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập tên chiến dịch.").max(255, "Tên chiến dịch tối đa 255 ký tự."),
  type: z.string().trim().max(100, "Loại chiến dịch tối đa 100 ký tự."),
  status: z.enum(["planning", "active", "paused", "completed"]),
  startDate: z.string(),
  endDate: z.string(),
  budget: z.number().min(0, "Ngân sách không được âm.").max(1_000_000_000_000, "Ngân sách vượt giới hạn cho phép."),
  institutionProgramId: z.string(),
}).refine((input) => !input.startDate || !input.endDate || input.endDate >= input.startDate, {
  path: ["endDate"],
  message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
});
const sortableColumns = new Set<CampaignSortField>(["createdAt", "name", "startDate", "budget"]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const statusLabels: Record<string, string> = {
  active: "Đang chạy",
  planning: "Lập kế hoạch",
  paused: "Tạm dừng",
  completed: "Đã kết thúc",
};
type DialogState =
  | { type: "create" }
  | { type: "edit"; campaign: CampaignListItem }
  | { type: "delete"; campaign: CampaignListItem }
  | null;

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function CampaignsListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { programs, selectedProgramId } = useInstitutionProgram();
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [dialog, setDialog] = useReducer((_current: DialogState, next: DialogState) => next, null);
  const editingCampaign = dialog?.type === "edit" ? dialog.campaign : null;
  const deletingCampaign = dialog?.type === "delete" ? dialog.campaign : null;
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as CampaignSortField)
    ? (selectedSort.id as CampaignSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["campaigns", "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getCampaigns({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["campaigns", "options"],
    queryFn: () => getCampaignFilterOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: CampaignInput) => createCampaign(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: CampaignInput) => updateCampaign(editingCampaign!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCampaign(deletingCampaign!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const canCreate = auth.can("campaign.create");
  const canEdit = (campaign: CampaignListItem) =>
    auth.can("campaign.update") || (auth.can("campaign.update_own") && campaign.creator?.id === auth.user?.id);
  const canDelete = auth.can("campaign.delete");
  const table = useReactTable({
    data,
    columns: useCampaignColumns({
      canEdit,
      canDelete,
      onEdit: (campaign) => { updateMutation.reset(); setDialog({ type: "edit", campaign }); },
      onDelete: (campaign) => { deleteMutation.reset(); setDialog({ type: "delete", campaign }); },
    }),
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
        title="Quản lý chiến dịch"
        scopeLabel={selectedProgram ? `${selectedProgram.institutionName} - ${selectedProgram.name}` : "Phạm vi được cấp"}
        description="Tạo và theo dõi trạng thái, ngân sách cùng hiệu quả chuyển đổi của từng chiến dịch."
        actions={canCreate ? (
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />
            Tạo chiến dịch
          </Button>
        ) : undefined}
      />
      <CampaignFilters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) => setDraftFilters((current) => ({ ...current, [field]: value }))}
        onApply={() => {
          setFilters(draftFilters);
          setPage(1);
        }}
        onReset={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setPage(1);
        }}
      />
      <CampaignResults
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
      <Dialog open={dialog?.type === "create"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo chiến dịch</DialogTitle>
            <DialogDescription>Khai báo thời gian, ngân sách và trạng thái triển khai ban đầu.</DialogDescription>
          </DialogHeader>
          <CampaignForm
            entityId={undefined}
            defaultValues={{ ...emptyCampaignForm, institutionProgramId: selectedProgramId ?? "" }}
            options={optionsQuery.data}
            selectedProgramId={selectedProgramId}
            error={createMutation.error}
            isPending={createMutation.isPending}
            submitLabel="Tạo chiến dịch"
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingCampaign)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa chiến dịch</DialogTitle>
            <DialogDescription>Cập nhật trạng thái thực hiện và ngân sách chiến dịch.</DialogDescription>
          </DialogHeader>
          {editingCampaign && (
            <CampaignForm
              entityId={editingCampaign.id}
              defaultValues={{
                name: editingCampaign.name,
                type: editingCampaign.type ?? "",
                status: (editingCampaign.status as CampaignInput["status"]) ?? "planning",
                startDate: editingCampaign.startDate?.slice(0, 10) ?? "",
                endDate: editingCampaign.endDate?.slice(0, 10) ?? "",
                budget: editingCampaign.budget,
                institutionProgramId: editingCampaign.institutionProgram?.id ?? selectedProgramId ?? "",
              }}
              options={optionsQuery.data}
              selectedProgramId={selectedProgramId}
              error={updateMutation.error}
              isPending={updateMutation.isPending}
              submitLabel="Lưu thay đổi"
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deletingCampaign)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa chiến dịch</DialogTitle>
            <DialogDescription>
              {deletingCampaign ? `Bạn có chắc muốn xóa chiến dịch "${deletingCampaign.name}"? Chiến dịch đã phát sinh biểu mẫu hoặc UTM sẽ được giữ lại.` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa chiến dịch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useCampaignColumns({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: (campaign: CampaignListItem) => boolean;
  canDelete: boolean;
  onEdit: (campaign: CampaignListItem) => void;
  onDelete: (campaign: CampaignListItem) => void;
}) {
  return useMemo<ColumnDef<CampaignListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Chiến dịch",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "type", header: "Loại", enableSorting: false, cell: ({ row }) => row.original.type ?? "-" },
      { id: "institutionProgram", header: "Chương trình", enableSorting: false, cell: ({ row }) => row.original.institutionProgram ? `${row.original.institutionProgram.institutionName} / ${row.original.institutionProgram.name}` : "-" },
      {
        accessorKey: "status",
        header: "Trạng thái",
        enableSorting: false,
        cell: ({ row }) => <Badge variant="secondary">{displayStatus(row.original.status)}</Badge>,
      },
      {
        accessorKey: "startDate",
        header: "Thời gian",
        cell: ({ row }) => `${formatDate(row.original.startDate)} - ${formatDate(row.original.endDate)}`,
      },
      {
        accessorKey: "budget",
        header: "Ngân sách",
        cell: ({ row }) => currencyFormatter.format(row.original.budget),
      },
      {
        id: "performance",
        header: "Hiệu quả chuyển đổi",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p>{row.original.leadCount} lead / {row.original.applicationCount} hồ sơ / {row.original.enrolledStudentCount} SV</p>
            <p className="text-muted-foreground">{row.original.conversionRate}% vào hồ sơ · {row.original.leadCount ? currencyFormatter.format(row.original.budget / row.original.leadCount) : "-"} / lead</p>
          </div>
        ),
      },
      {
        id: "creator",
        header: "Người tạo",
        enableSorting: false,
        cell: ({ row }) => row.original.creator?.fullName ?? "-",
      },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-2">
            {canEdit(row.original) && (
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(row.original)} aria-label={`Sửa chiến dịch ${row.original.name}`}>
                <Pencil aria-hidden="true" />
                Sửa
              </Button>
            )}
            {canDelete && (
              <Button type="button" variant="outline" size="sm" onClick={() => onDelete(row.original)} aria-label={`Xóa chiến dịch ${row.original.name}`}>
                <Trash2 aria-hidden="true" />
                Xóa
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDelete, canEdit, onDelete, onEdit],
  );
}

type FilterProps = {
  filters: CampaignListFilters;
  options?: CampaignFilterOptions;
  onChange: (field: keyof CampaignListFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function CampaignFilters({ filters, options, onChange, onApply, onReset }: FilterProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc chiến dịch</CardTitle>
        <CardDescription>Tìm theo tên chiến dịch và lọc theo trạng thái hoặc loại chiến dịch.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(170px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="campaign-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="campaign-search" className="pl-9" placeholder="Nhập tên chiến dịch" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
              </div>
            </Field>
            <FilterSelect id="campaign-status" label="Trạng thái" value={filters.status} onChange={(value) => onChange("status", value)} options={(options?.statuses ?? []).map((status) => ({ value: status, label: displayStatus(status) }))} />
            <FilterSelect id="campaign-type" label="Loại chiến dịch" value={filters.type} onChange={(value) => onChange("type", value)} options={(options?.types ?? []).map((type) => ({ value: type, label: type }))} />
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

type ResultsProps = {
  table: DataTable<CampaignListItem>;
  data: CampaignListItem[];
  pagination?: CampaignListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function CampaignResults(props: ResultsProps) {
  const { table, data, pagination, page, isLoading, isError, isFetching, onReload, onPrevious, onNext } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Chiến dịch Marketing</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} chiến dịch` : "Đang lấy dữ liệu chiến dịch…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải danh sách chiến dịch" description="Vui lòng thử lại để cập nhật dữ liệu Marketing." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải danh sách chiến dịch" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có chiến dịch phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm chiến dịch cần theo dõi." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
          <p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<CampaignListItem> }) {
  return (
    <Table className="min-w-7xl">
      <caption className="sr-only">Danh sách chiến dịch Marketing</caption>
      <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
        {table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => {
          const direction = header.column.getIsSorted();
          return <TableHead key={header.id} scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>
            {header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>
              {flexRender(header.column.columnDef.header, header.getContext())}
              {direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}
            </button> : flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>;
        })}</TableRow>)}
      </TableHeader>
      <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
  );
}

function CampaignForm({
  entityId,
  defaultValues,
  options,
  selectedProgramId,
  error,
  isPending,
  submitLabel,
  onSubmit,
}: {
  entityId?: string;
  defaultValues: CampaignInput;
  options?: CampaignFilterOptions;
  selectedProgramId?: string | null;
  error: Error | null;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (values: CampaignInput) => void;
}) {
  const form = useForm<CampaignInput>({ defaultValues });
  useEffect(() => form.reset(defaultValues), [defaultValues, form]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={form.handleSubmit((values) => {
        const parsed = campaignFormSchema.safeParse(values);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) => {
            form.setError(issue.path[0] as keyof CampaignInput, { message: issue.message });
          });
          return;
        }
        onSubmit({ ...parsed.data, customFieldValues: form.getValues("customFieldValues") });
      })}
    >
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="campaign-form-name">Tên chiến dịch *</FieldLabel>
          <Input id="campaign-form-name" placeholder="Ví dụ: Tuyển sinh chính quy 2026" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.type)}>
          <FieldLabel htmlFor="campaign-form-type">Loại chiến dịch</FieldLabel>
          <Input id="campaign-form-type" placeholder="digital, event..." aria-invalid={Boolean(form.formState.errors.type)} {...form.register("type")} />
          <FieldError errors={[form.formState.errors.type]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="campaign-form-status">Trạng thái *</FieldLabel>
          <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value as CampaignInput["status"], { shouldValidate: true })}>
            <SelectTrigger id="campaign-form-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.startDate)}>
          <FieldLabel htmlFor="campaign-form-start">Ngày bắt đầu</FieldLabel>
          <Input id="campaign-form-start" type="date" aria-invalid={Boolean(form.formState.errors.startDate)} {...form.register("startDate")} />
          <FieldError errors={[form.formState.errors.startDate]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.endDate)}>
          <FieldLabel htmlFor="campaign-form-end">Ngày kết thúc</FieldLabel>
          <Input id="campaign-form-end" type="date" aria-invalid={Boolean(form.formState.errors.endDate)} {...form.register("endDate")} />
          <FieldError errors={[form.formState.errors.endDate]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.budget)}>
          <FieldLabel htmlFor="campaign-form-budget">Ngân sách (VND) *</FieldLabel>
          <Input id="campaign-form-budget" type="number" min={0} step={1000} inputMode="numeric" aria-invalid={Boolean(form.formState.errors.budget)} {...form.register("budget", { valueAsNumber: true })} />
          <FieldError errors={[form.formState.errors.budget]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="campaign-form-program">Chương trình</FieldLabel>
          <Select
            value={form.watch("institutionProgramId") || "__empty__"}
            disabled={Boolean(selectedProgramId)}
            onValueChange={(value) => form.setValue("institutionProgramId", value === "__empty__" ? "" : value)}
          >
            <SelectTrigger id="campaign-form-program" className="w-full"><SelectValue placeholder="Chọn chương trình" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">Không gắn chương trình</SelectItem>
              {(options?.institutionPrograms ?? []).map((program) => (
                <SelectItem key={program.id} value={program.id}>{program.institutionName} - {program.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <RuntimeCustomFieldsSection entityType="MARKETING_CAMPAIGN" entityId={entityId} disabled={isPending} onChange={(values) => form.setValue("customFieldValues", values)} />
      <DialogFooter>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}
    </p>
  );
}
