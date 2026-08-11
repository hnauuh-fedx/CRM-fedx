import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import {
  createManagedPermission,
  deleteManagedPermission,
  getManagedPermissions,
  getPermissionManagementOptions,
  updateManagedPermission,
} from "@/services/permission-management.service";
import type { ManagedPermission, PermissionInput } from "../permission-management.types";

const pageSize = 20;
const emptyFilters = { search: "", module: "", status: "" };
const emptyForm: PermissionInput = { code: "", name: "", module: "", description: "", isActive: true };
const permissionCodeOptions = [
  { code: "dashboard.view_all", name: "Xem dashboard điều hành", module: "dashboard" },
  { code: "dashboard.view", name: "Xem dashboard", module: "dashboard" },
  { code: "report.view_all", name: "Xem toàn bộ báo cáo", module: "report" },
  { code: "report.view", name: "Xem báo cáo", module: "report" },
  { code: "report.marketing.view", name: "Xem báo cáo Marketing", module: "report" },
  { code: "report.marketing.view_own", name: "Xem báo cáo Marketing của tôi", module: "report" },
  { code: "report.sale.view_department", name: "Xem báo cáo Sale theo phòng ban", module: "report" },
  { code: "lead.view_all", name: "Xem toàn bộ lead", module: "lead" },
  { code: "lead.view_department", name: "Xem lead theo phòng ban", module: "lead" },
  { code: "lead.view_assigned", name: "Xem lead được giao", module: "lead" },
  { code: "lead.create", name: "Tạo lead", module: "lead" },
  { code: "lead.update_all", name: "Cập nhật toàn bộ lead", module: "lead" },
  { code: "lead.update_department", name: "Cập nhật lead theo phòng ban", module: "lead" },
  { code: "lead.update_assigned", name: "Cập nhật lead được giao", module: "lead" },
  { code: "lead.delete", name: "Xóa lead", module: "lead" },
  { code: "lead.assign", name: "Phân công lead", module: "lead" },
  { code: "lead.reassign", name: "Chuyển người phụ trách lead", module: "lead" },
  { code: "lead_note.create", name: "Thêm ghi chú lead", module: "lead" },
  { code: "lead_note.view_department", name: "Xem ghi chú lead theo phòng ban", module: "lead" },
  { code: "lead_activity.create", name: "Ghi hoạt động chăm sóc lead", module: "lead" },
  { code: "lead_activity.update", name: "Cập nhật hoạt động chăm sóc lead", module: "lead" },
  { code: "lead_activity.view_department", name: "Xem hoạt động lead theo phòng ban", module: "lead" },
  { code: "reminder.create", name: "Tạo nhắc việc", module: "lead" },
  { code: "reminder.update", name: "Cập nhật nhắc việc", module: "lead" },
  { code: "reminder.complete", name: "Hoàn tất nhắc việc", module: "lead" },
  { code: "file.upload", name: "Đính kèm tệp", module: "file" },
  { code: "campaign.view_all", name: "Xem toàn bộ chiến dịch", module: "marketing" },
  { code: "campaign.view", name: "Xem chiến dịch theo phòng ban", module: "marketing" },
  { code: "campaign.view_own", name: "Xem chiến dịch của tôi", module: "marketing" },
  { code: "campaign.create", name: "Tạo chiến dịch", module: "marketing" },
  { code: "campaign.update", name: "Cập nhật chiến dịch", module: "marketing" },
  { code: "campaign.update_own", name: "Cập nhật chiến dịch của tôi", module: "marketing" },
  { code: "campaign.delete", name: "Xóa chiến dịch", module: "marketing" },
  { code: "lead_source.manage", name: "Quản lý nguồn lead", module: "marketing" },
  { code: "utm.view", name: "Xem UTM", module: "marketing" },
  { code: "utm.view_own", name: "Xem UTM của tôi", module: "marketing" },
  { code: "marketing_form.manage", name: "Quản lý biểu mẫu Marketing", module: "marketing" },
  { code: "marketing_form.create", name: "Tạo biểu mẫu Marketing", module: "marketing" },
  { code: "marketing_form.update_own", name: "Cập nhật biểu mẫu của tôi", module: "marketing" },
  { code: "admission.view_all", name: "Xem toàn bộ hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.view", name: "Xem hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.update", name: "Cập nhật hồ sơ tuyển sinh", module: "admission" },
  { code: "admission.approve", name: "Duyệt hồ sơ tuyển sinh", module: "admission" },
  { code: "admission_status.update", name: "Chuyển trạng thái hồ sơ tuyển sinh", module: "admission" },
  { code: "admission_document.view", name: "Xem tài liệu hồ sơ", module: "admission" },
  { code: "admission_document.upload", name: "Upload tài liệu hồ sơ", module: "admission" },
  { code: "admission_major.manage", name: "Quản lý ngành tuyển sinh", module: "admission" },
  { code: "institution_program.manage", name: "Quản lý chương trình tuyển sinh", module: "admission" },
  { code: "student.create_from_admission", name: "Chuyển hồ sơ thành sinh viên", module: "student" },
  { code: "student.view_all", name: "Xem toàn bộ sinh viên", module: "student" },
  { code: "student.view", name: "Xem sinh viên", module: "student" },
  { code: "student.update_all", name: "Cập nhật toàn bộ sinh viên", module: "student" },
  { code: "student.update", name: "Cập nhật sinh viên", module: "student" },
  { code: "student_service.view", name: "Xem dịch vụ sinh viên", module: "student" },
  { code: "student_service.create", name: "Tạo yêu cầu dịch vụ sinh viên", module: "student" },
  { code: "student_service.update", name: "Cập nhật dịch vụ sinh viên", module: "student" },
  { code: "user.manage", name: "Quản lý người dùng", module: "system" },
  { code: "role.manage", name: "Quản lý vai trò và scope", module: "system" },
  { code: "permission.manage", name: "Quản lý danh mục quyền", module: "system" },
  { code: "department.manage", name: "Quản lý phòng ban", module: "system" },
  { code: "pipeline.manage", name: "Quản lý pipeline", module: "system" },
  { code: "automation.manage", name: "Quản lý Rule Automation", module: "system" },
  { code: "system.manage", name: "Quản lý cấu hình hệ thống", module: "system" },
  { code: "audit.view", name: "Xem nhật ký hệ thống", module: "system" },
] as const;

