import * as React from "react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
  placeholder?: string
  buttonClassName?: string
  onOpenChange?: (open: boolean) => void
  isActive?: boolean
}

export function DatePickerWithRange({
  className,
  date,
  setDate,
  placeholder = "Chọn khoảng thời gian",
  buttonClassName,
  onOpenChange,
  isActive,
}: DatePickerWithRangeProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            aria-pressed={isActive}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground",
              buttonClassName
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "dd/MM/yyyy", { locale: vi })} -{" "}
                  {format(date.to, "dd/MM/yyyy", { locale: vi })}
                </>
              ) : (
                format(date.from, "dd/MM/yyyy", { locale: vi })
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            locale={vi}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
