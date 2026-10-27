import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { leadChannelInputSchema, type LeadChannelInput } from "@admission-crm/shared/lead-channel";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Pencil, Plus, Power, Search } from "lucide-react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { createLeadChannel, getLeadChannels, setLeadChannelStatus, updateLeadChannel } from "@/services/lead-channel.service";
import type { LeadChannelFilters, LeadChannelItem, LeadChannelSortField, LeadChannelStatusFilter } from "../lead-channel.types";

const pageSize = 20;
const emptyFilters: LeadChannelFilters = { search: "", status: "" };
const sortableColumns = new Set<LeadChannelSortField>(["createdAt", "name"]);
const statusOptions = [
  { value: "active", label: "Đang dùng" },
  { value: "inactive", label: "Đã tắt" },
];
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

/** Queries that list Nguồn values as field options (Lead filters, automation conditions). */
function invalidateChannelConsumers(queryClient: ReturnType<typeof useQueryClient>, programId: string) {
  void queryClient.invalidateQueries({ queryKey: ["lead-channels", programId] });
  void queryClient.invalidateQueries({ queryKey: ["leads"] });
  void queryClient.invalidateQueries({ queryKey: ["automations"] });
}

export function LeadChannelsPage() {
  const { selectedProgramId } = useInstitutionProgram();
  return <ProgramLeadChannelsPage key={selectedProgramId ?? "no-program"} />;
}

