import { useMemo, useState } from "react";
import { Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LeadFilterConditionRow } from "./lead-filter-condition-row";
import type { FilterCombinator, FilterConditionState } from "@/modules/leads/filter-fields";
import { getAvailableFields } from "@/modules/leads/filter-fields";
import { createConditionId } from "@/modules/leads/filter-serialization";
import { validateConditions } from "@/modules/leads/filter-validation";
import type { LeadFilterOptions } from "@/modules/leads/lead.types";

export const MAX_FILTER_CONDITIONS = 5;

function emptyCondition(combinator?: FilterCombinator): FilterConditionState {
  return { id: createConditionId(), combinator, field: null, operator: null, value: null, valueTo: null, numberValue: null };
}

/**
 * Popover "Bộ lọc": danh sách tối đa 5 điều kiện, nối Và/Hoặc theo thứ tự dòng.
 * Chỉnh sửa trên bản nháp; chỉ khi bấm "Áp dụng" mới gọi `onApply`.
 */
export function LeadFilterBuilder({
  appliedConditions,
  options,
  canViewSensitiveLeadData,
  onApply,
}: {
  appliedConditions: FilterConditionState[];
  options?: LeadFilterOptions;
  canViewSensitiveLeadData: boolean;
  onApply: (conditions: FilterConditionState[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterConditionState[]>([]);
  const availableFields = useMemo(
    () => getAvailableFields(options?.customFields ?? [], options, canViewSensitiveLeadData),
    [options, canViewSensitiveLeadData],
  );
  const errors = validateConditions(draft);
  const appliedCount = appliedConditions.length;

  function changeOpen(next: boolean) {
    if (next) setDraft(appliedConditions.length > 0 ? appliedConditions : [emptyCondition()]);
    setOpen(next);
  }

  function update(id: string, patch: Partial<FilterConditionState>) {
    setDraft((current) => current.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition)));
  }

  function remove(id: string) {
    // Các dòng sau dồn lên; dòng đứng đầu không có phép nối.
    setDraft((current) => current
      .filter((condition) => condition.id !== id)
      .map((condition, index) => (index === 0 ? { ...condition, combinator: undefined } : condition)));
  }

  function add(combinator: FilterCombinator, afterId?: string) {
    setDraft((current) => {
      if (current.length >= MAX_FILTER_CONDITIONS) return current;
      const next = emptyCondition(current.length === 0 ? undefined : combinator);
      const index = afterId ? current.findIndex((condition) => condition.id === afterId) : -1;
      return index < 0 ? [...current, next] : [...current.slice(0, index + 1), next, ...current.slice(index + 1)];
    });
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={appliedCount > 0 ? `Bộ lọc, đang áp dụng ${appliedCount} điều kiện` : "Bộ lọc"}>
          <Filter data-icon="inline-start" aria-hidden="true" />
          Bộ lọc
          {appliedCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
              {appliedCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(52rem,calc(100vw-2rem))] p-0">
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">Lọc danh sách theo:</p>
          <div className="flex max-h-[min(26rem,60dvh)] flex-col gap-2 overflow-y-auto">
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có điều kiện. Bấm "Thêm điều kiện lọc" để bắt đầu.</p>
            ) : draft.map((condition, index) => (
              <LeadFilterConditionRow
                key={condition.id}
                index={index}
                condition={condition}
                availableFields={availableFields}
                onChange={(patch) => update(condition.id, patch)}
                onRemove={() => remove(condition.id)}
                onAddCondition={(combinator) => add(combinator, condition.id)}
                canAddMore={draft.length < MAX_FILTER_CONDITIONS}
              />
            ))}
          </div>
          {errors.length > 0 ? (
            <ul className="flex flex-col gap-0.5 text-xs text-destructive" aria-live="polite">
              {errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="link"
            className="px-0"
            onClick={() => add("AND")}
            disabled={draft.length >= MAX_FILTER_CONDITIONS}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Thêm điều kiện lọc
            {draft.length >= MAX_FILTER_CONDITIONS ? <span className="text-xs text-muted-foreground">(tối đa {MAX_FILTER_CONDITIONS})</span> : null}
          </Button>
          <Button type="button" onClick={apply} disabled={errors.length > 0}>Áp dụng</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
