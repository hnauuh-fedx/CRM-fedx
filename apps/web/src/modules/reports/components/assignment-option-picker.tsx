import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AssignmentOptionKind } from "@admission-crm/shared/assignment-report";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getAssignmentOptions } from "@/services/assignment-report.service";

type Props = { kind: AssignmentOptionKind; label: string; value: string[]; departmentIds?: string[]; disabled?: boolean; onChange: (ids: string[]) => void };
export function AssignmentOptionPicker({ kind, label, value, departmentIds = [], disabled, onChange }: Props) {
  const id = useId();
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const selectedIds = new Set(value);
  const options = useQuery({
    queryKey: ["assignment-report-options", auth.user?.id, selectedProgramId, kind, search, page, departmentIds],
    queryFn: ({ signal }) => getAssignmentOptions(kind, search, page, departmentIds, auth.accessToken!, signal),
    enabled: open && Boolean(auth.accessToken && selectedProgramId), staleTime: 30_000,
  });
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button id={id} type="button" variant="outline" className="w-full justify-between" disabled={disabled}>
        {value.length ? `Đã chọn ${value.length}` : "Tất cả"}<ChevronDown aria-hidden="true" data-icon="inline-end" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
        <Input aria-label={`Tìm ${label.toLocaleLowerCase("vi-VN")}`} placeholder="Nhập tên để tìm…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <Button type="button" variant="ghost" size="sm" disabled={!value.length} onClick={() => onChange([])}>Bỏ chọn tất cả ({value.length})</Button>
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto" aria-live="polite">
          {options.isPending ? <p className="text-sm text-muted-foreground">Đang tải lựa chọn…</p> : options.isError ?
            <Button type="button" variant="outline" onClick={() => options.refetch()}>Tải lại lựa chọn</Button> : !options.data?.items.length ?
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu phù hợp trong phạm vi báo cáo.</p> : options.data.items.map((option) =>
                <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-accent">
                  <Checkbox checked={selectedIds.has(option.id)} disabled={!selectedIds.has(option.id) && value.length >= 50}
                    onCheckedChange={(checked) => onChange(checked === true ? [...value, option.id] : value.filter((item) => item !== option.id))} />
                  <span className="text-sm">{option.name}</span>
                </label>)}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page === 1 || options.isFetching} onClick={() => setPage(page - 1)}>Trước</Button>
          <span className="text-xs text-muted-foreground">Trang {page}</span>
          <Button type="button" size="sm" variant="outline" disabled={!options.data?.hasMore || options.isFetching} onClick={() => setPage(page + 1)}>Sau</Button>
        </div>
      </PopoverContent>
    </Popover>
  </Field>;
}
