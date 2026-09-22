import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Search, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { LeadsListPage } from "@/modules/leads/pages/leads-list-page";
import { ApiError } from "@/services/api";
import { createCustomerList, getCustomerList, getCustomerLists, updateCustomerList } from "@/services/customer-list.service";
import { getLeadFilterOptions } from "@/services/lead.service";
import type { CustomerListItem } from "../customer-list.types";
import { CustomerListFormDialog } from "../components/customer-list-form-dialog";
import {
  createCustomerListDefaults,
  type CreateCustomerListFormValues,
} from "../components/customer-list-filter-builder";

const pageSize = 20;

export function CustomerListManagementPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingList, setEditingList] = useState<CustomerListItem | null>(null);
  const listQuery = useQuery({
    queryKey: ["customer-lists", "list", page, search],
    queryFn: () => getCustomerLists({ page, limit: pageSize, search }, auth.accessToken!),
    placeholderData: (previous) => previous,
  });
  const optionsQuery = useQuery({
    queryKey: ["leads", "options"],
    queryFn: () => getLeadFilterOptions(auth.accessToken!),
    enabled: createOpen || Boolean(editingList),
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateCustomerListFormValues) => createCustomerList({
      name: values.name.trim(),
      filters: values.filters,
    }, auth.accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-lists"] });
      setCreateOpen(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CreateCustomerListFormValues }) => updateCustomerList(id, {
      name: values.name.trim(),
      filters: values.filters,
    }, auth.accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-lists"] });
      setEditingList(null);
    },
  });
  const items = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;
  const canManage = listQuery.data?.capabilities.canManage ?? auth.can("customer_list.manage");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing / Khách hàng"
        title="Quản lý danh sách"
        scopeLabel="Theo chương trình đang làm việc"
        description="Tạo danh sách tĩnh hoặc danh sách động theo bộ lọc; một khách hàng có thể thuộc nhiều danh sách."
        actions={canManage ? (
          <Button type="button" onClick={() => { createMutation.reset(); setCreateOpen(true); }}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Tạo danh sách
          </Button>
        ) : undefined}
      />

      {createOpen && (
        <CustomerListFormDialog
          mode="create"
          initialValues={createCustomerListDefaults}
          options={optionsQuery.data}
          pending={createMutation.isPending}
          errorMessage={createMutation.isError
            ? createMutation.error instanceof ApiError ? createMutation.error.message : "Không thể tạo danh sách. Vui lòng thử lại."
            : undefined}
          onOpenChange={setCreateOpen}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      )}

      {editingList && (
        <CustomerListFormDialog
          key={editingList.id}
          mode="edit"
          initialValues={{
            name: editingList.name,
            filters: {
              combinator: editingList.filters.combinator,
              conditions: editingList.filters.conditions.map((condition) => ({ ...condition })),
            },
          }}
          options={optionsQuery.data}
          pending={updateMutation.isPending}
          errorMessage={updateMutation.isError
            ? updateMutation.error instanceof ApiError ? updateMutation.error.message : "Không thể cập nhật danh sách. Vui lòng thử lại."
            : undefined}
          onOpenChange={(open) => { if (!open) setEditingList(null); }}
          onSubmit={(values) => updateMutation.mutate({ id: editingList.id, values })}
        />
      )}

      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5"><CardTitle>Tìm danh sách</CardTitle><CardDescription>Tìm nhanh theo tên danh sách khách hàng.</CardDescription></CardHeader>
        <CardContent className="px-5">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(1); }}>
            <Field className="max-w-xl flex-1"><FieldLabel htmlFor="customer-list-search" className="sr-only">Tên danh sách</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="customer-list-search" className="pl-9" placeholder="Nhập tên danh sách" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} /></div></Field>
            <Button type="submit">Tìm kiếm</Button>
            {search && <Button type="button" variant="outline" onClick={() => { setDraftSearch(""); setSearch(""); setPage(1); }}>Xóa tìm kiếm</Button>}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="border-b py-5"><CardTitle>Các danh sách khách hàng</CardTitle><CardDescription>{pagination ? `${pagination.total} danh sách trong chương trình đang làm việc.` : "Đang tải danh sách…"}</CardDescription></CardHeader>
        <CardContent className="p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách khách hàng" description="Vui lòng thử tải lại dữ liệu." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách khách hàng" />
          ) : items.length === 0 ? (
            <EmptyState
              title={search ? "Không tìm thấy danh sách phù hợp" : "Chưa có danh sách khách hàng"}
              description={canManage ? "Tạo danh sách đầu tiên để nhóm và quản lý khách hàng." : "Chưa có danh sách nào trong phạm vi của bạn."}
            />
          ) : (
            <Table>
              <caption className="sr-only">Danh sách khách hàng đã tạo</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên danh sách</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Mô tả bộ lọc</TableHead>
                  <TableHead className="text-right">Số khách hàng</TableHead>
                  {canManage && <TableHead className="text-right">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link className="font-medium text-primary hover:underline" to={`/marketing/quan-ly-danh-sach/${item.id}`}>{item.name}</Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.isDynamic ? "default" : "secondary"}>{item.isDynamic ? "Danh sách động" : "Danh sách tĩnh"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-sm text-muted-foreground">{item.filterDescription}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-2 font-medium tabular-nums">
                        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                        {item.customerCount}
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => { updateMutation.reset(); setEditingList(item); }}
                        >
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          Chỉnh sửa
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.total > 0 && <div className="flex items-center justify-between border-t px-5 py-4 text-sm"><span className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages || listQuery.isFetching} onClick={() => setPage((value) => value + 1)}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>}
      </Card>
    </div>
  );
}

export function CustomerListDetailPage() {
  const { customerListId = "" } = useParams();
  const auth = useAuth();
  const listQuery = useQuery({ queryKey: ["customer-lists", "detail", customerListId], queryFn: () => getCustomerList(customerListId, auth.accessToken!), enabled: Boolean(customerListId) });
  if (listQuery.isLoading) return <TableLoadingState label="Đang tải danh sách khách hàng" />;
  if (listQuery.isError || !listQuery.data) return <ErrorState title="Không thể tải danh sách khách hàng" description="Danh sách không tồn tại hoặc bạn không có quyền truy cập." onReload={() => listQuery.refetch()} />;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-400 flex-col gap-4">
      <Button asChild variant="ghost" className="w-fit px-2">
        <Link to="/marketing/quan-ly-danh-sach">
          <ArrowLeft aria-hidden="true" />
          Quay lại
        </Link>
      </Button>
      <LeadsListPage
        eyebrow="CRM Marketing / Quản lý danh sách"
        title={listQuery.data.name}
        description={listQuery.data.filterDescription}
        detailBasePath="/marketing/danh-sach-khach-hang"
        customerListId={customerListId}
        enableCustomerListAssignment
        showLeadCreationActions={false}
      />
    </div>
  );
}
