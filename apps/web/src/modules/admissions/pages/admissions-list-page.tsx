import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { TablePagination } from "@/components/shared/table-pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as DataTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  CheckCircle2,
  GraduationCap,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import {
  approveAdmissionProfile,
  changeAdmissionStatus,
  convertAdmissionToStudent,
  createAdmissionProfile,
  getAdmissionActionOptions,
  getAdmissionFilterOptions,
  getAdmissionProfiles,
  updateAdmissionProfile,
} from "@/services/admission.service";
import type {
  AdmissionActionOptions,
  AdmissionFilterOptions,
  AdmissionListFilters,
  AdmissionListItem,
  AdmissionListResponse,
  AdmissionProfileInput,
  AdmissionSortField,
} from "../admission.types";

const pageSize = 20;
const emptyAdmissions: AdmissionListItem[] = [];
const emptyFilters: AdmissionListFilters = {
  search: "",
  statusId: "",
  majorId: "",
};
const sortableColumns = new Set<AdmissionSortField>([
  "createdAt",
  "admissionCode",
  "applicationReceivedDate",
]);
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

type DialogState =
  | { type: "create" }
  | { type: "edit"; profile: AdmissionListItem }
  | { type: "status"; profile: AdmissionListItem }
  | { type: "approve"; profile: AdmissionListItem }
  | { type: "convert"; profile: AdmissionListItem }
  | null;

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác.";
}

