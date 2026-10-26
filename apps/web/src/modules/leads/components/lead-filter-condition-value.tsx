import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FilterConditionState, FilterFieldDefinition } from "@/modules/leads/filter-fields";
import { operatorNeedsValueInput } from "@/modules/leads/filter-operators";

const valueClassName = "h-9 w-full sm:w-48";

/**
 * Ô "giá trị" của 1 dòng điều kiện, hiển thị theo kiểu dữ liệu của trường và toán tử:
 * dropdown → chọn giá trị; text → nhập; ngày → lịch / khoảng ngày / số ngày; mốc thời gian & có/không có giá trị → ẩn.
 */
export function LeadFilterConditionValue({
  condition,
  fieldDef,
  onChange,
  className,
}: {
  condition: FilterConditionState;
  fieldDef: Pick<FilterFieldDefinition, "label" | "dataType" | "options" | "maxCount">;
  onChange: (patch: Partial<FilterConditionState>) => void;
  /** Overrides the compact width used in the Lead list filter row. */
  className?: string;
}) {
  const { operator, value, valueTo, numberValue } = condition;
  const controlClassName = cn(valueClassName, className);
  if (!operatorNeedsValueInput(operator)) return null;
  const label = `Giá trị lọc cho ${fieldDef.label}`;

  if (operator === "COUNT_EQUALS") {
    return (
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={fieldDef.maxCount}
        step={1}
        aria-label={`Số lượng ${fieldDef.label.toLocaleLowerCase("vi-VN")}`}
        value={numberValue ?? ""}
        onChange={(event) => onChange({ numberValue: event.target.value === "" ? null : Math.max(0, Math.trunc(Number(event.target.value))) })}
        placeholder="Nhập số lượng"
        className={controlClassName}
      />
    );
  }

  if (operator === "IS_X_DAYS_AGO") {
    return (
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={3650}
        aria-label={`Số ngày trước cho ${fieldDef.label}`}
        value={numberValue ?? ""}
        onChange={(event) => onChange({ numberValue: event.target.value === "" ? null : Math.trunc(Number(event.target.value)) })}
        placeholder="Nhập số ngày"
        className={controlClassName}
      />
    );
  }

  if (fieldDef.dataType === "date") {
    if (operator === "BETWEEN") {
      return (
        <DateRangeFilter
          className={cn("w-full sm:w-64", className)}
          buttonClassName="h-9"
          placeholder="Từ ngày – đến ngày"
          fromDate={typeof value === "string" ? value : ""}
          toDate={typeof valueTo === "string" ? valueTo : ""}
          onChange={(fromDate, toDate) => onChange({ value: fromDate || null, valueTo: toDate || null })}
        />
      );
    }
    const selected = typeof value === "string" && value ? parseISO(value) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={label}
            className={cn(controlClassName, "justify-start font-normal", !selected && "text-muted-foreground")}
          >
            <CalendarIcon aria-hidden="true" />
            {selected ? format(selected, "dd/MM/yyyy") : "Chọn ngày"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(day) => onChange({ value: day ? format(day, "yyyy-MM-dd") : null })}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (fieldDef.dataType === "number") {
    const toNumber = (raw: string) => (raw === "" ? null : Number(raw));
    if (operator === "BETWEEN") {
      return (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input type="number" aria-label={`Giá trị từ cho ${fieldDef.label}`} placeholder="Từ" className="h-9 w-full sm:w-28"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) => onChange({ value: toNumber(event.target.value) })} />
          <span className="text-muted-foreground" aria-hidden="true">–</span>
          <Input type="number" aria-label={`Giá trị đến cho ${fieldDef.label}`} placeholder="Đến" className="h-9 w-full sm:w-28"
            value={valueTo === null || valueTo === undefined ? "" : String(valueTo)}
            onChange={(event) => onChange({ valueTo: toNumber(event.target.value) })} />
        </div>
      );
    }
    return (
      <Input type="number" aria-label={label} placeholder="Nhập số" className={controlClassName}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(event) => onChange({ value: toNumber(event.target.value) })} />
    );
  }

  if (fieldDef.dataType === "enum") {
    const options = fieldDef.options ?? [];
    return (
      <Select value={typeof value === "string" && value ? value : undefined} onValueChange={(next) => onChange({ value: next })}>
        <SelectTrigger aria-label={label} className={controlClassName} disabled={options.length === 0}>
          <SelectValue placeholder={options.length === 0 ? "Không có dữ liệu" : "Chọn giá trị"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (fieldDef.dataType === "boolean") {
    return (
      <Select value={value === true ? "true" : value === false ? "false" : undefined} onValueChange={(next) => onChange({ value: next === "true" })}>
        <SelectTrigger aria-label={label} className={controlClassName}>
          <SelectValue placeholder="Chọn giá trị" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Có</SelectItem>
          <SelectItem value="false">Không</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      aria-label={label}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange({ value: event.target.value })}
      placeholder="Nhập giá trị"
      maxLength={500}
      className={controlClassName}
    />
  );
}