function ProgramLeadChannelsPage() {
  const auth = useAuth();
  const { selectedProgramId, hasSelectedProgram } = useInstitutionProgram();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const canManage = auth.can("lead_channel.manage") && hasSelectedProgram;
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as LeadChannelSortField) ? (selectedSort.id as LeadChannelSortField) : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["lead-channels", selectedProgramId, "list", page, pageSize, sortBy, sortOrder, filters],
    queryFn: () => getLeadChannels({ page, limit: pageSize, sortBy, sortOrder, ...filters }, auth.accessToken!, selectedProgramId!),
    placeholderData: (previousData) => previousData,
    enabled: hasSelectedProgram && !!auth.accessToken,
  });
  const data = useMemo(() => listQuery.data?.data ?? [], [listQuery.data?.data]);
  const columns = useColumns(canManage ? selectedProgramId : null, setStatusMessage);
  const table = useReactTable({
    data,
    columns,
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
  const pagination = listQuery.data?.pagination;

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeader
          eyebrow="CRM Marketing · Quản lý nguồn lead"
          title="Nguồn"
          scopeLabel="Theo chương trình"
          description="Danh mục giá trị của trường Nguồn. Giá trị mới nhận từ webhook được tự thêm và đánh dấu * cho đến khi được xác nhận."
          actions={canManage ? (
            <LeadChannelDialog programId={selectedProgramId!} onSaved={(name) => {
              setStatusMessage(`Đã thêm nguồn “${name}”.`);
              setDraftFilters(emptyFilters);
              setFilters(emptyFilters);
              setPage(1);
              setSorting([{ id: "createdAt", desc: true }]);
            }} />
          ) : undefined}
        />
        {statusMessage && <p role="status" className="text-sm text-muted-foreground">{statusMessage}</p>}
        <Card className="gap-4 border-border/70 py-5 shadow-xs">
          <CardHeader className="gap-1 px-5">
            <CardTitle>Bộ lọc nguồn</CardTitle>
            <CardDescription>Tìm theo tên nguồn hoặc trạng thái sử dụng.</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <form onSubmit={(event) => {
              event.preventDefault();
              setFilters(draftFilters);
              setPage(1);
            }}>
              <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(250px,2fr)_minmax(170px,1fr)_auto]">
                <Field className="gap-2">
                  <FieldLabel htmlFor="lead-channel-search">Tìm kiếm</FieldLabel>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="lead-channel-search"
                      className="pl-9"
                      placeholder="Nhập tên nguồn"
                      value={draftFilters.search}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                    />
                  </div>
                </Field>
                <FilterSelect
                  id="lead-channel-status"
                  label="Trạng thái"
                  value={draftFilters.status}
                  options={statusOptions}
                  onChange={(value) => setDraftFilters((current) => ({ ...current, status: value as LeadChannelStatusFilter }))}
                />
                <AutoFilterActions
                  snapshot={draftFilters}
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
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
          <CardHeader className="gap-1 border-b py-5">
            <CardTitle>Nguồn</CardTitle>
            <CardDescription>
              {pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} nguồn` : "Đang lấy dữ liệu nguồn…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isError ? (
              <ErrorState title="Không thể tải danh sách nguồn" description="Vui lòng thử lại để cập nhật dữ liệu nguồn." onReload={() => listQuery.refetch()} />
            ) : listQuery.isLoading ? (
              <TableLoadingState label="Đang tải danh sách nguồn" />
            ) : data.length === 0 ? (
              <EmptyState title="Chưa có nguồn phù hợp với bộ lọc" description="Thêm nguồn mới hoặc điều chỉnh bộ lọc." />
            ) : (
              <ServerDataTable table={table} caption="Danh sách nguồn" className="min-w-160" />
            )}
          </CardContent>
          {pagination && pagination.total > 0 && (
            <TablePagination
              page={page}
              pagination={pagination}
              isFetching={listQuery.isFetching}
              className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"
              labels={{ previous: "Trang trước", next: "Trang sau" }}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => current + 1)}
            />
          )}
        </Card>
      </div>
    </PageLoadingBoundary>
  );
}

function useColumns(manageProgramId: string | null, onStatus: (message: string) => void) {
  return useMemo<ColumnDef<LeadChannelItem>[]>(() => [
    {
      accessorKey: "name",
      header: "Nguồn",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {row.original.name}
            {row.original.isAutoCreated && <span className="text-destructive" aria-hidden="true">*</span>}
          </span>
          {row.original.isAutoCreated && (
            <Badge variant="outline" title="Lưu tên nguồn để xác nhận và bỏ dấu *">Tự thêm từ webhook</Badge>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>{row.original.isActive ? "Đang dùng" : "Đã tắt"}</Badge>
      ),
    },
    { accessorKey: "createdAt", header: "Ngày tạo", cell: ({ row }) => dateFormatter.format(new Date(row.original.createdAt)) },
    ...(manageProgramId ? [{
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }: { row: { original: LeadChannelItem } }) => (
        <div className="flex justify-end gap-1">
          <LeadChannelDialog programId={manageProgramId} channel={row.original} onSaved={(name) => onStatus(`Đã lưu nguồn “${name}”.`)} />
          <LeadChannelStatusButton programId={manageProgramId} channel={row.original} onChanged={onStatus} />
        </div>
      ),
    } satisfies ColumnDef<LeadChannelItem>] : []),
  ], [manageProgramId, onStatus]);
}

function LeadChannelStatusButton({ programId, channel, onChanged }: { programId: string; channel: LeadChannelItem; onChanged: (message: string) => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const nextActive = !channel.isActive;
  const mutation = useMutation({
    mutationFn: () => setLeadChannelStatus(channel.id, nextActive, auth.accessToken!, programId),
    onSuccess: () => {
      onChanged(nextActive ? `Đã bật nguồn “${channel.name}”.` : `Đã tắt nguồn “${channel.name}”. Nguồn này không còn hiển thị khi chọn giá trị.`);
      invalidateChannelConsumers(queryClient, programId);
    },
    onError: (error) => onChanged(error.message),
  });
  const label = nextActive ? `Bật nguồn ${channel.name}` : `Tắt nguồn ${channel.name}`;
  return (
    <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()} aria-label={label} title={label}>
      <Power aria-hidden="true" data-icon="inline-start" />
      {mutation.isPending ? "Đang lưu…" : nextActive ? "Bật" : "Tắt"}
    </Button>
  );
}

function LeadChannelDialog({ programId, channel, onSaved }: { programId: string; channel?: LeadChannelItem; onSaved: (name: string) => void }) {
  const auth = useAuth();
  const { programs } = useInstitutionProgram();
  const program = programs.find((item) => item.id === programId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(channel);
  const inputId = isEdit ? `lead-channel-name-${channel!.id}` : "lead-channel-name";
  const errorId = `${inputId}-error`;
  const form = useForm<LeadChannelInput>({ defaultValues: { name: channel?.name ?? "" } });
  const mutation = useMutation({
    mutationFn: (input: LeadChannelInput) => channel
      ? updateLeadChannel(channel.id, input, auth.accessToken!, programId)
      : createLeadChannel(input, auth.accessToken!, programId),
    onSuccess: (_result, input) => {
      setOpen(false);
      onSaved(input.name);
      invalidateChannelConsumers(queryClient, programId);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (mutation.isPending) return;
      if (nextOpen) {
        form.reset({ name: channel?.name ?? "" });
        mutation.reset();
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        {channel ? (
          <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Sửa tên nguồn ${channel.name}`} title="Sửa tên nguồn">
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button"><Plus data-icon="inline-start" aria-hidden="true" />Thêm nguồn</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa tên nguồn" : "Thêm nguồn"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Tên mới hiển thị ở mọi lần Lead đổ về đang dùng nguồn này. Nguồn" : "Nguồn mới"} thuộc chương trình {program ? `${program.institutionName} - ${program.name}` : "đang làm việc"}.
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="flex flex-col gap-5" onSubmit={form.handleSubmit((values) => {
          if (mutation.isPending) return;
          form.clearErrors();
          const parsed = leadChannelInputSchema.safeParse(values);
          if (!parsed.success) {
            parsed.error.issues.forEach((issue) => form.setError(issue.path[0] as keyof LeadChannelInput, { message: issue.message }));
            form.setFocus("name");
            return;
          }
          mutation.mutate(parsed.data);
        })}>
          {mutation.error && <Alert variant="destructive"><AlertDescription>{mutation.error.message}</AlertDescription></Alert>}
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)} data-disabled={mutation.isPending}>
              <FieldLabel htmlFor={inputId}>Tên nguồn *</FieldLabel>
              <Input
                id={inputId}
                placeholder="Ví dụ: Landing page tuyển sinh"
                maxLength={255}
                aria-required="true"
                aria-invalid={Boolean(form.formState.errors.name)}
                aria-describedby={form.formState.errors.name ? errorId : undefined}
                disabled={mutation.isPending}
                {...form.register("name")}
              />
              {channel?.isAutoCreated && (
                <FieldDescription>Nguồn này được tự thêm từ webhook. Lưu tên để xác nhận và bỏ dấu *.</FieldDescription>
              )}
              <FieldError id={errorId} errors={[form.formState.errors.name]} />
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
