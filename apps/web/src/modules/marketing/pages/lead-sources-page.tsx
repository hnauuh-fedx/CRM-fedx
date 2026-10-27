import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { leadSourceInputSchema, type LeadSourceInput } from "@admission-crm/shared/lead-source";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import { Pencil, Plus, Search } from "lucide-react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { createLeadSource, getLeadSourceFilterOptions, getLeadSources, updateLeadSource } from "@/services/marketing-reference.service";
import type {
  LeadSourceFilterOptions,
  LeadSourceFilters,
  LeadSourceItem,
  LeadSourceListResponse,
  LeadSourceSortField,
} from "../marketing-reference.types";

const pageSize = 20;
const emptyFilters: LeadSourceFilters = { search: "", type: "" };
const sortableColumns = new Set<LeadSourceSortField>([
  "createdAt",
  "name",
  "type",
]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function LeadSourcesPage() {
  const { selectedProgramId } = useInstitutionProgram();
  return <ProgramLeadSourcesPage key={selectedProgramId ?? "no-program"} />;
}

function ProgramLeadSourcesPage() {
  const auth = useAuth();
  const { selectedProgramId, hasSelectedProgram } = useInstitutionProgram();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const canManage = (auth.can("lead_source.manage") || auth.can("system.manage")) && hasSelectedProgram;
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as LeadSourceSortField)
    ? (selectedSort.id as LeadSourceSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["lead-sources", selectedProgramId, "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getLeadSources({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!, selectedProgramId!),
    placeholderData: (previousData) => previousData,
    enabled: hasSelectedProgram && !!auth.accessToken,
  });
  const optionsQuery = useQuery({
    queryKey: ["lead-sources", selectedProgramId, "options"],
    queryFn: () => getLeadSourceFilterOptions(auth.accessToken!, selectedProgramId!),
    enabled: hasSelectedProgram && !!auth.accessToken,
  });
  const data = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const table = useReactTable({
    data,
    columns: useColumns(canManage ? selectedProgramId : null, setStatusMessage),
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
        eyebrow="CRM Marketing · Quản lý nguồn lead"
        title="Nguồn học viên"
        scopeLabel="Theo chương trình"
        description="Theo dõi nguồn học viên và số lead đang hoạt động của chương trình đang làm việc."
        actions={canManage ? (
          <LeadSourceDialog programId={selectedProgramId!} onSaved={(name) => {
            setStatusMessage(`Đã thêm nguồn “${name}”.`);
            setDraftFilters(emptyFilters);
            setFilters(emptyFilters);
            setPage(1);
            setSorting([{ id: "createdAt", desc: true }]);
          }} />
        ) : undefined}
      />
      {statusMessage && <p role="status" className="text-sm text-muted-foreground">{statusMessage}</p>}
      <LeadSourceFilters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
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
    </div>
    </PageLoadingBoundary>
  );
}

function LeadSourceDialog({ programId, source, onSaved }: { programId: string; source?: LeadSourceItem; onSaved: (name: string) => void }) {
  const auth = useAuth();
  const { programs } = useInstitutionProgram();
  const program = programs.find((item) => item.id === programId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(source);
  const form = useForm<LeadSourceInput>({ defaultValues: { name: source?.name ?? "" } });
  const mutation = useMutation({
    mutationFn: (input: LeadSourceInput) => source
      ? updateLeadSource(source.id, input, auth.accessToken!, programId)
      : createLeadSource(input, auth.accessToken!, programId),
    onSuccess: (_result, input) => {
      setOpen(false);
      onSaved(input.name);
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-sources", programId] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "options"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (mutation.isPending) return;
      if (nextOpen) {
        form.reset({ name: source?.name ?? "" });
        mutation.reset();
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        {source ? (
          <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Sửa tên nguồn ${source.name}`} title="Sửa tên nguồn">
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button"><Plus data-icon="inline-start" aria-hidden="true" />Thêm nguồn</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa tên nguồn học viên" : "Thêm nguồn học viên"}</DialogTitle>
          <DialogDescription>{isEdit ? "Tên mới sẽ hiển thị ở mọi lead đang dùng nguồn này. Nguồn" : "Nguồn mới"} thuộc chương trình {program ? `${program.institutionName} - ${program.name}` : "đang làm việc"}.</DialogDescription>
        </DialogHeader>
        <form noValidate className="flex flex-col gap-5" onSubmit={form.handleSubmit((values) => {
          if (mutation.isPending) return;
          form.clearErrors();
          const parsed = leadSourceInputSchema.safeParse(values);
          if (!parsed.success) {
            parsed.error.issues.forEach((issue) => form.setError(issue.path[0] as keyof LeadSourceInput, { message: issue.message }));
            const firstField = parsed.error.issues[0]?.path[0];
            if (firstField === "name") form.setFocus(firstField);
            return;
          }
          mutation.mutate(parsed.data);
        })}>
          {mutation.error && <Alert variant="destructive"><AlertDescription>{mutation.error.message}</AlertDescription></Alert>}
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)} data-disabled={mutation.isPending}>
              <FieldLabel htmlFor={isEdit ? `lead-source-name-${source!.id}` : "lead-source-name"}>Tên nguồn *</FieldLabel>
              <Input id={isEdit ? `lead-source-name-${source!.id}` : "lead-source-name"} placeholder="Ví dụ: Facebook Ads" maxLength={150} aria-required="true" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? "lead-source-name-error" : undefined} disabled={mutation.isPending} {...form.register("name")} />
              <FieldError id="lead-source-name-error" errors={[form.formState.errors.name]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lưu nguồn"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useColumns(manageProgramId: string | null, onStatus: (message: string) => void) {
  return useMemo<ColumnDef<LeadSourceItem>[]>(
    () => [
      { accessorKey: "name", header: "Nguồn học viên", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { accessorKey: "type", header: "Loại", cell: ({ row }) => row.original.type ?? "-" },
      { id: "institutionProgram", header: "Chương trình", enableSorting: false, cell: ({ row }) => row.original.institutionProgram ? `${row.original.institutionProgram.institutionName} / ${row.original.institutionProgram.name}` : "Chưa gán chương trình" },
      { accessorKey: "activeLeadCount", header: "Lead đang hoạt động", enableSorting: false },
      { accessorKey: "createdAt", header: "Ngày tạo", cell: ({ row }) => formatDate(row.original.createdAt) },
      ...(manageProgramId ? [{
        id: "actions",
        header: () => <span className="sr-only">Thao tác</span>,
        enableSorting: false,
        cell: ({ row }: { row: { original: LeadSourceItem } }) => (
          <LeadSourceDialog programId={manageProgramId} source={row.original} onSaved={(name) => onStatus(`Đã đổi tên nguồn thành “${name}”.`)} />
        ),
      } satisfies ColumnDef<LeadSourceItem>] : []),
    ],
    [manageProgramId, onStatus],
  );
}

type LeadSourceFiltersProps = {
  filters: LeadSourceFilters;
  options?: LeadSourceFilterOptions;
  onChange: (field: keyof LeadSourceFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function LeadSourceFilters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: LeadSourceFiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc nguồn học viên</CardTitle>
        <CardDescription>Tìm theo tên nguồn hoặc loại nguồn.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(250px,2fr)_minmax(170px,1fr)_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="lead-source-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="lead-source-search"
                  className="pl-9"
                  placeholder="Nhập tên nguồn lead"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="lead-source-type"
              label="Loại nguồn"
              value={filters.type}
              onChange={(value) => onChange("type", value)}
              options={(options?.types ?? []).map((type) => ({
                value: type,
                label: type,
              }))}
            />
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

type ResultsProps = {
  table: DataTable<LeadSourceItem>;
  data: LeadSourceItem[];
  pagination?: LeadSourceListResponse["pagination"];
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
        <CardTitle>Nguồn học viên</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} nguồn`
            : "Đang lấy dữ liệu nguồn lead…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải nguồn lead"
            description="Vui lòng thử lại để cập nhật dữ liệu nguồn lead."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải nguồn lead" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có nguồn lead phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm nguồn cần theo dõi."
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

function SortableTable({ table }: { table: DataTable<LeadSourceItem> }) {
  return (
    <ServerDataTable
      table={table}
      caption="Danh sách nguồn học viên"
      className="min-w-180"
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
  pagination: LeadSourceListResponse["pagination"];
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
