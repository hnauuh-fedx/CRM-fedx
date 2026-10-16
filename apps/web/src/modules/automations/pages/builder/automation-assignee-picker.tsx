import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AutomationOptions } from "../../automation.types";

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

export function AutomationAssigneePicker({ assignees, selectedIds, isLoading, onSelect }: {
  assignees: AutomationOptions["assignmentPoolAssignees"];
  selectedIds: string[];
  isLoading: boolean;
  onSelect: (assigneeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const keyword = normalizeSearch(search);
  const selectedIdSet = new Set(selectedIds);
  const visibleAssignees = assignees.filter((assignee) => normalizeSearch(assignee.fullName).includes(keyword));

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 w-full justify-between" disabled={isLoading} aria-label="Tìm và thêm nhân viên vào danh sách phân công" aria-expanded={open}>
          {isLoading ? "Đang tải nhân viên…" : "Tìm và chọn nhân viên…"}
          <ChevronsUpDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên nhân viên…" aria-label="Tìm nhân viên trong chương trình" className="min-h-11" />
        <div className="mt-2 max-h-72 overflow-y-auto" aria-label="Nhân viên trong chương trình">
          {visibleAssignees.length === 0 ? <p role="status" className="p-3 text-sm text-muted-foreground">Không tìm thấy nhân viên phù hợp.</p> : visibleAssignees.map((assignee) => (
            <Button key={assignee.id} type="button" variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left" disabled={selectedIdSet.has(assignee.id) || !assignee.canReceiveLead} onClick={() => { onSelect(assignee.id); setOpen(false); setSearch(""); }}>
              <span className="min-w-0 break-words">
                <span className="block">{assignee.fullName}</span>
                {selectedIdSet.has(assignee.id) ? <span className="block text-xs text-muted-foreground">Đã thêm vào danh sách</span> : !assignee.canReceiveLead ? <span className="block text-xs text-muted-foreground">Chưa đủ quyền nhận Lead trong phạm vi của bạn</span> : null}
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
