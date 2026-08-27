import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AutomationDataField } from "../../automation.types";

type AutomationFieldPickerProps = {
  fields: AutomationDataField[];
  selectedReference?: string;
  placeholder: string;
  onSelect: (field: AutomationDataField) => void;
};

export function AutomationFieldPicker({ fields, selectedReference, placeholder, onSelect }: AutomationFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedField = fields.find((field) => field.reference === selectedReference);
  const groupedFields = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    const visible = keyword
      ? fields.filter((field) => [field.label, field.key, field.groupLabel].some((value) => value.toLocaleLowerCase("vi").includes(keyword)))
      : fields;
    const groups = new Map<string, { label: string; fields: AutomationDataField[] }>();
    for (const field of visible) {
      const group = groups.get(field.groupKey) ?? { label: field.groupLabel, fields: [] };
      group.fields.push(field);
      groups.set(field.groupKey, group);
    }
    return [...groups.entries()];
  }, [fields, search]);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-auto min-h-10 w-full justify-between py-2 text-left font-normal">
          <span className="min-w-0 truncate">{selectedField?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Tìm tên hoặc mã trường" aria-label="Tìm trường dữ liệu" />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {groupedFields.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Không có trường dữ liệu phù hợp.</p>
          ) : groupedFields.map(([groupKey, group]) => (
            <section key={groupKey} aria-label={group.label} className="py-1">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.label}</p>
              {group.fields.map((field) => (
                <button
                  key={field.reference}
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => { onSelect(field); setOpen(false); setSearch(""); }}
                >
                  <Check className={`size-4 shrink-0 ${selectedReference === field.reference ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{field.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{field.key}</span>
                  </span>
                  <Badge variant={field.source === "custom" ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                    {field.source === "custom" ? "Tùy chỉnh" : field.dataType}
                  </Badge>
                </button>
              ))}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