type DialogState =
  | { type: "create" }
  | { type: "edit"; permission: ManagedPermission }
  | { type: "delete"; permission: ManagedPermission }
  | null;

export function PermissionsAccessPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingPermission = dialog?.type === "edit" ? dialog.permission : null;
  const deletingPermission = dialog?.type === "delete" ? dialog.permission : null;

  const listQuery = useQuery({
    queryKey: ["permissions", "management", page, appliedFilters],
    queryFn: () =>
      getManagedPermissions(
        { page, limit: pageSize, sortBy: "code", sortOrder: "asc", ...appliedFilters },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["permissions", "management", "options"],
    queryFn: () => getPermissionManagementOptions(auth.accessToken!),
  });
  const createMutation = useMutation({
    mutationFn: (input: PermissionInput) => createManagedPermission(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["permissions", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["roles", "management", "options"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (input: PermissionInput) => updateManagedPermission(editingPermission!.id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["permissions", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["roles", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["roles", "management", "options"] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteManagedPermission(deletingPermission!.id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["permissions", "management"] });
      void queryClient.invalidateQueries({ queryKey: ["roles", "management", "options"] });
    },
  });

  const data = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Hệ thống"
        title="Danh mục quyền"
        scopeLabel="Quyền quản trị"
        description="Quản lý mã quyền chức năng dùng để cấp quyền cho vai trò trong hệ thống."
        actions={
          <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
            <Plus aria-hidden="true" />
            Thêm quyền
          </Button>
        }
      />

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
            Bộ lọc quyền
          </CardTitle>
          <CardDescription>Tìm theo mã, tên quyền hoặc module nghiệp vụ.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form
            className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_180px_auto_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ ...filters, search: filters.search.trim() });
              setPage(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="permission-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="permission-search" className="pl-9" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="Mã hoặc tên quyền" />
              </div>
            </Field>
            <Field>
              <FieldLabel>Module</FieldLabel>
              <Select value={filters.module || "__all__"} onValueChange={(module) => setFilters((value) => ({ ...value, module: module === "__all__" ? "" : module }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tất cả</SelectItem>
                  {(optionsQuery.data?.modules ?? []).map((module) => <SelectItem key={module} value={module}>{module}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select value={filters.status || "__all__"} onValueChange={(status) => setFilters((value) => ({ ...value, status: status === "__all__" ? "" : status }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tất cả</SelectItem>
                  <SelectItem value="active">Đang bật</SelectItem>
                  <SelectItem value="inactive">Đã tắt</SelectItem>
                </SelectContent>
              </Select>
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
          <CardTitle>Danh sách quyền</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} quyền` : "Đang lấy dữ liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh mục quyền" description="Vui lòng thử lại để cập nhật dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh mục quyền" />
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có quyền phù hợp" description="Thêm quyền mới hoặc điều chỉnh bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Danh mục quyền chức năng</caption>
                <TableHeader className="bg-muted/55">
                  <TableRow>
                    <TableHead className="min-w-64 px-5">Quyền</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Vai trò đang dùng</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="px-5">
                        <div className="font-medium">{permission.name}</div>
                        <div className="text-sm text-muted-foreground">{permission.code}</div>
                        {permission.description && <div className="mt-1 max-w-xl text-sm text-muted-foreground">{permission.description}</div>}
                      </TableCell>
                      <TableCell>{permission.module ? <Badge variant="outline">{permission.module}</Badge> : "-"}</TableCell>
                      <TableCell><Badge variant={permission.isActive ? "default" : "outline"}>{permission.isActive ? "Đang bật" : "Đã tắt"}</Badge></TableCell>
                      <TableCell>{permission.roleCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", permission }); }}>
                            <Pencil aria-hidden="true" />
                            Sửa
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={permission.roleCount > 0} onClick={() => { deleteMutation.reset(); setDialog({ type: "delete", permission }); }}>
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
            <DialogTitle>Thêm quyền</DialogTitle>
            <DialogDescription>Tạo mã quyền mới để có thể gán cho vai trò.</DialogDescription>
          </DialogHeader>
          <PermissionForm defaultValues={emptyForm} error={createMutation.error} isPending={createMutation.isPending} onSubmit={(values) => createMutation.mutate(values)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingPermission)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa quyền</DialogTitle>
            <DialogDescription>Cập nhật tên, mã và module của quyền chức năng.</DialogDescription>
          </DialogHeader>
          {editingPermission && (
            <PermissionForm
              key={editingPermission.id}
              defaultValues={{ code: editingPermission.code, name: editingPermission.name, module: editingPermission.module ?? "", description: editingPermission.description ?? "", isActive: editingPermission.isActive }}
              error={updateMutation.error}
              isPending={updateMutation.isPending}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingPermission)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa quyền</DialogTitle>
            <DialogDescription>{deletingPermission ? `Bạn có chắc muốn xóa quyền "${deletingPermission.code}"?` : ""}</DialogDescription>
          </DialogHeader>
          {deleteMutation.error && <MutationError error={deleteMutation.error} />}
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa quyền"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionForm({ defaultValues, error, isPending, onSubmit }: {
  defaultValues: PermissionInput;
  error: Error | null;
  isPending: boolean;
  onSubmit: (values: PermissionInput) => void;
}) {
  const [values, setValues] = useState(defaultValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const codeOptions = permissionCodeOptions.some((option) => option.code === values.code) || !values.code
    ? permissionCodeOptions
    : [{ code: values.code, name: values.name || values.code, module: values.module }, ...permissionCodeOptions];

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (values.code.trim().length < 2 || values.name.trim().length < 2) {
          setValidationError("Vui lòng nhập tên và mã quyền tối thiểu 2 ký tự.");
          return;
        }
        setValidationError(null);
        onSubmit(values);
      }}
    >
      {error && <MutationError error={error} />}
      {validationError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{validationError}</p>}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="permission-name">Tên quyền *</FieldLabel>
          <Input id="permission-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
          <FieldError />
        </Field>
        <Field>
          <FieldLabel htmlFor="permission-code">Mã quyền *</FieldLabel>
          <Select
            value={values.code || "__select__"}
            onValueChange={(code) => {
              if (code === "__select__") return;
              const selected = codeOptions.find((option) => option.code === code);
              setValues((current) => ({
                ...current,
                code,
                name: selected?.name ?? current.name,
                module: selected?.module ?? current.module,
              }));
            }}
          >
            <SelectTrigger id="permission-code" className="w-full">
              <SelectValue placeholder="Chọn mã quyền" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__select__" disabled>Chọn mã quyền</SelectItem>
              {codeOptions.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError />
        </Field>
        <Field>
          <FieldLabel htmlFor="permission-module">Module</FieldLabel>
          <Input id="permission-module" value={values.module} onChange={(event) => setValues((current) => ({ ...current, module: event.target.value }))} placeholder="lead, system, report..." />
        </Field>
        <Field>
          <FieldLabel htmlFor="permission-description">Mô tả quyền</FieldLabel>
          <Input id="permission-description" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Mô tả ngắn về phạm vi quyền" />
        </Field>
        <Field>
          <FieldLabel>Trạng thái</FieldLabel>
          <Select value={values.isActive ? "active" : "inactive"} onValueChange={(status) => setValues((current) => ({ ...current, isActive: status === "active" }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Đang bật</SelectItem>
              <SelectItem value="inactive">Đã tắt</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu quyền"}</Button>
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
