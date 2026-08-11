import * as React from "react"
import { format, parseISO } from "date-fns"
import { DatePickerWithRange } from "./date-range-picker"
import { DateRange } from "react-day-picker"

export function DateRangeFilter({
  fromDate,
  toDate,
  onChange,
  className,
}: {
  fromDate: string
  toDate: string
  onChange: (from: string, to: string) => void
  className?: string
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
    />
  )
}
