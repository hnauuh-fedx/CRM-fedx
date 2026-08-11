import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, UsersRound } from "lucide-react";
import { z } from "zod";

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
  createManagedUser,
  getManagedUsers,
  getUserManagementOptions,
  updateManagedUser,
} from "@/services/user-management.service";
import type { AccessScope, ManagedUser, UserManagementInput } from "../user-management.types";

const pageSize = 20;
const emptyFilters = { search: "", status: "", roleId: "", departmentId: "" };
const emptyForm: UserManagementInput = {
  fullName: "",
  email: "",
  phone: "",
  status: "active",
  password: "",
  roleIds: [],
  departmentIds: [],
  accessScope: "DEPARTMENT",
};

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên.").max(255),
  email: z.email("Email không hợp lệ.").max(255),
  phone: z.string().trim().max(30, "Số điện thoại quá dài."),
  status: z.enum(["active", "inactive", "suspended"]),
  password: z.string().max(100),
  roleIds: z.array(z.uuid()).min(1, "Vui lòng chọn ít nhất một vai trò."),
  departmentIds: z.array(z.uuid()),
  accessScope: z.enum(["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"]),
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const statusLabels = {
  active: "Đang hoạt động",
  inactive: "Tạm khóa",
  suspended: "Đình chỉ",
} as const;
const scopeLabels: Record<AccessScope, string> = {
  ALL: "Toàn hệ thống",
  DEPARTMENT: "Theo phòng ban",
  ASSIGNED_ONLY: "Lead được giao",
  OWNED_ONLY: "Dữ liệu tự tạo",
  READ_ONLY: "Chỉ xem",
};

type DialogState = { type: "create" } | { type: "edit"; user: ManagedUser } | null;

