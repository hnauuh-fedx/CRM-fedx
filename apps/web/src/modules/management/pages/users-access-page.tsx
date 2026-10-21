import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import { TablePagination } from "@/components/shared/table-pagination";
import { isAccessScopeWithinRole, resolveEffectiveAccessScope } from "@admission-crm/shared/access-scope";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UsersRound } from "lucide-react";
import { z } from "zod";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";

import { EmptyState } from "@/components/shared/data-states";
import { AutoFilterActions } from "@/components/shared/auto-filter-actions";
import { ErrorState } from "@/components/shared/error-state";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedUser,
  getManagedUsers,
  getUserManagementOptions,
  updateManagedUser,
} from "@/services/user-management.service";
import type {
  AccessScope,
  ManagedUser,
  UserManagementInput,
} from "../user-management.types";
const pageSize = 20;
const emptyFilters = { search: "", status: "", roleId: "", departmentId: "" };
const emptyForm: UserManagementInput = {
  fullName: "",
  email: "",
  phone: "",
  status: "active",
  password: "",
  programAssignments: [],
  departmentIds: [],
  accessScope: "DEPARTMENT",
};

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên.").max(255),
  email: z.email("Email không hợp lệ.").max(255),
  phone: z.string().trim().max(30, "Số điện thoại quá dài."),
  status: z.enum(["active", "inactive", "suspended"]),
  password: z.string().max(100),
  programAssignments: z.array(z.object({
    institutionProgramId: z.uuid(),
    roleId: z.uuid("Vui lòng chọn một vai trò cho mỗi chương trình đã tích."),
  })).min(1, "Vui lòng chọn ít nhất một chương trình."),
  departmentIds: z.array(z.uuid()),
  accessScope: z.enum([
    "ALL",
    "DEPARTMENT",
    "ASSIGNED_ONLY",
    "OWNED_ONLY",
    "READ_ONLY",
  ]),
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

type DialogState =
  | { type: "create" }
  | { type: "edit"; user: ManagedUser }
  | null;

