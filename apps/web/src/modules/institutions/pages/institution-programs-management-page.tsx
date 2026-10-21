import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { EditorDialog } from "@/components/shared/editor-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { StaticTableHeader } from "@/components/shared/static-table-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { TablePagination } from "@/components/shared/table-pagination";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedInstitutionProgram,
  deleteManagedInstitutionProgram,
  getManagedInstitutionPrograms,
  updateManagedInstitutionProgram,
} from "@/services/institution-program-management.service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  InstitutionProgramInput,
  ManagedInstitutionProgram,
} from "../institution-program-management.types";
const pageSize = 20;
const emptyFilters = { search: "", status: "", institutionName: "" };
const emptyForm: InstitutionProgramInput = {
  institutionName: "",
  name: "",
  code: "",
  status: "active",
};
const statusLabels = {
  active: "Đang tuyển",
  inactive: "Tạm ngưng",
  archived: "Lưu trữ",
} as const;

type DialogState =
  | { type: "create" }
  | { type: "edit"; program: ManagedInstitutionProgram }
  | { type: "delete"; program: ManagedInstitutionProgram }
  | null;

export function InstitutionProgramsManagementPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingProgram = dialog?.type === "edit" ? dialog.program : null;
  const deletingProgram = dialog?.type === "delete" ? dialog.program : null;

  const listQuery = useQuery({
    queryKey: ["institution-programs", "management", page, appliedFilters],
    queryFn: () =>
      getManagedInstitutionPrograms(
        {
          page,
          limit: pageSize,
          sortBy: "name",
          sortOrder: "asc",
          ...appliedFilters,
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const createMutation = useMutation({
    mutationFn: (input: InstitutionProgramInput) =>
      createManagedInstitutionProgram(input, auth.accessToken!),
    onSuccess: () => refresh(),
  });
  const updateMutation = useMutation({
    mutationFn: (input: InstitutionProgramInput) =>
      updateManagedInstitutionProgram(
        editingProgram!.id,
        input,
        auth.accessToken!,
      ),
    onSuccess: () => refresh(),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteManagedInstitutionProgram(deletingProgram!.id, auth.accessToken!),
    onSuccess: () => refresh(),
  });

  function refresh() {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: ["institution-programs"] });
    void queryClient.invalidateQueries({ queryKey: ["roles", "management", "options"] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["admissions"] });
    void queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Tuyển sinh"
        title="Chương trình tuyển sinh"
        scopeLabel="Quyền quản trị"
        description="Quản lý chương trình theo trường, mã tuyển sinh và trạng thái sử dụng trong lead, hồ sơ, sinh viên và báo cáo."
        actions={
          <Button
            type="button"
            onClick={() => {
              createMutation.reset();
              setDialog({ type: "create" });
            }}
          >
            <Plus aria-hidden="true" />
            Thêm chương trình
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            Bộ lọc chương trình
          </CardTitle>
          <CardDescription>
            Tìm theo mã, tên chương trình hoặc trường.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_180px_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ ...filters, search: filters.search.trim() });
              setPage(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="program-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="program-search"
                  className="pl-9"
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((value) => ({
                      ...value,
                      search: event.target.value,
                    }))
                  }
                  placeholder="Mã hoặc tên chương trình"
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="program-institution-filter">
                Trường
              </FieldLabel>
              <Input
                id="program-institution-filter"
                value={filters.institutionName}
                onChange={(event) =>
                  setFilters((value) => ({
                    ...value,
                    institutionName: event.target.value,
                  }))
                }
                placeholder="Nhập tên trường"
              />
            </Field>
            <FilterSelect
              label="Trạng thái"
              value={filters.status}
              allLabel="Tất cả"
              options={Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(status) =>
                setFilters((value) => ({ ...value, status }))
              }
            />
            <AutoFilterActions
              snapshot={filters}
              onApply={() => {
                setAppliedFilters({
                  ...filters,
                  search: filters.search.trim(),
                });
                setPage(1);
              }}
              onReset={() => {
                setFilters(emptyFilters);
                setAppliedFilters(emptyFilters);
                setPage(1);
              }}
            />
          </form>
        </CardContent>
      </Card>

      <InstitutionProgramResults
        pagination={pagination}
        data={data}
        listQuery={listQuery}
        updateMutation={updateMutation}
        setDialog={setDialog}
        deleteMutation={deleteMutation}
      />

      {pagination && (
        <TablePagination
          page={page}
          pagination={pagination}
          isFetching={false}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          labels={{ previous: "Trước", next: "Sau" }}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => value + 1)}
        />
      )}

      <Dialog
        open={dialog?.type === "create" || dialog?.type === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProgram ? "Cập nhật chương trình" : "Thêm chương trình"}
            </DialogTitle>
            <DialogDescription>
              Nhập tên trường, tên chương trình và mã tuyển sinh duy nhất.
            </DialogDescription>
          </DialogHeader>
          <ProgramForm
            initialValues={
              editingProgram ? toFormValues(editingProgram) : emptyForm
            }
            isPending={createMutation.isPending || updateMutation.isPending}
            error={createMutation.error ?? updateMutation.error}
            onSubmit={(input) =>
              editingProgram
                ? updateMutation.mutate(input)
                : createMutation.mutate(input)
            }
          />
        </DialogContent>
      </Dialog>

      <EditorDialog
        open={dialog?.type === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={<>Xóa chương trình</>}
        description={
          <>
            Chương trình "{deletingProgram?.name}" chỉ xóa được khi chưa có
            lead, hồ sơ, sinh viên, ngành hoặc dữ liệu báo cáo liên quan.
          </>
        }
      >
        {deleteMutation.error && <MutationError error={deleteMutation.error} />}
        <DialogFooter showCloseButton>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "Đang xóa..." : "Xóa chương trình"}
          </Button>
        </DialogFooter>
      </EditorDialog>
    </div>
    </PageLoadingBoundary>
  );
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value || "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? "" : next)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="__all__">{allLabel}</SelectItem>
            {options.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ProgramForm({
  initialValues,
  isPending,
  error,
  onSubmit,
}: {
  initialValues: InstitutionProgramInput;
  isPending: boolean;
  error: Error | null;
  onSubmit: (input: InstitutionProgramInput) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<
    Partial<Record<keyof InstitutionProgramInput, string>>
  >({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof InstitutionProgramInput, string>> =
      {};
    if (values.institutionName.trim().length < 2)
      nextErrors.institutionName = "Tên trường cần tối thiểu 2 ký tự.";
    if (values.name.trim().length < 2)
      nextErrors.name = "Tên chương trình cần tối thiểu 2 ký tự.";
    if (values.code.trim().length < 2)
      nextErrors.code = "Mã chương trình cần tối thiểu 2 ký tự.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({
      ...values,
      institutionName: values.institutionName.trim(),
      name: values.name.trim(),
      code: values.code.trim(),
    });
  }
  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="program-institution-name"
          label="Trường *"
          value={values.institutionName}
          error={errors.institutionName}
          onChange={(institutionName) =>
            setValues((current) => ({ ...current, institutionName }))
          }
        />
        <TextField
          id="program-name"
          label="Tên chương trình *"
          value={values.name}
          error={errors.name}
          onChange={(name) => setValues((current) => ({ ...current, name }))}
        />
        <TextField
          id="program-code"
          label="Mã chương trình *"
          value={values.code}
          error={errors.code}
          onChange={(code) => setValues((current) => ({ ...current, code }))}
        />
        <Field>
          <FieldLabel>Trạng thái</FieldLabel>
          <Select
            value={values.status}
            onValueChange={(status: InstitutionProgramInput["status"]) =>
              setValues((current) => ({ ...current, status }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lưu..." : "Lưu chương trình"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof ApiError
        ? error.message
        : "Không thể thực hiện thao tác. Vui lòng thử lại."}
    </p>
  );
}

function toFormValues(
  program: ManagedInstitutionProgram,
): InstitutionProgramInput {
  return {
    institutionName: program.institutionName,
    name: program.name,
    code: program.code,
    status: program.status,
  };
}

type InstitutionProgramResultsProps = {
  pagination:
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;
  data: ManagedInstitutionProgram[];
  listQuery: import("@tanstack/react-query").UseQueryResult<
    NoInfer<
      import("../institution-program-management.types").InstitutionProgramListResponse
    >,
    Error
  >;
  updateMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    InstitutionProgramInput,
    unknown
  >;
  setDialog: import("react").Dispatch<
    import("react").SetStateAction<DialogState>
  >;
  deleteMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    void,
    unknown
  >;
};

function InstitutionProgramResults({
  pagination,
  data,
  listQuery,
  updateMutation,
  setDialog,
  deleteMutation,
}: InstitutionProgramResultsProps) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Danh sách chương trình</CardTitle>
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} chương trình`
            : "Đang lấy dữ liệu..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {listQuery.isError ? (
          <ErrorState
            title="Không thể tải chương trình tuyển sinh"
            description="Vui lòng thử lại để cập nhật dữ liệu."
            onReload={() => listQuery.refetch()}
          />
        ) : listQuery.isLoading ? (
          <TableLoadingState label="Đang tải chương trình" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Chưa có chương trình phù hợp"
            description="Thêm chương trình mới hoặc điều chỉnh bộ lọc hiện tại."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Danh sách chương trình tuyển sinh
              </caption>
              <StaticTableHeader
                columns={[
                  { label: "Chương trình", className: "min-w-72 px-5" },
                  { label: "Trường" },
                  { label: "Dữ liệu liên quan" },
                  { label: "Thao tác", className: "text-right" },
                ]}
                className="bg-muted/55"
              />
              <TableBody>
                {data.map((program) => (
                  <TableRow key={program.id}>
                    <TableCell className="px-5">
                      <div className="font-medium">{program.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {program.code}
                      </div>
                      <Badge
                        className="mt-2"
                        variant={
                          program.status === "active" ? "default" : "outline"
                        }
                      >
                        {statusLabels[program.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {program.institutionName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {program.counts.total} tổng
                        </Badge>
                        <Badge variant="outline">
                          {program.counts.leads} lead
                        </Badge>
                        <Badge variant="outline">
                          {program.counts.admissions} hồ sơ
                        </Badge>
                        <Badge variant="outline">
                          {program.counts.students} SV
                        </Badge>
                        <Badge variant="outline">
                          {program.counts.majors} ngành
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateMutation.reset();
                            setDialog({ type: "edit", program });
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={program.counts.total > 0}
                          onClick={() => {
                            deleteMutation.reset();
                            setDialog({ type: "delete", program });
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
