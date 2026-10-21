import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
const pageSize = 20;
import { StaticTableHeader } from "@/components/shared/static-table-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
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
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { ApiError } from "@/services/api";
import {
  createProgramMajor,
  deleteProgramMajor,
  getProgramMajors,
  updateProgramMajor,
} from "@/services/major.service";
import type { MajorInput, ManagedMajor } from "../major-management.types";
const emptyMajorForm: MajorInput = { name: "", code: "" };
const majorFormSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập tên ngành.").max(255),
  code: z.string().trim().min(2, "Vui lòng nhập mã ngành.").max(100),
});
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
type DialogState =
  | { type: "create" }
  | { type: "edit"; major: ManagedMajor }
  | { type: "delete"; major: ManagedMajor }
  | null;

export function MajorsManagementPage() {
  const { selectedProgramId } = useInstitutionProgram();
  return <ProgramMajorsManagement key={selectedProgramId ?? "no-program"} />;
}

function ProgramMajorsManagement() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const {
    programs,
    selectedProgramId,
    selectProgram,
    isLoading: programsLoading,
  } = useInstitutionProgram();
  const selectedProgram = programs.find(
    (program) => program.id === selectedProgramId,
  );
  const programLabel = selectedProgram
    ? `${selectedProgram.institutionName} – ${selectedProgram.name} – ${selectedProgram.code}`
    : "Chưa chọn chương trình";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingMajor = dialog?.type === "edit" ? dialog.major : null;
  const deletingMajor = dialog?.type === "delete" ? dialog.major : null;

  const listQuery = useQuery({
    queryKey: ["majors", "management", selectedProgramId, page, appliedSearch],
    queryFn: () =>
      getProgramMajors(
        {
          page,
          limit: pageSize,
          search: appliedSearch,
          sortBy: "createdAt",
          sortOrder: "desc",
        },
        auth.accessToken!,
        selectedProgramId!,
      ),
    enabled: Boolean(selectedProgramId),
  });
  const createMutation = useMutation({
    mutationFn: (input: MajorInput) =>
      createProgramMajor(input, auth.accessToken!, selectedProgramId!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({
        queryKey: ["leads", "action-options"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admissions", "options"],
      });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: MajorInput) =>
      updateProgramMajor(
        editingMajor!.id,
        input,
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({
        queryKey: ["leads", "action-options"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admissions", "options"],
      });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteProgramMajor(
        deletingMajor!.id,
        auth.accessToken!,
        selectedProgramId!,
      ),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({
        queryKey: ["leads", "action-options"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admissions", "options"],
      });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Quản lý"
        title="Quản lý ngành"
        scopeLabel={programLabel}
        description="Thêm, chỉnh sửa hoặc xóa ngành tuyển sinh trong chương trình đang làm việc."
        actions={
          <Button
            type="button"
            disabled={!selectedProgram}
            onClick={() => {
              createMutation.reset();
              setDialog({ type: "create" });
            }}
          >
            <Plus aria-hidden="true" />
            Thêm ngành
          </Button>
        }
      />

      <MajorFilters
        setAppliedSearch={setAppliedSearch}
        search={search}
        setPage={setPage}
        selectedProgramId={selectedProgramId}
        selectProgram={selectProgram}
        programsLoading={programsLoading}
        programs={programs}
        programLabel={programLabel}
        setSearch={setSearch}
      />

      <MajorResults
        selectedProgram={selectedProgram}
        pagination={pagination}
        data={data}
        programsLoading={programsLoading}
        listQuery={listQuery}
        updateMutation={updateMutation}
        setDialog={setDialog}
        deleteMutation={deleteMutation}
        page={page}
        setPage={setPage}
      />

      <Dialog
        open={dialog?.type === "create"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm ngành</DialogTitle>
            <DialogDescription>
              Ngành mới sẽ thuộc chương trình được hiển thị bên dưới.
            </DialogDescription>
          </DialogHeader>
          <MajorForm
            entityId={undefined}
            programLabel={programLabel}
            defaultValues={emptyMajorForm}
            isPending={createMutation.isPending}
            error={createMutation.error}
            submitLabel="Thêm ngành"
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingMajor)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa ngành</DialogTitle>
            <DialogDescription>Cập nhật tên và mã ngành.</DialogDescription>
          </DialogHeader>
          {editingMajor && (
            <MajorForm
              entityId={editingMajor.id}
              programLabel={programLabel}
              defaultValues={{
                name: editingMajor.name,
                code: editingMajor.code ?? "",
              }}
              isPending={updateMutation.isPending}
              error={updateMutation.error}
              submitLabel="Lưu thay đổi"
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingMajor)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa ngành</DialogTitle>
            <DialogDescription>
              {deletingMajor
                ? `Bạn có chắc muốn xóa ngành "${deletingMajor.name}" thuộc ${programLabel}? Ngành đang được sử dụng sẽ không thể xóa.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && (
            <MutationError error={deleteMutation.error} />
          )}
          <DialogFooter showCloseButton>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa ngành"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageLoadingBoundary>
  );
}

type MajorFormProps = {
  entityId?: string;
  programLabel: string;
  defaultValues: MajorInput;
  isPending: boolean;
  error: Error | null;
  submitLabel: string;
  onSubmit: (values: MajorInput) => void;
};

function MajorForm({
  entityId,
  programLabel,
  defaultValues,
  isPending,
  error,
  submitLabel,
  onSubmit,
}: MajorFormProps) {
  const form = useForm<MajorInput>({ defaultValues });
  useEffect(() => form.reset(defaultValues), [defaultValues, form]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const parsed = majorFormSchema.safeParse(values);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) => {
            form.setError(issue.path[0] as keyof MajorInput, {
              message: issue.message,
            });
          });
          return;
        }
        onSubmit({
          ...parsed.data,
          customFieldValues: form.getValues("customFieldValues"),
        });
      })}
    >
      {error && <MutationError error={error} />}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="major-program">
            Chương trình tuyển sinh liên kết
          </FieldLabel>
          <Input
            id="major-program"
            value={programLabel}
            readOnly
            title={programLabel}
          />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor="major-code">Mã ngành *</FieldLabel>
          <Input
            id="major-code"
            placeholder="Ví dụ: 7480201"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register("code")}
          />
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="major-name">Tên ngành *</FieldLabel>
          <Input
            id="major-name"
            placeholder="Nhập tên ngành"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register("name")}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
      </FieldGroup>
      <RuntimeCustomFieldsSection
        entityType="ADMISSION_MAJOR"
        entityId={entityId}
        disabled={isPending}
        onChange={(values) => form.setValue("customFieldValues", values)}
      />
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lưu..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
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

type MajorResultsProps = {
  selectedProgram:
    | import("@/modules/institutions/institution-program-context").InstitutionProgramOption
    | undefined;
  pagination:
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;
  data: ManagedMajor[];
  programsLoading: boolean;
  listQuery: import("@tanstack/react-query").UseQueryResult<
    NoInfer<import("../major-management.types").MajorListResponse>,
    Error
  >;
  updateMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    MajorInput,
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
  page: number;
  setPage: import("react").Dispatch<import("react").SetStateAction<number>>;
};

function MajorResults({
  selectedProgram,
  pagination,
  data,
  programsLoading,
  listQuery,
  updateMutation,
  setDialog,
  deleteMutation,
  page,
  setPage,
}: MajorResultsProps) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>
          {selectedProgram
            ? `Ngành thuộc chương trình ${selectedProgram.name}`
            : "Ngành thuộc chương trình"}
        </CardTitle>
        {selectedProgram && (
          <CardDescription>
            {selectedProgram.institutionName} · Mã chương trình:{" "}
            {selectedProgram.code}
          </CardDescription>
        )}
        <CardDescription>
          {pagination
            ? `Hiển thị ${data.length} trong tổng số ${pagination.total} ngành`
            : "Đang lấy dữ liệu..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <MajorResultsContent
          selectedProgram={selectedProgram}
          programsLoading={programsLoading}
          listQuery={listQuery}
          data={data}
          updateMutation={updateMutation}
          setDialog={setDialog}
          deleteMutation={deleteMutation}
        />
      </CardContent>
      {pagination && pagination.totalPages > 1 && (
        <TablePagination
          page={page}
          pagination={pagination}
          isFetching={false}
          className="flex items-center justify-between border-t px-5 py-4 text-sm"
          labels={{ previous: "Trước", next: "Sau" }}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => value + 1)}
        />
      )}
    </Card>
  );
}

type MajorTableRowProps = {
  major: ManagedMajor;
  updateMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    MajorInput,
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

function MajorTableRow({
  major,
  updateMutation,
  setDialog,
  deleteMutation,
}: MajorTableRowProps) {
  return (
    <TableRow key={major.id}>
      <TableCell className="px-3 font-medium">{major.code ?? "-"}</TableCell>
      <TableCell>{major.name}</TableCell>
      <TableCell>
        {major.leadCount} lead / {major.admissionCount} hồ sơ /{" "}
        {major.studentCount} SV
      </TableCell>
      <TableCell>
        {major.createdAt
          ? dateFormatter.format(new Date(major.createdAt))
          : "-"}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              updateMutation.reset();
              setDialog({ type: "edit", major });
            }}
            aria-label={`Sửa ngành ${major.name}`}
          >
            <Pencil aria-hidden="true" />
            Sửa
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              deleteMutation.reset();
              setDialog({ type: "delete", major });
            }}
            aria-label={`Xóa ngành ${major.name}`}
          >
            <Trash2 aria-hidden="true" />
            Xóa
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type MajorResultsContentProps = {
  selectedProgram:
    | import("@/modules/institutions/institution-program-context").InstitutionProgramOption
    | undefined;
  programsLoading: boolean;
  listQuery: import("@tanstack/react-query").UseQueryResult<
    NoInfer<import("../major-management.types").MajorListResponse>,
    Error
  >;
  data: ManagedMajor[];
  updateMutation: import("@tanstack/react-query").UseMutationResult<
    { id: string },
    Error,
    MajorInput,
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

function MajorResultsContent({
  selectedProgram,
  programsLoading,
  listQuery,
  data,
  updateMutation,
  setDialog,
  deleteMutation,
}: MajorResultsContentProps) {
  if (!selectedProgram && !programsLoading)
    return (
      <EmptyState
        title="Chưa có chương trình để quản lý ngành"
        description="Bạn cần được cấp quyền truy cập một chương trình tuyển sinh trước khi quản lý ngành."
      />
    );
  if (listQuery.isError)
    return (
      <ErrorState
        title="Không thể tải danh sách ngành"
        description="Vui lòng thử lại để cập nhật dữ liệu."
        onReload={() => listQuery.refetch()}
      />
    );
  if (programsLoading || listQuery.isLoading)
    return <TableLoadingState label="Đang tải danh sách ngành" />;
  if (data.length === 0)
    return (
      <EmptyState
        title="Chưa có ngành phù hợp"
        description="Thêm ngành mới hoặc điều chỉnh từ khóa tìm kiếm."
      />
    );
  return (
    <Table>
      <caption className="sr-only">Danh sách ngành theo chương trình</caption>
      <StaticTableHeader
        columns={[
          { label: "Mã ngành", className: "px-5" },
          { label: "Tên ngành" },
          { label: "Đang sử dụng" },
          { label: "Ngày tạo" },
          { label: "Thao tác", className: "text-right" },
        ]}
        className="bg-muted/55"
      />
      <TableBody>
        {data.map((major) => (
          <MajorTableRow
            key={major.id}
            major={major}
            updateMutation={updateMutation}
            setDialog={setDialog}
            deleteMutation={deleteMutation}
          />
        ))}
      </TableBody>
    </Table>
  );
}

type MajorFiltersProps = {
  setAppliedSearch: import("react").Dispatch<
    import("react").SetStateAction<string>
  >;
  search: string;
  setPage: import("react").Dispatch<import("react").SetStateAction<number>>;
  selectedProgramId: string | null;
  selectProgram: (programId: string) => boolean;
  programsLoading: boolean;
  programs: import("@/modules/institutions/institution-program-context").InstitutionProgramOption[];
  programLabel: string;
  setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
};

function MajorFilters({
  setAppliedSearch,
  search,
  setPage,
  selectedProgramId,
  selectProgram,
  programsLoading,
  programs,
  programLabel,
  setSearch,
}: MajorFiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Chương trình tuyển sinh và bộ lọc</CardTitle>
        <CardDescription>
          Chọn chương trình để quản lý các ngành thuộc chương trình đó. Lựa chọn
          này đồng bộ với chương trình đang làm việc trên thanh trên cùng.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="major-management-program">
              Chương trình tuyển sinh
            </FieldLabel>
            <Select
              value={selectedProgramId ?? ""}
              onValueChange={selectProgram}
              disabled={programsLoading || programs.length === 0}
            >
              <SelectTrigger
                id="major-management-program"
                className="w-full min-w-0"
                title={programLabel}
              >
                <SelectValue
                  placeholder={
                    programsLoading
                      ? "Đang tải chương trình…"
                      : "Chọn chương trình tuyển sinh"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.institutionName} – {program.name} –{" "}
                      {program.code}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="min-w-0 flex-1 sm:max-w-sm">
            <FieldLabel htmlFor="major-management-search">Tìm kiếm</FieldLabel>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="major-management-search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nhập tên hoặc mã ngành"
              />
            </div>
          </Field>
          <AutoFilterActions
            snapshot={{ search }}
            onApply={() => {
              setAppliedSearch(search.trim());
              setPage(1);
            }}
            onReset={() => {
              setSearch("");
              setAppliedSearch("");
              setPage(1);
            }}
          />
        </form>
      </CardContent>
    </Card>
  );
}
