import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getManualLeadCreators } from "@/services/system-preferences.service";

export function ManualLeadCreatorsPicker({ programId, value, disabled, error, onChange }: { programId: string; value: string[]; disabled: boolean; error?: string; onChange: (ids: string[]) => void }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState({ search: "", page: 1 });
  const search = useDeferredValue(filters.search);
  const query = useQuery({ queryKey: ["manual-lead-creators", programId, search, filters.page, value], queryFn: () => getManualLeadCreators(accessToken!, programId, search, filters.page, value), placeholderData: keepPreviousData });
  const selected = new Set(value);
  const names = new Map([
    ...(query.data?.data.map(user => [user.id, { ...user, active: true }] as const) ?? []),
    ...(query.data?.selected.map(user => [user.id, user] as const) ?? []),
  ]);
  return <FieldSet disabled={disabled} data-invalid={Boolean(error)}>
    <FieldLegend>Người nhập tay để trống Sale phụ trách</FieldLegend>
    <FieldDescription>Chọn tài khoản nhập lead cho đội Sale, ví dụ quản trị viên hoặc giám đốc. Khi những người này không chọn Sale trong biểu mẫu, lead sẽ chờ rule chia Sale. Người tạo vẫn được lưu trong lịch sử.</FieldDescription>
    <FieldDescription>Cần bật tự phân công, chọn nguồn “Nhập tay” và có rule “Lead được tạo” đang hoạt động. Nếu đã chọn Sale cụ thể trong biểu mẫu, hệ thống giữ lựa chọn đó.</FieldDescription>
    <FieldGroup className="gap-3">
      <Field><FieldLabel htmlFor="manual-lead-creators-search">Tìm người dùng trong chương trình</FieldLabel><Input id="manual-lead-creators-search" value={filters.search} onChange={event => setFilters({ search: event.target.value, page: 1 })} placeholder="Nhập họ và tên…" disabled={disabled} /></Field>
      <p className="text-sm text-muted-foreground" role="status">Đã chọn {value.length} người dùng</p>
      {value.length > 0 && <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">{value.map(id => <div key={id} className="flex items-center justify-between gap-2 rounded-md border p-2"><span className="min-w-0 break-words text-sm">{names.get(id)?.fullName ?? "Tài khoản đã chọn, hiện không khả dụng"}{names.has(id) && !names.get(id)?.active ? " (không còn hoạt động)" : ""}</span><Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Bỏ chọn ${names.get(id)?.fullName ?? "tài khoản"}`} onClick={() => onChange(value.filter(item => item !== id))}>Bỏ chọn</Button></div>)}</div>}
      {query.isError ? <FieldError>Không tải được danh sách người dùng. <Button type="button" variant="link" onClick={() => query.refetch()}>Thử lại</Button></FieldError> : query.isPending ? <p role="status">Đang tải người dùng…</p> : <>
        <FieldGroup className="gap-3">{query.data.data.map(user => <Field key={user.id} orientation="horizontal"><Checkbox id={`manual-creator-${user.id}`} checked={selected.has(user.id)} disabled={disabled || query.isPlaceholderData || (value.length >= 500 && !selected.has(user.id))} onCheckedChange={checked => onChange(checked === true ? [...value, user.id] : value.filter(id => id !== user.id))} /><FieldLabel htmlFor={`manual-creator-${user.id}`}>{user.fullName}</FieldLabel></Field>)}</FieldGroup>
        {query.data.data.length === 0 && <p className="text-sm text-muted-foreground">Không tìm thấy người dùng phù hợp.</p>}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={disabled || filters.page === 1 || query.isFetching} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Trang trước</Button><span className="text-sm">Trang {filters.page}</span><Button type="button" variant="outline" disabled={disabled || !query.data.hasMore || query.isFetching} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Trang sau</Button></div>
      </>}
      {error && <FieldError>{error}</FieldError>}
    </FieldGroup>
  </FieldSet>;
}
