import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import type { DuplicateLeadField, DuplicateLeadResponse } from "@/modules/leads/lead.types";
import { getDuplicateGroupMembers, getDuplicateLeads } from "@/services/lead.service";

const fieldLabels: Record<DuplicateLeadField, string> = {
  fullName: "Họ và tên",
  phone: "Số điện thoại",
  email: "Email",
};

function DuplicateGroup({ group, field }: { group: DuplicateLeadResponse["data"][number]; field: DuplicateLeadField }) {
  const auth = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const membersQuery = useQuery({
    queryKey: ["lead-duplicates", "members", field, group.key, page],
    queryFn: () => getDuplicateGroupMembers(field, group.key, page, auth.accessToken!),
    enabled: expanded,
  });
  const leads = expanded ? membersQuery.data?.data ?? [] : group.leads;
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-4 py-3">
        <span className="font-medium break-all">{group.key}</span>
        <Badge variant="secondary">{group.count} lead</Badge>
      </div>
      {expanded && membersQuery.isLoading ? <TableLoadingState label="Đang tải lead trong nhóm" /> : expanded && membersQuery.isError ? (
        <ErrorState title="Không thể tải nhóm lead" description="Vui lòng thử lại." onReload={() => { void membersQuery.refetch(); }} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Họ và tên</TableHead><TableHead>Mã lead</TableHead>
              <TableHead>Số điện thoại</TableHead><TableHead>Email</TableHead><TableHead>Ngày tạo</TableHead><TableHead className="text-right">Chi tiết</TableHead>
            </TableRow></TableHeader>
            <TableBody>{leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.fullName}</TableCell>
                <TableCell>{lead.leadCode ?? "—"}</TableCell>
                <TableCell>{lead.phone ?? "—"}</TableCell>
                <TableCell>{lead.email ?? "—"}</TableCell>
                <TableCell>{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("vi-VN") : "—"}</TableCell>
                <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link to={`/marketing/danh-sach-khach-hang/${lead.id}`} aria-label={`Xem lead ${lead.fullName}`}><ExternalLink aria-hidden="true" /> Xem</Link></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
      {group.count > group.leads.length && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Button type="button" variant="link" className="px-0" onClick={() => { setExpanded((value) => !value); setPage(1); }}>
            {expanded ? "Thu gọn" : `Xem tất cả ${group.count} lead`}
          </Button>
          {expanded && membersQuery.data && membersQuery.data.pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Trang {page} / {membersQuery.data.pagination.totalPages}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Trang lead trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Trang lead sau" disabled={page >= membersQuery.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DuplicateLeadsPage() {
  const auth = useAuth();
  const [field, setField] = useState<DuplicateLeadField>("fullName");
  const [page, setPage] = useState(1);
  const canViewSensitive = [
    "lead.sensitive.view", "lead.update_all", "lead.update_department", "lead.update_assigned",
  ].some((permission) => auth.can(permission));
  const duplicatesQuery = useQuery({
    queryKey: ["lead-duplicates", field, page],
    queryFn: () => getDuplicateLeads(field, page, auth.accessToken!),
    placeholderData: (previous) => previous,
  });
  const result = duplicatesQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing / Khách hàng"
        title="Check trùng data"
        scopeLabel="Theo chương trình đang làm việc"
        description="Tìm các lead có cùng giá trị ở một trường dữ liệu trong phạm vi bạn được xem. Kết quả chỉ để đối chiếu, không tự động gộp hoặc xóa lead."
      />

      <Card>
        <CardHeader>
          <CardTitle>Trường cần kiểm tra</CardTitle>
          <CardDescription>Họ tên và email được so sánh không phân biệt chữ hoa, chữ thường hoặc khoảng trắng thừa; số điện thoại bỏ ký tự phân cách.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="duplicate-field">Chọn trường dữ liệu</FieldLabel>
            <Select value={field} onValueChange={(value) => { setField(value as DuplicateLeadField); setPage(1); }}>
              <SelectTrigger id="duplicate-field" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="fullName">Họ và tên</SelectItem>
                <SelectItem value="phone" disabled={!canViewSensitive}>Số điện thoại</SelectItem>
                <SelectItem value="email" disabled={!canViewSensitive}>Email</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
            {!canViewSensitive && <p className="text-sm text-muted-foreground">Bạn cần quyền xem dữ liệu nhạy cảm để kiểm tra theo số điện thoại hoặc email.</p>}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanSearch aria-hidden="true" /> Nhóm lead trùng</CardTitle>
          <CardDescription>{result ? `${result.pagination.total} nhóm trùng theo ${fieldLabels[field].toLowerCase()}.` : "Đang kiểm tra dữ liệu…"} Mỗi nhóm hiển thị tối đa 5 lead gần nhất để đối chiếu.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {duplicatesQuery.isLoading ? <TableLoadingState label="Đang kiểm tra lead trùng" /> : duplicatesQuery.isError ? (
            <ErrorState title="Không thể tải kết quả" description="Không thể kiểm tra lead trùng. Vui lòng thử lại." onReload={() => { void duplicatesQuery.refetch(); }} />
          ) : result?.data.length === 0 ? (
            <EmptyState title="Chưa tìm thấy nhóm lead trùng" description={`Không có lead trùng theo ${fieldLabels[field].toLowerCase()} trong phạm vi hiện tại.`} />
          ) : result?.data.map((group) => <DuplicateGroup key={`${field}-${group.key}`} group={group} field={field} />)}
          {result && result.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">Trang {result.pagination.page} / {result.pagination.totalPages}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Trang sau" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" /></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