export function AdmissionsListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const selectedSort = sorting[0] ?? { id: "createdAt", desc: true };
  const sortBy = sortableColumns.has(selectedSort.id as AdmissionSortField)
    ? (selectedSort.id as AdmissionSortField)
    : "createdAt";
  const sortOrder = selectedSort.desc ? "desc" : "asc";
  const canUpdate = auth.can("admission.update");
  const canApprove = auth.can("admission.approve");
  const canChangeStatus =
    auth.can("admission_status.update") || auth.can("admission.update");
  const canConvert = auth.can("student.create_from_admission");

  const listQuery = useQuery({
    queryKey: [
      "admissions",
      "list",
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters,
    ],
    queryFn: () =>
      getAdmissionProfiles(
        { page, limit: pageSize, sortBy, sortOrder, ...filters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["admissions", "options"],
    queryFn: () => getAdmissionFilterOptions(auth.accessToken!),
  });
  const actionOptionsQuery = useQuery({
    queryKey: ["admissions", "action-options"],
    queryFn: () => getAdmissionActionOptions(auth.accessToken!),
    enabled: canUpdate || canApprove || canChangeStatus || canConvert,
  });

  const invalidateAdmissions = () => {
    queryClient.invalidateQueries({ queryKey: ["admissions"] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
  };
  const createMutation = useMutation({
    mutationFn: (input: AdmissionProfileInput) =>
      createAdmissionProfile(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateAdmissions();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdmissionProfileInput }) =>
      updateAdmissionProfile(id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateAdmissions();
    },
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, statusId }: { id: string; statusId?: string }) =>
      approveAdmissionProfile(id, statusId, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateAdmissions();
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, statusId }: { id: string; statusId: string }) =>
      changeAdmissionStatus(id, statusId, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateAdmissions();
    },
  });
  const convertMutation = useMutation({
    mutationFn: ({ id, classId }: { id: string; classId?: string }) =>
      convertAdmissionToStudent(id, classId, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateAdmissions();
    },
  });

  const data = listQuery.data?.data ?? emptyAdmissions;
  const onEdit = useCallback(
    (profile: AdmissionListItem) => {
      updateMutation.reset();
      setDialog({ type: "edit", profile });
    },
    [updateMutation.reset],
  );
  const onApprove = useCallback(
    (profile: AdmissionListItem) => {
      approveMutation.reset();
      setDialog({ type: "approve", profile });
    },
    [approveMutation.reset],
  );
  const onStatus = useCallback(
    (profile: AdmissionListItem) => {
      statusMutation.reset();
      setDialog({ type: "status", profile });
    },
    [statusMutation.reset],
  );
  const onConvert = useCallback(
    (profile: AdmissionListItem) => {
      convertMutation.reset();
      setDialog({ type: "convert", profile });
    },
    [convertMutation.reset],
  );
  const columns = useAdmissionColumns({
    canUpdate,
    canApprove,
    canChangeStatus,
    canConvert,
    onEdit,
    onApprove,
    onStatus,
    onConvert,
  });
  const table = useReactTable({
    data,
    columns,
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
        eyebrow="CRM Tuyển sinh"
        title="Danh sách hồ sơ tuyển sinh"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi hồ sơ, ngành đăng ký và trạng thái tiếp nhận trên toàn hệ thống."
        actions={
          canUpdate ? (
            <Button
              type="button"
              onClick={() => {
                createMutation.reset();
                setDialog({ type: "create" });
              }}
            >
              <Plus aria-hidden="true" />
              Tạo hồ sơ
            </Button>
          ) : undefined
        }
      />
      <AdmissionFilters
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
      <AdmissionResults
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
      <Dialog
        open={dialog?.type === "create"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tạo hồ sơ tuyển sinh</DialogTitle>
            <DialogDescription>
              Chọn lead đã đủ điều kiện và khai báo thông tin xét tuyển ban đầu.
            </DialogDescription>
          </DialogHeader>
          <AdmissionProfileForm
            options={actionOptionsQuery.data}
            isSubmitting={createMutation.isPending}
            error={createMutation.error}
            onSubmit={(input) => createMutation.mutate(input)}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog?.type === "edit"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa hồ sơ tuyển sinh</DialogTitle>
            <DialogDescription>
              Cập nhật ngành, trạng thái và thông tin xét tuyển của hồ sơ.
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "edit" && (
            <AdmissionProfileForm
              profile={dialog.profile}
              options={actionOptionsQuery.data}
              isSubmitting={updateMutation.isPending}
              error={updateMutation.error}
              onSubmit={(input) =>
                updateMutation.mutate({ id: dialog.profile.id, input })
              }
            />
          )}
        </DialogContent>
      </Dialog>
      <StatusDialog
        dialog={dialog}
        options={actionOptionsQuery.data}
        isSubmitting={statusMutation.isPending}
        error={statusMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(statusId) =>
          dialog?.type === "status" &&
          statusMutation.mutate({ id: dialog.profile.id, statusId })
        }
      />
      <ApproveDialog
        dialog={dialog}
        options={actionOptionsQuery.data}
        isSubmitting={approveMutation.isPending}
        error={approveMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(statusId) =>
          dialog?.type === "approve" &&
          approveMutation.mutate({ id: dialog.profile.id, statusId })
        }
      />
      <ConvertDialog
        dialog={dialog}
        options={actionOptionsQuery.data}
        isSubmitting={convertMutation.isPending}
        error={convertMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(classId) =>
          dialog?.type === "convert" &&
          convertMutation.mutate({ id: dialog.profile.id, classId })
        }
      />
    </div>
    </PageLoadingBoundary>
  );
}