export function UsersAccessPage() {
  const auth = useAuth();
  const { selectedProgramId, selectProgram } = useInstitutionProgram();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingUser = dialog?.type === "edit" ? dialog.user : null;

  const listQuery = useQuery({
    queryKey: ["users", "management", selectedProgramId, page, appliedFilters],
    queryFn: () => getManagedUsers({ page, limit: pageSize, sortBy: "createdAt", sortOrder: "desc", ...appliedFilters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["users", "management", "options", selectedProgramId],
    queryFn: () => getUserManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: UserManagementInput) =>
      createManagedUser(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: UserManagementInput) => updateManagedUser(editingUser!.id, input, auth.accessToken!),
    onSuccess: (_response, input) => {
      if (editingUser?.id === auth.user?.id) {
        if (!input.programAssignments.some((grant) => grant.institutionProgramId === selectedProgramId)) {
          selectProgram(input.programAssignments[0]!.institutionProgramId);
        }
        void queryClient.invalidateQueries({ queryKey: ["institution-programs", "options"] });
      }
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["users", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <PageLoadingBoundary variant="list" queries={[listQuery, optionsQuery]}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản lý người dùng"
        scopeLabel="Quyền quản trị"
        description="Tạo tài khoản, cập nhật vai trò, phòng ban và phạm vi truy cập cho đội ngũ vận hành tuyển sinh."
        actions={
          <Button
            type="button"
            onClick={() => {
              createMutation.reset();
              setDialog({ type: "create" });
            }}
          >
            <Plus aria-hidden="true" />
            Thêm người dùng
          </Button>
        }
      />

      <UserFilters
        setAppliedFilters={setAppliedFilters}
        filters={filters}
        setPage={setPage}
        setFilters={setFilters}
        optionsQuery={optionsQuery}
      />

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Danh sách tài khoản</CardTitle>
          <CardDescription>
            {pagination
              ? `Hiển thị ${data.length} trong tổng số ${pagination.total} người dùng`
              : "Đang lấy dữ liệu..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState
              title="Không thể tải danh sách người dùng"
              description="Vui lòng thử lại để cập nhật dữ liệu."
              onReload={() => listQuery.refetch()}
            />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách người dùng" />
          ) : data.length === 0 ? (
            <EmptyState
              title="Chưa có người dùng phù hợp"
              description="Thêm tài khoản mới hoặc điều chỉnh bộ lọc hiện tại."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh sách người dùng hệ thống</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-56 px-3">Người dùng</TableHead>
                    <TableHead>Chương trình / vai trò</TableHead>
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
                      <TableCell className="px-3">
                        <div className="font-medium">{user.fullName}</div>
                        <div className="text-sm text-muted-foreground">
                          {user.email}
                          {user.phone ? ` - ${user.phone}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <BadgeList
                          values={user.roles.map((role) => role.name)}
                          emptyText="Chưa gán vai trò"
                        />
                      </TableCell>
                      <TableCell>
                        <BadgeList
                          values={user.departments.map(
                            (department) => department.name,
                          )}
                          emptyText="Chưa gán phòng ban"
                        />
                      </TableCell>
                      <TableCell><BadgeList values={user.programAssignments.map((grant) => `${grant.institutionName} - ${grant.programName}: ${grant.roleName}`)} emptyText="Chưa gán vai trò" /></TableCell>
                      <TableCell><BadgeList values={user.departments.map((department) => department.name)} emptyText="Chưa gán phòng ban" /></TableCell>
                      <TableCell>{scopeLabels[user.accessScope]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.status === "active" ? "secondary" : "outline"
                          }
                        >
                          {statusLabels[user.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.lastLoginAt
                          ? dateFormatter.format(new Date(user.lastLoginAt))
                          : "Chưa đăng nhập"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateMutation.reset();
                            setDialog({ type: "edit", user });
                          }}
                          aria-label={`Sửa người dùng ${user.fullName}`}
                        >
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

      <Dialog
        open={dialog?.type === "create"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Thêm người dùng</DialogTitle>
            <DialogDescription>
              Tạo tài khoản đăng nhập và gán quyền vận hành ban đầu.
            </DialogDescription>
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

      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
            <DialogDescription>Chọn chương trình truy cập và một vai trò trong mỗi chương trình.</DialogDescription>
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
                programAssignments: editingUser.programAssignments.map(({ institutionProgramId, roleId }) => ({ institutionProgramId, roleId })),
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
    </PageLoadingBoundary>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value || "__all__"}
        onValueChange={(nextValue) =>
          onValueChange(nextValue === "__all__" ? "" : nextValue)
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Chọn ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tất cả</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function BadgeList({
  values,
  emptyText,
}: {
  values: string[];
  emptyText: string;
}) {
  if (values.length === 0)
    return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  return (
    <div className="flex max-w-72 flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="outline">
          {value}
        </Badge>
      ))}
    </div>
  );
}

type UserFormProps = {
  mode: "create" | "edit";
  defaultValues: UserManagementInput;
  options?: Awaited<ReturnType<typeof getUserManagementOptions>>;
  isPending: boolean;
  error: Error | null;
  onSubmit: (values: UserManagementInput) => void;
};

function UserForm({
  mode,
  defaultValues,
  options,
  isPending,
  error,
  onSubmit,
}: UserFormProps) {
  const { selectedProgramId } = useInstitutionProgram();
  const [values, setValues] = useState(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const departmentOptions = options?.departments ?? [];
  const currentAssignment = values.programAssignments.find((grant) => grant.institutionProgramId === selectedProgramId);
  const currentRoleScope = options?.programs.find((program) => program.id === selectedProgramId)?.roles.find((role) => role.id === currentAssignment?.roleId)?.scopeCode;
  const effectiveScope = currentRoleScope ? resolveEffectiveAccessScope(currentRoleScope, values.accessScope) : values.accessScope;
  const scopeOptions = (options?.scopes ?? []).filter((scope) => !currentRoleScope || isAccessScopeWithinRole(scope, currentRoleScope));
  function toggleDepartment(id: string) {
    setValues((current) => ({ ...current, departmentIds: current.departmentIds.includes(id)
      ? current.departmentIds.filter((item) => item !== id) : [...current.departmentIds, id] }));
  }
  function toggleProgram(institutionProgramId: string) {
    setErrors((current) => ({ ...current, programAssignments: "" }));
    setValues((current) => ({ ...current, programAssignments: current.programAssignments.some((grant) => grant.institutionProgramId === institutionProgramId)
      ? current.programAssignments.filter((grant) => grant.institutionProgramId !== institutionProgramId)
      : [...current.programAssignments, { institutionProgramId, roleId: "" }] }));
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = formSchema.safeParse(values);
        if (!parsed.success) {
          setErrors(
            Object.fromEntries(
              parsed.error.issues.map((issue) => [
                String(issue.path[0]),
                issue.message,
              ]),
            ),
          );
          return;
        }
        if ((mode === "create" || parsed.data.password.length > 0) && parsed.data.password.length < 8) {
          setErrors({ password: "Vui lòng nhập mật khẩu ban đầu tối thiểu 8 ký tự." });
          return;
        }
        if (parsed.data.programAssignments.some((grant) => !options?.programs.some((program) =>
          program.id === grant.institutionProgramId && program.roles.some((role) => role.id === grant.roleId)))) {
          setErrors({ programAssignments: "Vai trò đã chọn không thuộc chương trình. Vui lòng chọn lại." });
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      {error && <MutationError error={error} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="user-full-name"
          label="Họ và tên *"
          value={values.fullName}
          error={errors.fullName}
          onChange={(fullName) =>
            setValues((current) => ({ ...current, fullName }))
          }
        />
        <TextField
          id="user-email"
          label="Email *"
          type="email"
          value={values.email}
          error={errors.email}
          onChange={(email) => setValues((current) => ({ ...current, email }))}
        />
        <TextField
          id="user-phone"
          label="Số điện thoại"
          value={values.phone}
          error={errors.phone}
          onChange={(phone) => setValues((current) => ({ ...current, phone }))}
        />
        <Field>
          <FieldLabel htmlFor="user-status">Trạng thái</FieldLabel>
          <Select
            value={values.status}
            onValueChange={(status: UserManagementInput["status"]) =>
              setValues((current) => ({ ...current, status }))
            }
          >
            <SelectTrigger id="user-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{statusLabels.active}</SelectItem>
              <SelectItem value="inactive">{statusLabels.inactive}</SelectItem>
              <SelectItem value="suspended">
                {statusLabels.suspended}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <TextField
          id="user-password"
          label={mode === "create" ? "Mật khẩu ban đầu *" : "Mật khẩu mới"}
          type="password"
          value={values.password}
          error={errors.password}
          onChange={(password) =>
            setValues((current) => ({ ...current, password }))
          }
          placeholder={mode === "edit" ? "Để trống nếu không đổi" : undefined}
        />
        <Field data-invalid={Boolean(errors.accessScope)}>
          <FieldLabel htmlFor="user-scope">Phạm vi dữ liệu trong chương trình đang làm việc *</FieldLabel>
          <Select value={effectiveScope} onValueChange={(accessScope: AccessScope) => setValues((current) => ({ ...current, accessScope }))}>
            <SelectTrigger id="user-scope" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scopeOptions.map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {scopeLabels[scope]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">Phạm vi riêng chỉ giới hạn thêm dữ liệu, không mở rộng quyền của vai trò trong chương trình.</p>
          <FieldError>{errors.accessScope}</FieldError>
        </Field>
      </FieldGroup>

      <FieldSet className="rounded-md border p-4" aria-describedby="user-program-description">
        <FieldLegend variant="label">Chương trình được truy cập *</FieldLegend>
        <FieldDescription id="user-program-description">Tích chọn chương trình, sau đó chọn đúng một vai trò thuộc chương trình đó. Bỏ tích để gỡ quyền truy cập khi lưu.</FieldDescription>
        {!options && <p role="status" className="text-sm text-muted-foreground">Chưa tải được chương trình và vai trò. Vui lòng thử lại.</p>}
        {options && options.programs.length === 0 && <p className="text-sm text-muted-foreground">Bạn chưa có chương trình được phép quản lý người dùng.</p>}
        {errors.programAssignments && <FieldError role="alert">{errors.programAssignments}</FieldError>}
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          {options?.programs.map((program) => {
            const assignment = values.programAssignments.find((grant) => grant.institutionProgramId === program.id);
            const invalid = Boolean(assignment && (!assignment.roleId || !program.roles.some((role) => role.id === assignment.roleId)) && errors.programAssignments);
            return (
              <FieldSet key={program.id} className="min-w-0 gap-3 rounded-md border p-3">
                <Field orientation="horizontal">
                  <Checkbox id={`user-program-${program.id}`} checked={Boolean(assignment)} disabled={isPending || program.roles.length === 0} onCheckedChange={() => toggleProgram(program.id)} />
                  <FieldLabel htmlFor={`user-program-${program.id}`} className="min-h-11 cursor-pointer flex-col items-start justify-center gap-1">
                    <span>{program.institutionName} - {program.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">{program.code}</span>
                  </FieldLabel>
                </Field>
                {program.roles.length === 0 && <FieldDescription>Chương trình chưa có vai trò. Hãy tạo vai trò trước khi cấp quyền.</FieldDescription>}
                {assignment && (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={`user-program-role-${program.id}`}>Vai trò trong chương trình *</FieldLabel>
                    <Select value={assignment.roleId} disabled={isPending} onValueChange={(roleId) => {
                      setValues((current) => ({ ...current, programAssignments: current.programAssignments.map((grant) => grant.institutionProgramId === program.id ? { ...grant, roleId } : grant),
                        ...(program.id === selectedProgramId ? { accessScope: program.roles.find((role) => role.id === roleId)?.scopeCode ?? current.accessScope } : {}),
                      }));
                    }}>
                      <SelectTrigger id={`user-program-role-${program.id}`} className="min-h-11 w-full" aria-invalid={invalid} aria-describedby={invalid ? `user-program-role-error-${program.id}` : undefined}><SelectValue placeholder="Chọn một vai trò" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                        {program.roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                      </SelectGroup></SelectContent>
                    </Select>
                    {invalid && <FieldError id={`user-program-role-error-${program.id}`}>Vui lòng chọn một vai trò thuộc chương trình này.</FieldError>}
                  </Field>
                )}
              </FieldSet>
            );
          })}
        </FieldGroup>
      </FieldSet>
      <SelectionGroup
        title="Phòng ban / phạm vi dữ liệu"
        description="Dùng cho scope phòng ban và các luồng phân công lead."
        items={departmentOptions.map((department) => ({
          id: department.id,
          label: department.name,
          description: department.code ?? "",
        }))}
        selectedIds={values.departmentIds}
        onToggle={(id) => toggleDepartment(id)}
      />

      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending || !options}>{isPending ? "Đang lưu..." : mode === "create" ? "Thêm người dùng" : "Lưu thay đổi"}</Button>
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
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        aria-invalid={Boolean(error)}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

type SelectionGroupProps = {
  title: string;
  description: string;
  items: Array<{ id: string; label: string; description: string }>;
  selectedIds: string[];
  error?: string;
  onToggle: (id: string) => void;
};

function SelectionGroup({
  title,
  description,
  items,
  selectedIds,
  error,
  onToggle,
}: SelectionGroupProps) {
  const selection = new Set(selectedIds);
  return (
    <fieldset className="grid gap-3 rounded-md border p-4">
      <div>
        <legend className="text-sm font-medium">{title}</legend>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
          >
            <Checkbox
              checked={selection.has(item.id)}
              onCheckedChange={() => onToggle(item.id)}
              aria-label={`Chọn ${item.label}`}
            />
            <span className="min-w-0">
              <span className="block font-medium">{item.label}</span>
              {item.description && (
                <span className="block text-xs text-muted-foreground">
                  {item.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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

type UserFiltersProps = {
  setAppliedFilters: import("react").Dispatch<
    import("react").SetStateAction<{
      search: string;
      status: string;
      roleId: string;
      departmentId: string;
    }>
  >;
  filters: {
    search: string;
    status: string;
    roleId: string;
    departmentId: string;
  };
  setPage: import("react").Dispatch<import("react").SetStateAction<number>>;
  setFilters: import("react").Dispatch<
    import("react").SetStateAction<{
      search: string;
      status: string;
      roleId: string;
      departmentId: string;
    }>
  >;
  optionsQuery: import("@tanstack/react-query").UseQueryResult<
    NoInfer<import("../user-management.types").UserManagementOptions>,
    Error
  >;
};

function UserFilters({
  setAppliedFilters,
  filters,
  setPage,
  setFilters,
  optionsQuery,
}: UserFiltersProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle className="flex items-center gap-2">
          <UsersRound
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          Bộ lọc người dùng
        </CardTitle>
        <CardDescription>
          Tìm nhanh theo tên, email, số điện thoại, vai trò hoặc phòng ban.
        </CardDescription>
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
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="user-management-search"
                className="pl-9"
                value={filters.search}
                onChange={(event) =>
                  setFilters((value) => ({
                    ...value,
                    search: event.target.value,
                  }))
                }
                placeholder="Tên, email hoặc số điện thoại"
              />
            </div>
          </Field>
          <FilterSelect
            label="Trạng thái"
            value={filters.status}
            onValueChange={(status) =>
              setFilters((value) => ({ ...value, status }))
            }
            options={[
              { value: "active", label: statusLabels.active },
              { value: "inactive", label: statusLabels.inactive },
              { value: "suspended", label: statusLabels.suspended },
            ]}
          />
          <FilterSelect
            label="Vai trò"
            value={filters.roleId}
            onValueChange={(roleId) =>
              setFilters((value) => ({ ...value, roleId }))
            }
            options={(optionsQuery.data?.roles ?? []).map((role) => ({
              value: role.id,
              label: `${role.name} (${role.code})`,
            }))}
          />
          <FilterSelect
            label="Phòng ban"
            value={filters.departmentId}
            onValueChange={(departmentId) =>
              setFilters((value) => ({ ...value, departmentId }))
            }
            options={(optionsQuery.data?.departments ?? []).map(
              (department) => ({
                value: department.id,
                label: department.name,
              }),
            )}
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
  );
}
