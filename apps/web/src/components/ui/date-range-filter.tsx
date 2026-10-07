import * as React from "react"
import { format, parseISO } from "date-fns"
import { DatePickerWithRange } from "./date-range-picker"
import { DateRange } from "react-day-picker"

export function DateRangeFilter({
  fromDate,
  toDate,
  onChange,
  className,
  placeholder,
  buttonClassName,
  onOpenChange,
  isActive,
}: {
  fromDate: string
  toDate: string
  onChange: (from: string, to: string) => void
  className?: string
  placeholder?: string
  buttonClassName?: string
  onOpenChange?: (open: boolean) => void
  isActive?: boolean
}) {
  const dateRange = React.useMemo<DateRange | undefined>(() => {
    if (!fromDate && !toDate) return undefined
    return {
      from: fromDate ? parseISO(fromDate) : undefined,
      to: toDate ? parseISO(toDate) : undefined,
    }
  }, [fromDate, toDate])

  const handleDateChange = (range: DateRange | undefined) => {
    const fromStr = range?.from ? format(range.from, "yyyy-MM-dd") : ""
    const toStr = range?.to ? format(range.to, "yyyy-MM-dd") : ""
    onChange(fromStr, toStr)
  }

  return (
    <DatePickerWithRange
      className={className}
      date={dateRange}
      setDate={handleDateChange}
      placeholder={placeholder}
      buttonClassName={buttonClassName}
      onOpenChange={onOpenChange}
      isActive={isActive}
    />
  )
}
