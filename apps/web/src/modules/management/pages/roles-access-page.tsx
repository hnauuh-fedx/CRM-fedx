import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedRole,
  deleteManagedRole,
  getManagedRoles,
  getRoleManagementOptions,
  updateManagedRole,
  updateManagedScope,
} from "@/services/role-management.service";
import type { AccessScopeCode, ManagedAccessScope, ManagedRole, RoleInput, ScopeInput } from "../role-management.types";

const emptyRoleForm: RoleInput = {
  name: "",
  code: "",
  description: "",
  scopeCode: "DEPARTMENT",
  permissionIds: [],
};

const scopeLabels: Record<AccessScopeCode, string> = {
  ALL: "Toàn hệ thống",
  DEPARTMENT: "Theo phòng ban",
  ASSIGNED_ONLY: "Dữ liệu được giao",
  OWNED_ONLY: "Dữ liệu tự tạo",
  READ_ONLY: "Chỉ xem",
};

type DialogState =
  | { type: "create-role" }
  | { type: "edit-role"; role: ManagedRole }
  | { type: "delete-role"; role: ManagedRole }
  | { type: "edit-scope"; scope: ManagedAccessScope }
  | null;

export function RolesAccessPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingRole = dialog?.type === "edit-role" ? dialog.role : null;
  const deletingRole = dialog?.type === "delete-role" ? dialog.role : null;
  const editingScope = dialog?.type === "edit-scope" ? dialog.scope : null;

  const rolesQuery = useQuery({
    queryKey: ["roles", "management"],
    queryFn: () => getManagedRoles(auth.accessToken!),
  });
  const optionsQuery = useQuery({
    queryKey: ["roles", "management", "options"],
    queryFn: () => getRoleManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: RoleInput) => createManagedRole(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["roles", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: RoleInput) => updateManagedRole(editingRole!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["roles", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteManagedRole(deletingRole!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["roles", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const scopeMutation = useMutation({
    mutationFn: (input: ScopeInput) => updateManagedScope(editingScope!.code, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["roles", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const roles = rolesQuery.data?.data ?? [];
  const scopes = optionsQuery.data?.scopes ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Vai trò & scope truy cập"
        scopeLabel="Quyền quản trị"
        description="Cấu hình vai trò, chức năng được phép dùng và phạm vi truy cập mặc định."
        actions={
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create-role" }); }}>
            <Plus aria-hidden="true" />
            Thêm vai trò
          </Button>
        }
      />

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Vai trò hệ thống</CardTitle>
          <CardDescription>Gán permission theo chức năng và scope mặc định cho từng vai trò.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rolesQuery.isError ? (
            <ErrorState title="Không thể tải vai trò" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => rolesQuery.refetch()} />
          ) : rolesQuery.isLoading ? (
            <TableLoadingState label="Đang tải vai trò" />
          ) : roles.length === 0 ? (
            <EmptyState title="Chưa có vai trò" description="Thêm vai trò mới để bắt đầu phân quyền." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh sách vai trò và quyền chức năng</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-56 px-5">Vai trò</TableHead>
                    <TableHead>Scope mặc định</TableHead>
                    <TableHead>Chức năng</TableHead>
                    <TableHead>Người dùng</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="px-5">
                        <div className="font-medium">{role.name}</div>
                        <div className="text-sm text-muted-foreground">{role.code}</div>
                      </TableCell>
                      <TableCell>{scopeLabels[role.scopeCode]}</TableCell>
                      <TableCell>
                        <div className="flex max-w-xl flex-wrap gap-1.5">
                          {[...role.permissions]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .slice(0, 8)
                            .map((permission) => (
                              <Badge key={permission.id} variant="outline" title={permission.code}>
                                {permission.name}
                              </Badge>
                            ))}
                          {role.permissions.length > 8 && <Badge variant="secondary">+{role.permissions.length - 8}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{role.userCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit-role", role }); }}>
                            <Pencil aria-hidden="true" />
                            Sửa
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={role.userCount > 0} onClick={() => { deleteMutation.reset(); setDialog({ type: "delete-role", role }); }}>
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

      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
            Scope truy cập
          </CardTitle>
          <CardDescription>Chỉ cấu hình tên, mô tả và trạng thái cho các scope được hệ thống hỗ trợ.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {scopes.map((scope) => (
              <button
                key={scope.code}
                type="button"
                className="rounded-md border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => { scopeMutation.reset(); setDialog({ type: "edit-scope", scope }); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{scope.name}</span>
                  <Badge variant={scope.isActive ? "secondary" : "outline"}>{scope.isActive ? "Đang bật" : "Đang tắt"}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{scope.code}</p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{scope.description ?? "Chưa có mô tả."}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog?.type === "create-role"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Thêm vai trò</DialogTitle>
            <DialogDescription>Chọn scope mặc định và các chức năng được phép sử dụng.</DialogDescription>
          </DialogHeader>
          <RoleForm
            key="create-role"
            defaultValues={emptyRoleForm}
            options={optionsQuery.data}
            error={createMutation.error}
            isPending={createMutation.isPending}
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingRole)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sửa vai trò</DialogTitle>
            <DialogDescription>Cập nhật scope và danh sách chức năng của vai trò.</DialogDescription>
          </DialogHeader>
          {editingRole && (
            <RoleForm
              key={editingRole.id}
              defaultValues={{
                name: editingRole.name,
                code: editingRole.code,
                description: editingRole.description ?? "",
                scopeCode: editingRole.scopeCode,
                permissionIds: editingRole.permissions.map((permission) => permission.id),
              }}
              options={optionsQuery.data}
              error={updateMutation.error}
              isPending={updateMutation.isPending}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingRole)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa vai trò</DialogTitle>
            <DialogDescription>{deletingRole ? `Bạn có chắc muốn xóa vai trò "${deletingRole.name}"?` : ""}</DialogDescription>
          </DialogHeader>
          {deleteMutation.error && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa vai trò"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingScope)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cấu hình scope</DialogTitle>
            <DialogDescription>{editingScope ? `${editingScope.code} - ${scopeLabels[editingScope.code]}` : ""}</DialogDescription>
          </DialogHeader>
          {editingScope && (
            <ScopeForm
              key={editingScope.code}
              defaultValues={{ name: editingScope.name, description: editingScope.description ?? "", isActive: editingScope.isActive }}
              error={scopeMutation.error}
              isPending={scopeMutation.isPending}
              onSubmit={(values) => scopeMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleForm({ defaultValues, options, error, isPending, onSubmit }: {
  defaultValues: RoleInput;
  options?: Awaited<ReturnType<typeof getRoleManagementOptions>>;
  error: Error | null;
  isPending: boolean;
  onSubmit: (values: RoleInput) => void;
}) {
  const [values, setValues] = useState(defaultValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const scopes = options?.scopes.filter((scope) => scope.isActive) ?? [];
  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof options>["permissions"]>();
    for (const permission of options?.permissions ?? []) {
      const module = permission.module ?? "system";
      groups.set(module, [...(groups.get(module) ?? []), permission]);
    }
    return [...groups.entries()];
  }, [options]);

  function togglePermission(permissionId: string) {
    setValues((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (values.name.trim().length < 2 || values.code.trim().length < 2) {
          setValidationError("Vui lòng nhập tên và mã vai trò.");
          return;
        }
        setValidationError(null);
        onSubmit(values);
      }}
    >
      {error && <MutationError error={error} />}
      {validationError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{validationError}</p>}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="role-name">Tên vai trò *</FieldLabel>
          <Input id="role-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="role-code">Mã vai trò *</FieldLabel>
          <Input id="role-code" value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="role-scope">Scope mặc định *</FieldLabel>
          <Select value={values.scopeCode} onValueChange={(scopeCode: AccessScopeCode) => setValues((current) => ({ ...current, scopeCode }))}>
            <SelectTrigger id="role-scope" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => <SelectItem key={scope.code} value={scope.code}>{scope.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="role-description">Mô tả</FieldLabel>
          <Textarea id="role-description" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
        </Field>
      </FieldGroup>

      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="text-sm font-medium">Chức năng được phép dùng</legend>
        <div className="grid gap-4 lg:grid-cols-2">
          {permissionsByModule.map(([module, permissions]) => (
            <div key={module} className="rounded-md border p-3">
              <p className="mb-3 text-sm font-medium uppercase text-muted-foreground">{module}</p>
              <div className="grid gap-2">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50">
                    <Checkbox checked={values.permissionIds.includes(permission.id)} onCheckedChange={() => togglePermission(permission.id)} aria-label={`Chọn ${permission.name}`} />
                    <span>
                      <span className="block text-sm font-medium">{permission.name}</span>
                      <span className="block text-xs text-muted-foreground">{permission.code}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu vai trò"}</Button>
      </DialogFooter>
    </form>
  );
}

function ScopeForm({ defaultValues, error, isPending, onSubmit }: {
  defaultValues: ScopeInput;
  error: Error | null;
  isPending: boolean;
  onSubmit: (values: ScopeInput) => void;
}) {
  const [values, setValues] = useState(defaultValues);
  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
      {error && <MutationError error={error} />}
      <Field data-invalid={values.name.trim().length < 2}>
        <FieldLabel htmlFor="scope-name">Tên scope *</FieldLabel>
        <Input id="scope-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
        {values.name.trim().length < 2 && <FieldError>Tên scope cần tối thiểu 2 ký tự.</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor="scope-description">Mô tả</FieldLabel>
        <Textarea id="scope-description" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
      </Field>
      <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm">
        <Checkbox id="scope-active" checked={values.isActive} onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked === true }))} />
        <label htmlFor="scope-active" className="cursor-pointer">Cho phép gán scope này cho vai trò</label>
      </div>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending || values.name.trim().length < 2}>{isPending ? "Đang lưu..." : "Lưu scope"}</Button>
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