function useAdmissionColumns({
  canUpdate,
  canApprove,
  canChangeStatus,
  canConvert,
  onEdit,
  onApprove,
  onStatus,
  onConvert,
}: {
  canUpdate: boolean;
  canApprove: boolean;
  canChangeStatus: boolean;
  canConvert: boolean;
  onEdit: (profile: AdmissionListItem) => void;
  onApprove: (profile: AdmissionListItem) => void;
  onStatus: (profile: AdmissionListItem) => void;
  onConvert: (profile: AdmissionListItem) => void;
}) {
  return useMemo<ColumnDef<AdmissionListItem>[]>(
    () => [
      {
        accessorKey: "admissionCode",
        header: "Mã hồ sơ",
        cell: ({ row }) => row.original.admissionCode ?? "-",
      },
      {
        id: "candidate",
        header: "Thí sinh",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.lead?.fullName ?? "-"}
          </span>
        ),
      },
      {
        id: "major",
        header: "Ngành",
        enableSorting: false,
        cell: ({ row }) => (row.original.major ? row.original.major.name : "-"),
      },
      {
        id: "status",
        header: "Trạng thái",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.status?.name ?? "Chưa xác định"}
          </Badge>
        ),
      },
      {
        accessorKey: "applicationReceivedDate",
        header: "Ngày tiếp nhận",
        cell: ({ row }) => formatDate(row.original.applicationReceivedDate),
      },
      {
        accessorKey: "createdAt",
        header: "Ngày tạo",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-48 flex-wrap justify-end gap-2">
            {canUpdate && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onEdit(row.original)}
                aria-label="Sửa hồ sơ"
              >
                <Pencil aria-hidden="true" />
                Sửa
              </Button>
            )}
            {canChangeStatus && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onStatus(row.original)}
                aria-label="Chuyển trạng thái"
              >
                Trạng thái
              </Button>
            )}
            {canApprove && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onApprove(row.original)}
                aria-label="Duyệt hồ sơ"
              >
                <CheckCircle2 aria-hidden="true" />
                Duyệt
              </Button>
            )}
            {canConvert && !row.original.student && (
              <Button
                type="button"
                size="sm"
                onClick={() => onConvert(row.original)}
                aria-label="Chuyển sang sinh viên"
              >
                <GraduationCap aria-hidden="true" />
                Sinh viên
              </Button>
            )}
          </div>
        ),
      },
    ],
    [
      canUpdate,
      canApprove,
      canChangeStatus,
      canConvert,
      onEdit,
      onApprove,
      onStatus,
      onConvert,
    ],
  );
}