export function UsersAccessPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingUser = dialog?.type === "edit" ? dialog.user : null;

  const listQuery = useQuery({
    queryKey: ["users", "management", page, appliedFilters],
    queryFn: () => getManagedUsers({ page, limit: pageSize, sortBy: "createdAt", sortOrder: "desc", ...appliedFilters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["users", "management", "options"],
    queryFn: () => getUserManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: UserManagementInput) => createManagedUser(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: UserManagementInput) => updateManagedUser(editingUser!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản lý người dùng"
        scopeLabel="Quyền quản trị"
        description="Tạo tài khoản, cập nhật vai trò, phòng ban và phạm vi truy cập cho đội ngũ vận hành tuyển sinh."
        actions={
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />
            Thêm người dùng
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="size-5 text-muted-foreground" aria-hidden="true" />
            Bộ lọc người dùng
          </CardTitle>
          <CardDescription>Tìm nhanh theo tên, email, số điện thoại, vai trò hoặc phòng ban.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_220px_220px_auto_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ ...filters, search: filters.search.trim() });
              setPage(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="user-management-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="user-management-search" className="pl-9" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="Tên, email hoặc số điện thoại" />
              </div>
            </Field>
            <FilterSelect label="Trạng thái" value={filters.status} onValueChange={(status) => setFilters((value) => ({ ...value, status }))} options={[
              { value: "active", label: statusLabels.active },
              { value: "inactive", label: statusLabels.inactive },
              { value: "suspended", label: statusLabels.suspended },
            ]} />
            <FilterSelect label="Vai trò" value={filters.roleId} onValueChange={(roleId) => setFilters((value) => ({ ...value, roleId }))} options={(optionsQuery.data?.roles ?? []).map((role) => ({ value: role.id, label: `${role.name} (${role.code})` }))} />
            <FilterSelect label="Phòng ban" value={filters.departmentId} onValueChange={(departmentId) => setFilters((value) => ({ ...value, departmentId }))} options={(optionsQuery.data?.departments ?? []).map((department) => ({ value: department.id, label: department.name }))} />
            <Button type="submit">Áp dụng</Button>
            <Button type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }}>
              Xóa lọc
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Danh sách tài khoản</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} người dùng` : "Đang lấy dữ liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách người dùng" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách người dùng" />
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có người dùng phù hợp" description="Thêm tài khoản mới hoặc điều chỉnh bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh sách người dùng hệ thống</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-56 px-5">Người dùng</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Phòng ban</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Đăng nhập gần nhất</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="px-5">
                        <div className="font-medium">{user.fullName}</div>
                        <div className="text-sm text-muted-foreground">{user.email}{user.phone ? ` - ${user.phone}` : ""}</div>
                      </TableCell>
                      <TableCell><BadgeList values={user.roles.map((role) => role.name)} emptyText="Chưa gán vai trò" /></TableCell>
                      <TableCell><BadgeList values={user.departments.map((department) => department.name)} emptyText="Chưa gán phòng ban" /></TableCell>
                      <TableCell>{scopeLabels[user.accessScope]}</TableCell>
                      <TableCell><Badge variant={user.status === "active" ? "secondary" : "outline"}>{statusLabels[user.status]}</Badge></TableCell>
                      <TableCell>{user.lastLoginAt ? dateFormatter.format(new Date(user.lastLoginAt)) : "Chưa đăng nhập"}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", user }); }} aria-label={`Sửa người dùng ${user.fullName}`}>
                          <Pencil aria-hidden="true" />
                          Sửa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Thêm người dùng</DialogTitle>
            <DialogDescription>Tạo tài khoản đăng nhập và gán quyền vận hành ban đầu.</DialogDescription>
          </DialogHeader>
          {dialog?.type === "create" && (
            <UserForm
              key="create-user"
              mode="create"
              defaultValues={emptyForm}
              options={optionsQuery.data}
              error={createMutation.error}
              isPending={createMutation.isPending}
              onSubmit={(values) => createMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
            <DialogDescription>Cập nhật thông tin tài khoản, role, phòng ban và scope.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <UserForm
              key={editingUser.id}
              mode="edit"
              defaultValues={{
                fullName: editingUser.fullName,
                email: editingUser.email,
                phone: editingUser.phone ?? "",
                status: editingUser.status,
                password: "",
                roleIds: editingUser.roles.map((role) => role.id),
                departmentIds: editingUser.departments.map((department) => department.id),
                accessScope: editingUser.accessScope,
              }}
              options={optionsQuery.data}
              error={updateMutation.error}
              isPending={updateMutation.isPending}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({ label, value, options, onValueChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onValueChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value || "__all__"} onValueChange={(nextValue) => onValueChange(nextValue === "__all__" ? "" : nextValue)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Chọn ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tất cả</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function BadgeList({ values, emptyText }: { values: string[]; emptyText: string }) {
  if (values.length === 0) return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  return (
    <div className="flex max-w-72 flex-wrap gap-1.5">
      {values.map((value) => <Badge key={value} variant="outline">{value}</Badge>)}
    </div>
  );
}

function UserForm({
  mode,
  defaultValues,
  options,
  isPending,
  error,
  onSubmit,
}: {
  mode: "create" | "edit";
  defaultValues: UserManagementInput;
  options?: Awaited<ReturnType<typeof getUserManagementOptions>>;
  isPending: boolean;
  error: Error | null;
  onSubmit: (values: UserManagementInput) => void;
}) {
  const [values, setValues] = useState(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roleOptions = options?.roles ?? [];
  const departmentOptions = options?.departments ?? [];
  const scopeOptions = options?.scopes ?? ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"];
  const selectedRoleNames = roleOptions.reduce<string[]>((names, role) => {
    if (values.roleIds.includes(role.id)) names.push(role.name);
    return names;
  }, []);

  function toggle(listName: "roleIds" | "departmentIds", id: string) {
    setValues((current) => {
      const currentList = current[listName];
      return {
        ...current,
        [listName]: currentList.includes(id) ? currentList.filter((item) => item !== id) : [...currentList, id],
      };
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = formSchema.safeParse(values);
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
          return;
        }
        if (mode === "create" && parsed.data.password.length < 8) {
          setErrors({ password: "Vui lòng nhập mật khẩu ban đầu tối thiểu 8 ký tự." });
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField id="user-full-name" label="Họ và tên *" value={values.fullName} error={errors.fullName} onChange={(fullName) => setValues((current) => ({ ...current, fullName }))} />
        <TextField id="user-email" label="Email *" type="email" value={values.email} error={errors.email} onChange={(email) => setValues((current) => ({ ...current, email }))} />
        <TextField id="user-phone" label="Số điện thoại" value={values.phone} error={errors.phone} onChange={(phone) => setValues((current) => ({ ...current, phone }))} />
        <Field>
          <FieldLabel htmlFor="user-status">Trạng thái</FieldLabel>
          <Select value={values.status} onValueChange={(status: UserManagementInput["status"]) => setValues((current) => ({ ...current, status }))}>
            <SelectTrigger id="user-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{statusLabels.active}</SelectItem>
              <SelectItem value="inactive">{statusLabels.inactive}</SelectItem>
              <SelectItem value="suspended">{statusLabels.suspended}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <TextField id="user-password" label={mode === "create" ? "Mật khẩu ban đầu *" : "Mật khẩu mới"} type="password" value={values.password} error={errors.password} onChange={(password) => setValues((current) => ({ ...current, password }))} placeholder={mode === "edit" ? "Để trống nếu không đổi" : undefined} />
        <Field data-invalid={Boolean(errors.accessScope)}>
          <FieldLabel htmlFor="user-scope">Scope truy cập *</FieldLabel>
          <Select value={values.accessScope} onValueChange={(accessScope: AccessScope) => setValues((current) => ({ ...current, accessScope }))}>
            <SelectTrigger id="user-scope" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scopeOptions.map((scope) => <SelectItem key={scope} value={scope}>{scopeLabels[scope]}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError>{errors.accessScope}</FieldError>
        </Field>
      </FieldGroup>

      <SelectionGroup
        title="Vai trò *"
        description={selectedRoleNames.length > 0 ? `Đã chọn: ${selectedRoleNames.join(", ")}` : "Chọn role để cấp permission cho tài khoản."}
        error={errors.roleIds}
        items={roleOptions.map((role) => ({ id: role.id, label: role.name, description: role.code }))}
        selectedIds={values.roleIds}
        onToggle={(id) => toggle("roleIds", id)}
      />
      <SelectionGroup
        title="Phòng ban / phạm vi dữ liệu"
        description="Dùng cho scope phòng ban và các luồng phân công lead."
        items={departmentOptions.map((department) => ({ id: department.id, label: department.name, description: department.code ?? "" }))}
        selectedIds={values.departmentIds}
        onToggle={(id) => toggle("departmentIds", id)}
      />

      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : mode === "create" ? "Thêm người dùng" : "Lưu thay đổi"}</Button>
      </DialogFooter>
    </form>
  );
}

function TextField({ id, label, value, error, onChange, type = "text", placeholder }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} value={value} aria-invalid={Boolean(error)} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function SelectionGroup({ title, description, items, selectedIds, error, onToggle }: { title: string; description: string; items: Array<{ id: string; label: string; description: string }>; selectedIds: string[]; error?: string; onToggle: (id: string) => void }) {
  return (
    <fieldset className="grid gap-3 rounded-md border p-4">
      <div>
        <legend className="text-sm font-medium">{title}</legend>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
            <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => onToggle(item.id)} aria-label={`Chọn ${item.label}`} />
            <span className="min-w-0">
              <span className="block font-medium">{item.label}</span>
              {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof ApiError ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại."}
    </p>
  );
}
