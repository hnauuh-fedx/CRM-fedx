import { useCallback, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { normalizeVietnameseText } from "@admission-crm/shared/lead-field-groups";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type GroupedFieldOption = {
  value: string;
  label: string;
  /** Options sharing a group key are listed under one heading; an empty key renders without heading. */
  groupKey: string;
  groupLabel: string;
  /** Secondary line such as the field code or data type. */
  description?: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Extra text matched by the search box. */
  keywords?: string[];
};

type GroupedFieldPickerProps = {
  id?: string;
  value?: string | null;
  options: GroupedFieldOption[];
  onChange: (value: string, option: GroupedFieldOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Server-side search and pagination for large option catalogs. */
  onSearchChange?: (search: string) => void;
  selectedLabel?: string;
  searchLabel?: string;
  loading?: boolean;
  footer?: ReactNode;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  /** Extra `data-*` attributes for the trigger button (test hooks, analytics). */
  triggerData?: Record<`data-${string}`, string>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type OptionGroup = { key: string; label: string; options: Array<{ option: GroupedFieldOption; index: number }> };

/**
 * Searchable field dropdown grouped by Lead form clusters.
 * Opens below the trigger (flips above when space is short), never covers the field label,
 * and scrolls inside a height-limited list.
 */
export function GroupedFieldPicker({
  id,
  value,
  options,
  onChange,
  placeholder = "Chọn trường dữ liệu",
  searchPlaceholder = "Tìm tên hoặc mã trường",
  emptyText = "Không tìm thấy trường phù hợp.",
  onSearchChange,
  selectedLabel,
  searchLabel = "Tìm trường dữ liệu",
  loading = false,
  footer,
  disabled,
  className,
  size = "default",
  triggerData,
  ...aria
}: GroupedFieldPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = options.find((option) => option.value === value);

  const visible = useMemo(() => {
    if (onSearchChange) return options;
    const keyword = normalizeVietnameseText(search);
    if (!keyword) return options;
    return options.filter((option) =>
      [option.label, option.value, option.description ?? "", option.groupLabel, ...(option.keywords ?? [])]
        .some((text) => normalizeVietnameseText(text).includes(keyword)),
    );
  }, [options, search, onSearchChange]);

  const groups = useMemo(() => {
    const result: OptionGroup[] = [];
    visible.forEach((option, index) => {
      const last = result[result.length - 1];
      const existing = last?.key === option.groupKey ? last : result.find((group) => group.key === option.groupKey);
      if (existing) existing.options.push({ option, index });
      else result.push({ key: option.groupKey, label: option.groupLabel, options: [{ option, index }] });
    });
    return result;
  }, [visible]);
  // Grouping can reorder options, so keyboard navigation follows the rendered order.
  const orderedIndexes = useMemo(() => groups.flatMap((group) => group.options.map((item) => item.index)), [groups]);

  // Runs once per opening: the list size depends on Radix positioning, so scroll after layout settles.
  const scrollToSelected = useCallback((list: HTMLDivElement | null) => {
    if (!list) return;
    requestAnimationFrame(() => {
      const selectedNode = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selectedNode) list.scrollTop = selectedNode.offsetTop - (list.clientHeight - selectedNode.offsetHeight) / 2;
    });
  }, []);

  function optionId(index: number) {
    return `${listId}-option-${index}`;
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    setSearch("");
    onSearchChange?.("");
    setActiveIndex(nextOpen ? options.findIndex((option) => option.value === value) : -1);
  }

  function choose(option: GroupedFieldOption) {
    if (option.disabled) return;
    onChange(option.value, option);
    changeOpen(false);
  }

  function moveActive(step: number | "first" | "last") {
    const enabled = orderedIndexes.filter((index) => !visible[index].disabled);
    if (!enabled.length) return;
    const position = enabled.indexOf(activeIndex);
    const next = step === "first"
      ? enabled[0]
      : step === "last"
        ? enabled[enabled.length - 1]
        : enabled[position === -1 ? (step > 0 ? 0 : enabled.length - 1) : (position + step + enabled.length) % enabled.length];
    setActiveIndex(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (loading) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveActive(event.key === "Home" ? "first" : "last");
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    // Modal keeps wheel scrolling inside the list when the picker is rendered within a dialog.
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverTrigger asChild>
        <Button
          {...triggerData}
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={aria["aria-label"]}
          aria-labelledby={aria["aria-labelledby"]}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={aria["aria-invalid"]}
          className={cn(
            "w-full justify-between bg-background px-3 text-left font-normal",
            size === "sm" ? "h-9" : "h-10",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && !value && "text-muted-foreground")}>
            {selected?.label ?? selectedLabel ?? (value || placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        className="flex w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-2rem)] flex-col p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                onSearchChange?.(event.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              className="h-9 pl-9"
              placeholder={searchPlaceholder}
              role="combobox"
              aria-label={searchLabel}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            />
          </div>
        </div>
        <div
          ref={scrollToSelected}
          id={listId}
          role="listbox"
          aria-label={aria["aria-label"] ?? "Danh sách trường dữ liệu"}
          aria-busy={loading}
          className={cn("relative min-h-24 overflow-y-auto overscroll-contain px-1 pb-1", footer ? "max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-8rem))]" : "max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-4rem))]")}
        >
          {loading ? <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">Đang tải danh sách…</p> : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : groups.map((group) => (
            <div key={group.key || "__ungrouped__"} role="group" aria-label={group.label || undefined} className="py-1">
              {group.label ? (
                <p className="sticky top-0 z-10 bg-popover px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.label}</p>
              ) : null}
              {group.options.map(({ option, index }) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    data-active={index === activeIndex}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 text-sm data-[active=true]:bg-accent",
                      group.label ? "pl-4" : "pl-2",
                      option.disabled && "cursor-not-allowed opacity-60",
                    )}
                    onMouseMove={() => { if (!option.disabled && index !== activeIndex) setActiveIndex(index); }}
                    onClick={() => choose(option)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}
                      {option.disabledReason ? <span className="block text-xs text-muted-foreground">{option.disabledReason}</span> : null}
                    </span>
                    {option.badge ? <Badge variant="outline" className="shrink-0 text-[10px]">{option.badge}</Badge> : null}
                    <Check className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {footer && <div className="border-t p-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}
