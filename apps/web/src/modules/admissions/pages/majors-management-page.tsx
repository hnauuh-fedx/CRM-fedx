import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
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
import {
  createProgramMajor,
  deleteProgramMajor,
  getMajorManagementOptions,
  getProgramMajors,
  updateProgramMajor,
} from "@/services/major.service";
import type { ManagedMajor, MajorInput } from "../major-management.types";

const pageSize = 20;
const emptyMajorForm: MajorInput = { name: "", code: "", facultyId: "" };
const majorFormSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập tên ngành.").max(255),
  code: z.string().trim().min(2, "Vui lòng nhập mã ngành.").max(100),
  facultyId: z.string(),
});
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
type DialogState =
  | { type: "create" }
  | { type: "edit"; major: ManagedMajor }
  | { type: "delete"; major: ManagedMajor }
  | null;

export function MajorsManagementPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { programs, selectedProgramId } = useInstitutionProgram();
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingMajor = dialog?.type === "edit" ? dialog.major : null;
  const deletingMajor = dialog?.type === "delete" ? dialog.major : null;

  const listQuery = useQuery({
    queryKey: ["majors", "management", selectedProgramId, page, appliedSearch],
    queryFn: () => getProgramMajors({ page, limit: pageSize, search: appliedSearch, sortBy: "createdAt", sortOrder: "desc" }, auth.accessToken!),
    enabled: Boolean(selectedProgramId),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["majors", "management", "options"],
    queryFn: () => getMajorManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: MajorInput) => createProgramMajor(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] });
      void queryClient.invalidateQueries({ queryKey: ["admissions", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: MajorInput) => updateProgramMajor(editingMajor!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] });
      void queryClient.invalidateQueries({ queryKey: ["admissions", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteProgramMajor(deletingMajor!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["majors"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "action-options"] });
      void queryClient.invalidateQueries({ queryKey: ["admissions", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["students", "options"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Tuyển sinh"
        title="Quản lý ngành"
        scopeLabel={selectedProgram ? `${selectedProgram.institutionName} - ${selectedProgram.name}` : "Chương trình đang chọn"}
        description="Thêm, chỉnh sửa hoặc xóa ngành tuyển sinh trong chương trình đang làm việc."
        actions={
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />
            Thêm ngành
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Tìm ngành</CardTitle>
          <CardDescription>Danh sách được giới hạn theo chương trình đã chọn trên thanh công cụ.</CardDescription>
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
            <Field className="max-w-md flex-1">
              <FieldLabel htmlFor="major-management-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="major-management-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập tên hoặc mã ngành" />
              </div>
            </Field>
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); }}>
              Xóa lọc
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Ngành thuộc chương trình</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} ngành` : "Đang lấy dữ liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách ngành" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách ngành" />
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có ngành phù hợp" description="Thêm ngành mới hoặc điều chỉnh từ khóa tìm kiếm." />
          ) : (
            <Table>
              <caption className="sr-only">Danh sách ngành theo chương trình</caption>
              <TableHeader className="bg-muted/55">
                <TableRow>
                  <TableHead className="px-5">Mã ngành</TableHead>
                  <TableHead>Tên ngành</TableHead>
                  <TableHead>Khoa</TableHead>
                  <TableHead>Đang sử dụng</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((major) => (
                  <TableRow key={major.id}>
                    <TableCell className="px-5 font-medium">{major.code ?? "-"}</TableCell>
                    <TableCell>{major.name}</TableCell>
                    <TableCell>{major.facultyName ?? "-"}</TableCell>
                    <TableCell>{major.leadCount} lead / {major.admissionCount} hồ sơ / {major.studentCount} SV</TableCell>
                    <TableCell>{major.createdAt ? dateFormatter.format(new Date(major.createdAt)) : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", major }); }} aria-label={`Sửa ngành ${major.name}`}>
                          <Pencil aria-hidden="true" />
                          Sửa
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { deleteMutation.reset(); setDialog({ type: "delete", major }); }} aria-label={`Xóa ngành ${major.name}`}>
                          <Trash2 aria-hidden="true" />
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-4 text-sm">
            <p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft aria-hidden="true" />
                Trước
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>
                Sau
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={dialog?.type === "create"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm ngành</DialogTitle>
            <DialogDescription>Ngành mới sẽ thuộc chương trình đang làm việc.</DialogDescription>
          </DialogHeader>
          <MajorForm
            defaultValues={emptyMajorForm}
            options={optionsQuery.data?.faculties ?? []}
            isPending={createMutation.isPending}
            error={createMutation.error}
            submitLabel="Thêm ngành"
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMajor)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa ngành</DialogTitle>
            <DialogDescription>Cập nhật tên, mã hoặc khoa phụ trách của ngành.</DialogDescription>
          </DialogHeader>
          {editingMajor && (
            <MajorForm
              defaultValues={{ name: editingMajor.name, code: editingMajor.code ?? "", facultyId: editingMajor.facultyId ?? "" }}
              options={optionsQuery.data?.faculties ?? []}
              isPending={updateMutation.isPending}
              error={updateMutation.error}
              submitLabel="Lưu thay đổi"
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingMajor)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa ngành</DialogTitle>
            <DialogDescription>
              {deletingMajor ? `Bạn có chắc muốn xóa ngành "${deletingMajor.name}"? Ngành đang được sử dụng sẽ không thể xóa.` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa ngành"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MajorForm({
  defaultValues,
  options,
  isPending,
  error,
  submitLabel,
  onSubmit,
}: {
  defaultValues: MajorInput;
  options: Array<{ id: string; name: string }>;
  isPending: boolean;
  error: Error | null;
  submitLabel: string;
  onSubmit: (values: MajorInput) => void;
}) {
  const form = useForm<MajorInput>({ defaultValues });
  useEffect(() => form.reset(defaultValues), [defaultValues, form]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const parsed = majorFormSchema.safeParse(values);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) => {
            form.setError(issue.path[0] as keyof MajorInput, { message: issue.message });
          });
          return;
        }
        onSubmit(parsed.data);
      })}
    >
      {error && <MutationError error={error} />}
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor="major-code">Mã ngành *</FieldLabel>
          <Input id="major-code" placeholder="Ví dụ: 7480201" aria-invalid={Boolean(form.formState.errors.code)} {...form.register("code")} />
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="major-name">Tên ngành *</FieldLabel>
          <Input id="major-name" placeholder="Nhập tên ngành" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="major-faculty">Khoa phụ trách</FieldLabel>
          <Select value={form.watch("facultyId") || "__empty__"} onValueChange={(value) => form.setValue("facultyId", value === "__empty__" ? "" : value)}>
            <SelectTrigger id="major-faculty" className="w-full">
              <SelectValue placeholder="Chọn khoa phụ trách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">Chưa xác định</SelectItem>
              {options.map((faculty) => <SelectItem key={faculty.id} value={faculty.id}>{faculty.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
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