type FilterProps = {
  filters: AdmissionListFilters;
  options?: AdmissionFilterOptions;
  onChange: (field: keyof AdmissionListFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function AdmissionFilters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
}: FilterProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc hồ sơ</CardTitle>
        <CardDescription>
          Tìm theo mã hồ sơ hoặc họ tên thí sinh.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(220px,2fr)_repeat(2,minmax(170px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="admission-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="admission-search"
                  className="pl-9"
                  placeholder="Nhập mã hồ sơ hoặc họ tên"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </Field>
            <FilterSelect
              id="admission-status"
              label="Trạng thái"
              value={filters.statusId}
              onChange={(value) => onChange("statusId", value)}
              options={(options?.statuses ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <FilterSelect
              id="admission-major"
              label="Ngành đăng ký"
              value={filters.majorId}
              onChange={(value) => onChange("majorId", value)}
              options={(options?.majors ?? []).map((item) => ({
                value: item.id,
                label: item.name,
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
  table: DataTable<AdmissionListItem>;
  data: AdmissionListItem[];
  pagination?: AdmissionListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function AdmissionResults(props: ResultsProps) {
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
        <CardTitle>Hồ sơ tuyển sinh</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} hồ sơ`
            : "Đang lấy dữ liệu hồ sơ..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {isError ? (
          <ErrorState
            title="Không thể tải danh sách hồ sơ"
            description="Vui lòng thử lại để cập nhật danh sách hồ sơ tuyển sinh."
            onReload={onReload}
          />
        ) : isLoading ? (
          <TableLoadingState label="Đang tải danh sách hồ sơ" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có hồ sơ phù hợp với bộ lọc"
            description="Điều chỉnh bộ lọc để tìm hồ sơ cần theo dõi."
          />
        ) : (
          <ServerDataTable
            table={table}
            caption="Danh sách hồ sơ tuyển sinh"
            className="min-w-240"
          />
        )}
      </CardContent>
      {pagination && pagination.total > 0 && (
        <TablePagination
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

function AdmissionProfileForm(props: {
  profile?: AdmissionListItem;
  options?: AdmissionActionOptions;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (input: AdmissionProfileInput) => void;
}) {
  const { profile, options, isSubmitting, error, onSubmit } = props;
  const [form, setForm] = useState<AdmissionProfileInput>(() =>
    createAdmissionProfileInput(profile, options),
  );
  const setValue = (field: keyof AdmissionProfileInput, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="admission-form-lead">Lead</FieldLabel>
          <Select
            value={form.leadId}
            onValueChange={(value) => setValue("leadId", value)}
            disabled={Boolean(profile)}
          >
            <SelectTrigger id="admission-form-lead" className="w-full">
              <SelectValue placeholder="Chọn lead" />
            </SelectTrigger>
            <SelectContent>
              {profile?.lead && (
                <SelectItem value={profile.lead.id}>
                  {profile.lead.fullName}
                </SelectItem>
              )}
              {(options?.leads ?? []).map((lead) => (
                <SelectItem key={lead.id} value={lead.id}>
                  {lead.fullName} - {lead.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="admission-form-program">Chương trình</FieldLabel>
          <Select
            value={form.institutionProgramId ?? ""}
            onValueChange={(value) => setValue("institutionProgramId", value)}
          >
            <SelectTrigger id="admission-form-program" className="w-full">
              <SelectValue placeholder="Chọn chương trình" />
            </SelectTrigger>
            <SelectContent>
              {(options?.institutionPrograms ?? []).map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.institutionName} / {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="admission-form-major">Ngành đăng ký</FieldLabel>
          <Select
            value={form.majorId}
            onValueChange={(value) => setValue("majorId", value)}
          >
            <SelectTrigger id="admission-form-major" className="w-full">
              <SelectValue placeholder="Chọn ngành" />
            </SelectTrigger>
            <SelectContent>
              {(options?.majors ?? []).map((major) => (
                <SelectItem key={major.id} value={major.id}>
                  {major.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="admission-form-status">Trạng thái</FieldLabel>
          <Select
            value={form.admissionStatusId}
            onValueChange={(value) => setValue("admissionStatusId", value)}
          >
            <SelectTrigger id="admission-form-status" className="w-full">
              <SelectValue placeholder="Chọn trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {(options?.statuses ?? []).map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <AdmissionProfileDetails form={form} setValue={setValue} />
      </FieldGroup>
      <RuntimeCustomFieldsSection
        entityType="ADMISSION_PROFILE"
        entityId={profile?.id}
        disabled={isSubmitting}
        onChange={(values) =>
          setForm((current) => ({ ...current, customFieldValues: values }))
        }
      />
      {Boolean(error) && (
        <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang lưu..." : "Lưu hồ sơ"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TextInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

function StatusDialog(props: {
  dialog: DialogState;
  options?: AdmissionActionOptions;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (statusId: string) => void;
}) {
  const [statusId, setStatusId] = useState("");
  return (
    <Dialog
      open={props.dialog?.type === "status"}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển trạng thái hồ sơ</DialogTitle>
          <DialogDescription>
            Chọn trạng thái xử lý tiếp theo cho hồ sơ tuyển sinh.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="admission-status-change">
            Trạng thái mới
          </FieldLabel>
          <Select value={statusId} onValueChange={setStatusId}>
            <SelectTrigger id="admission-status-change" className="w-full">
              <SelectValue placeholder="Chọn trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {(props.options?.statuses ?? []).map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {Boolean(props.error) && (
          <p className="text-sm text-destructive">
            {getErrorMessage(props.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={!statusId || props.isSubmitting}
            onClick={() => props.onSubmit(statusId)}
          >
            {props.isSubmitting ? "Đang chuyển..." : "Chuyển trạng thái"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog(props: {
  dialog: DialogState;
  options?: AdmissionActionOptions;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (statusId?: string) => void;
}) {
  const approvedStatus = props.options?.statuses.find(
    (status) => status.code === "APPROVED",
  );
  return (
    <Dialog
      open={props.dialog?.type === "approve"}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duyệt hồ sơ tuyển sinh</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ ghi nhận lịch sử duyệt và thông báo cho nhân sự phụ
            trách lead.
          </DialogDescription>
        </DialogHeader>
        {Boolean(props.error) && (
          <p className="text-sm text-destructive">
            {getErrorMessage(props.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={props.isSubmitting}
            onClick={() => props.onSubmit(approvedStatus?.id)}
          >
            {props.isSubmitting ? "Đang duyệt..." : "Duyệt hồ sơ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog(props: {
  dialog: DialogState;
  options?: AdmissionActionOptions;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (classId?: string) => void;
}) {
  const [classId, setClassId] = useState("__none__");
  return (
    <Dialog
      open={props.dialog?.type === "convert"}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển sang sinh viên</DialogTitle>
          <DialogDescription>
            Tạo hồ sơ sinh viên từ hồ sơ tuyển sinh đã xác nhận.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="admission-convert-class">
            Lớp sinh viên
          </FieldLabel>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger id="admission-convert-class" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Chưa xếp lớp</SelectItem>
              {(props.options?.classes ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.code} - {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {Boolean(props.error) && (
          <p className="text-sm text-destructive">
            {getErrorMessage(props.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={props.isSubmitting}
            onClick={() =>
              props.onSubmit(classId === "__none__" ? undefined : classId)
            }
          >
            {props.isSubmitting ? "Đang chuyển..." : "Tạo sinh viên"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function createAdmissionProfileInput(
  profile?: AdmissionListItem,
  options?: AdmissionActionOptions,
): AdmissionProfileInput {
  return {
    leadId: profile?.lead?.id ?? "",
    institutionProgramId:
      profile?.institutionProgram?.id ??
      options?.institutionPrograms[0]?.id ??
      "",
    majorId: profile?.major?.id ?? "",
    admissionStatusId: profile?.status?.id ?? "",
    trainingType: profile?.trainingType ?? "",
    classCode: profile?.classCode ?? "",
    subjectGroupCode: profile?.subjectGroupCode ?? "",
    subjectGroupName: profile?.subjectGroupName ?? "",
    score1: profile?.score1 ?? "",
    score2: profile?.score2 ?? "",
    score3: profile?.score3 ?? "",
    admissionScore: profile?.admissionScore ?? "",
    applicationReceivedDate: toDateInput(
      profile?.applicationReceivedDate ?? null,
    ),
    expiresAt: toDateInput(profile?.expiresAt ?? null),
    enrollmentBatch: profile?.enrollmentBatch ?? "",
    trainingCode: profile?.trainingCode ?? "",
    registrationStation: profile?.registrationStation ?? "",
    decisionNumber: profile?.decisionNumber ?? "",
    decisionSignedDate: toDateInput(profile?.decisionSignedDate ?? null),
    monthlyRevenue: profile?.monthlyRevenue ?? "",
    feeStatus: profile?.feeStatus ?? "",
    tuitionStatus: profile?.tuitionStatus ?? "",
    customFieldValues: {},
  };
}

function AdmissionProfileDetails({
  form,
  setValue,
}: {
  form: AdmissionProfileInput;
  setValue: (field: keyof AdmissionProfileInput, value: string) => void;
}) {
  return (
    <>
      {" "}
      <TextInput
        id="admission-form-training-type"
        label="Hình thức đào tạo"
        value={form.trainingType ?? ""}
        onChange={(value) => setValue("trainingType", value)}
      />
      <TextInput
        id="admission-form-received"
        label="Ngày tiếp nhận"
        type="date"
        value={form.applicationReceivedDate ?? ""}
        onChange={(value) => setValue("applicationReceivedDate", value)}
      />
      <TextInput
        id="admission-form-expires"
        label="Ngày hết hạn hồ sơ"
        type="date"
        value={form.expiresAt ?? ""}
        onChange={(value) => setValue("expiresAt", value)}
      />
      <TextInput
        id="admission-form-class"
        label="Mã lớp dự kiến"
        value={form.classCode ?? ""}
        onChange={(value) => setValue("classCode", value)}
      />
      <TextInput
        id="admission-form-batch"
        label="Đợt nhập học"
        value={form.enrollmentBatch ?? ""}
        onChange={(value) => setValue("enrollmentBatch", value)}
      />
      <TextInput
        id="admission-form-score"
        label="Điểm xét tuyển"
        value={form.admissionScore ?? ""}
        onChange={(value) => setValue("admissionScore", value)}
      />
      <TextInput
        id="admission-form-revenue"
        label="Học phí dự kiến"
        value={form.monthlyRevenue ?? ""}
        onChange={(value) => setValue("monthlyRevenue", value)}
      />
      <TextInput
        id="admission-form-fee"
        label="Trạng thái phí"
        value={form.feeStatus ?? ""}
        onChange={(value) => setValue("feeStatus", value)}
      />
      <TextInput
        id="admission-form-tuition"
        label="Trạng thái học phí"
        value={form.tuitionStatus ?? ""}
        onChange={(value) => setValue("tuitionStatus", value)}
      />
    </>
  );
}
