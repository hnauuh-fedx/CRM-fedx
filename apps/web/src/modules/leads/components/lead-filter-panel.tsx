import { FilterX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LeadFilterBuilder } from "./lead-filter-builder";
import type { FilterConditionState } from "@/modules/leads/filter-fields";
import type { LeadFilterOptions, LeadListFilters } from "@/modules/leads/lead.types";

/**
 * Thanh tìm kiếm + bộ lọc nâng cao của danh sách lead (CRM Sale và CRM Marketing).
 * Tìm kiếm áp dụng ngay (debounce ở trang); bộ lọc chỉ áp dụng khi bấm "Áp dụng".
 */
export function LeadFilterPanel({
  filters,
  options,
  filterConditions,
  canViewSensitiveLeadData,
  onChange,
  onReset,
  onApplyConditions,
}: {
  filters: LeadListFilters;
  options?: LeadFilterOptions;
  filterConditions: FilterConditionState[];
  canViewSensitiveLeadData: boolean;
  onChange: (field: keyof LeadListFilters, value: string) => void;
  onReset: () => void;
  onApplyConditions: (conditions: FilterConditionState[]) => void;
}) {
  const hasActiveFilters = Object.values(filters).some(Boolean) || filterConditions.length > 0;

  return (
    <Card className={cn("border-border/70 py-4 shadow-xs", hasActiveFilters && "border-primary/30 bg-primary/5")}>
      <CardContent className="flex flex-wrap items-center gap-3 px-5">
        <label htmlFor="lead-search" className="text-base font-semibold">Tìm kiếm</label>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="lead-search"
            type="search"
            className={cn("pl-9", filters.search && "border-primary/40 bg-primary/5")}
            value={filters.search}
            placeholder="Họ tên, SĐT, email hoặc mã lead"
            onChange={(event) => onChange("search", event.target.value)}
          />
        </div>
        <LeadFilterBuilder
          appliedConditions={filterConditions}
          options={options}
          canViewSensitiveLeadData={canViewSensitiveLeadData}
          onApply={onApplyConditions}
        />
        <Button type="button" variant="outline" className="sm:ml-auto" onClick={onReset} disabled={!hasActiveFilters}>
          <FilterX data-icon="inline-start" aria-hidden="true" />
          Xóa lọc
        </Button>
      </CardContent>
    </Card>
  );
}
