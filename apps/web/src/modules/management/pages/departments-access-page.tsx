import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedDepartment,
  deleteManagedDepartment,
  getDepartmentManagementOptions,
  getManagedDepartments,
  updateManagedDepartment,
} from "@/services/department-management.service";
import type { DepartmentInput, DepartmentUserOption, ManagedDepartment } from "../department-management.types";

const pageSize = 20;
const emptyFilters = { search: "" };
const emptyForm: DepartmentInput = { name: "", code: "", managerId: "", memberIds: [] };
const noManagerValue = "__none__";

type DialogState =
  | { type: "create" }
  | { type: "edit"; department: ManagedDepartment }
  | { type: "delete"; department: ManagedDepartment }
  | null;

export function DepartmentsAccessPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingDepartment = dialog?.type === "edit" ? dialog.department : null;
  const deletingDepartment = dialog?.type === "delete" ? dialog.department : null;

  const listQuery = useQuery({
    queryKey: ["departments", "management", page, appliedFilters],
    queryFn: () =>
      getManagedDepartments(
        { page, limit: pageSize, sortBy: "name", sortOrder: "asc", ...appliedFilters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["departments", "management", "options"],
    queryFn: () => getDepartmentManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: DepartmentInput) => createManagedDepartment(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["departments", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: DepartmentInput) => updateManagedDepartment(editingDepartment!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["departments", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteManagedDepartment(deletingDepartment!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["departments", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
    },
  });

  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản lý phòng ban"
        scopeLabel="Quyền quản trị"
        description="Tạo phòng ban, chỉ định trưởng phòng và quản lý thành viên dùng cho scope dữ liệu, phân công lead và vận hành CRM."
        actions={
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />
            Thêm phòng ban
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
            Bộ lọc phòng ban
          </CardTitle>
          <CardDescription>Tìm theo tên, mã phòng ban hoặc tên trưởng phòng.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ search: filters.search.trim() });
              setPage(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="department-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="department-search" className="pl-9" value={filters.search} onChange={(event) => setFilters({ search: event.target.value })} placeholder="Tên, mã hoặc trưởng phòng" />
              </div>
            </Field>
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }}>
              Xóa lọc
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Danh sách phòng ban</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} phòng ban` : "Đang lấy dữ liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách phòng ban" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách phòng ban" />
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có phòng ban phù hợp" description="Thêm phòng ban mới hoặc điều chỉnh bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh sách phòng ban trong hệ thống</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-64 px-5">Phòng ban</TableHead>
                    <TableHead>Trưởng phòng</TableHead>
                    <TableHead>Thành viên</TableHead>
                    <TableHead>Lead phân công</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell className="px-5">
                        <div className="font-medium">{department.name}</div>
                        <div className="text-sm text-muted-foreground">{department.code ?? "Chưa có mã"}</div>
                      </TableCell>
                      <TableCell>
                        {department.manager ? (
                          <div>
                            <div className="font-medium">{department.manager.fullName}</div>
                            <div className="text-sm text-muted-foreground">{department.manager.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Chưa chỉ định</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">{department.memberCount} thành viên</Badge>
                          {department.members.slice(0, 2).map((member) => (
                            <Badge key={member.id} variant="secondary">{member.fullName}</Badge>
                          ))}
                          {department.members.length > 2 && <Badge variant="secondary">+{department.members.length - 2}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{department.leadAssignmentCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", department }); }}>
                            <Pencil aria-hidden="true" />
                            Sửa
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={department.memberCount > 0 || department.leadAssignmentCount > 0} onClick={() => { deleteMutation.reset(); setDialog({ type: "delete", department }); }}>
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

      {pagination && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft aria-hidden="true" />
              Trước
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>
              Sau
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialog?.type === "create" || dialog?.type === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingDepartment ? "Cập nhật phòng ban" : "Thêm phòng ban"}</DialogTitle>
            <DialogDescription>Chọn trưởng phòng và thành viên để áp dụng scope phòng ban đồng nhất trong hệ thống.</DialogDescription>
          </DialogHeader>
          <DepartmentForm
            initialValues={editingDepartment ? toFormValues(editingDepartment) : emptyForm}
            users={optionsQuery.data?.users ?? []}
            isPending={createMutation.isPending || updateMutation.isPending}
            error={createMutation.error ?? updateMutation.error}
            mode={editingDepartment ? "edit" : "create"}
            onSubmit={(input) => {
              if (editingDepartment) updateMutation.mutate(input);
              else createMutation.mutate(input);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa phòng ban</DialogTitle>
            <DialogDescription>
              Phòng ban "{deletingDepartment?.name}" sẽ bị xóa khỏi danh mục. Thao tác này chỉ thực hiện được khi phòng ban không còn thành viên và không có dữ liệu phân công lead.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa phòng ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toFormValues(department: ManagedDepartment): DepartmentInput {
  return {
    name: department.name,
    code: department.code ?? "",
    managerId: department.manager?.id ?? "",
    memberIds: department.members.map((member) => member.id),
  };
}

function DepartmentForm({
  initialValues,
  users,
  isPending,
  error,
  mode,
  onSubmit,
}: {
  initialValues: DepartmentInput;
  users: DepartmentUserOption[];
  isPending: boolean;
  error: Error | null;
  mode: "create" | "edit";
  onSubmit: (input: DepartmentInput) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof DepartmentInput, string>>>({});
  const selectedMemberNames = useMemo(
    () => users.filter((user) => values.memberIds.includes(user.id)).map((user) => user.fullName),
    [users, values.memberIds],
  );

  function toggleMember(userId: string) {
    setValues((current) => ({
      ...current,
      memberIds: current.memberIds.includes(userId)
        ? current.memberIds.filter((id) => id !== userId)
        : [...current.memberIds, userId],
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof DepartmentInput, string>> = {};
    if (values.name.trim().length < 2) nextErrors.name = "Tên phòng ban cần tối thiểu 2 ký tự.";
    if (values.code.trim() && values.code.trim().length < 2) nextErrors.code = "Mã phòng ban cần tối thiểu 2 ký tự.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({ ...values, name: values.name.trim(), code: values.code.trim(), memberIds: [...new Set(values.memberIds)] });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField id="department-name" label="Tên phòng ban *" value={values.name} error={errors.name} onChange={(name) => setValues((current) => ({ ...current, name }))} />
        <TextField id="department-code" label="Mã phòng ban" value={values.code} error={errors.code} onChange={(code) => setValues((current) => ({ ...current, code }))} placeholder="VD: SALE, MARKETING" />
        <Field>
          <FieldLabel htmlFor="department-manager">Trưởng phòng</FieldLabel>
          <Select
            value={values.managerId || noManagerValue}
            onValueChange={(managerId) =>
              setValues((current) => ({
                ...current,
                managerId: managerId === noManagerValue ? "" : managerId,
                memberIds: managerId === noManagerValue ? current.memberIds : [...new Set([...current.memberIds, managerId])],
              }))
            }
          >
            <SelectTrigger id="department-manager" className="w-full"><SelectValue placeholder="Chọn trưởng phòng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={noManagerValue}>Chưa chỉ định</SelectItem>
              {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName} - {user.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <fieldset className="grid gap-3 rounded-md border p-4">
        <div>
          <legend className="flex items-center gap-2 text-sm font-medium">
            <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
            Thành viên
          </legend>
          <p className="text-sm text-muted-foreground">
            {selectedMemberNames.length > 0 ? `Đã chọn: ${selectedMemberNames.join(", ")}` : "Chọn người dùng thuộc phòng ban này."}
          </p>
        </div>
        <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {users.map((user) => (
            <label key={user.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
              <Checkbox checked={values.memberIds.includes(user.id)} onCheckedChange={() => toggleMember(user.id)} aria-label={`Chọn ${user.fullName}`} />
              <span className="min-w-0">
                <span className="block font-medium">{user.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : mode === "create" ? "Thêm phòng ban" : "Lưu thay đổi"}</Button>
      </DialogFooter>
    </form>
  );
}

function TextField({ id, label, value, error, onChange, placeholder }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={value} aria-invalid={Boolean(error)} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}
    </p>
  );
}
