import { useWatch, type UseFormReturn } from "react-hook-form";
import {
  WORK_WEEKDAYS,
  type SaleWorkScheduleInput,
  type WorkCalendar,
} from "@admission-crm/shared/sale-work-schedule";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export function WorkWeekEditor({
  form,
}: {
  form: UseFormReturn<SaleWorkScheduleInput>;
}) {
  const days = useWatch({ control: form.control, name: "calendar.days" });
  const updateDay = (
    index: number,
    shifts: WorkCalendar["days"][number]["shifts"],
  ) =>
    form.setValue(`calendar.days.${index}.shifts`, shifts, {
      shouldDirty: true,
    });
  return (
    <FieldSet>
      <FieldLegend>Ca làm việc trong tuần</FieldLegend>
      <FieldDescription>
        Tắt ngày để đặt ngày nghỉ. Mỗi ngày có tối đa hai ca, cùng ngày và không
        chồng nhau.
      </FieldDescription>
      <Button
        type="button"
        variant="outline"
        disabled={!days[1].shifts.length}
        onClick={() =>
          days.forEach((day, index) => {
            if (day.shifts.length)
              updateDay(
                index,
                days[1].shifts.map((shift) => ({ ...shift })),
              );
          })
        }
      >
        Áp dụng giờ Thứ 2 cho các ngày đang làm việc
      </Button>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 0].map((index) => (
          <WorkDayEditor
            key={index}
            form={form}
            index={index}
            shifts={days[index].shifts}
            update={(shifts) => updateDay(index, shifts)}
          />
        ))}
      </div>
    </FieldSet>
  );
}
function WorkDayEditor({
  form,
  index,
  shifts,
  update,
}: {
  form: UseFormReturn<SaleWorkScheduleInput>;
  index: number;
  shifts: WorkCalendar["days"][number]["shifts"];
  update: (shifts: WorkCalendar["days"][number]["shifts"]) => void;
}) {
  const error = form.formState.errors.calendar?.days?.[index]?.shifts?.message;
  return (
    <FieldSet className="min-w-0 rounded-lg border p-3">
      <FieldLegend>{WORK_WEEKDAYS[index]}</FieldLegend>
      <Field orientation="horizontal">
        <Checkbox
          id={`schedule-day-${index}`}
          checked={shifts.length > 0}
          onCheckedChange={(checked) =>
            update(
              checked === true
                ? [
                    { start: "08:00", end: "12:00" },
                    { start: "13:00", end: "17:00" },
                  ]
                : [],
            )
          }
        />
        <FieldLabel htmlFor={`schedule-day-${index}`}>Làm việc</FieldLabel>
      </Field>
      {shifts.map((_, shiftIndex) => (
        <FieldGroup key={shiftIndex}>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`shift-${index}-${shiftIndex}-start`}>
              Ca {shiftIndex + 1} — Từ
            </FieldLabel>
            <Input
              id={`shift-${index}-${shiftIndex}-start`}
              type="time"
              step="60"
              {...form.register(
                `calendar.days.${index}.shifts.${shiftIndex}.start`,
              )}
              aria-invalid={Boolean(error)}
              aria-label={`${WORK_WEEKDAYS[index]}, ca ${shiftIndex + 1}, từ`}
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`shift-${index}-${shiftIndex}-end`}>
              Đến
            </FieldLabel>
            <Input
              id={`shift-${index}-${shiftIndex}-end`}
              type="time"
              step="60"
              {...form.register(
                `calendar.days.${index}.shifts.${shiftIndex}.end`,
              )}
              aria-invalid={Boolean(error)}
              aria-label={`${WORK_WEEKDAYS[index]}, ca ${shiftIndex + 1}, đến`}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            onClick={() => update(shifts.filter((_, i) => i !== shiftIndex))}
          >
            Bỏ ca {shiftIndex + 1}
          </Button>
        </FieldGroup>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {shifts.length === 0 && (
        <p className="text-sm text-muted-foreground">Ngày nghỉ</p>
      )}
      {shifts.length === 1 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => update([...shifts, { start: "13:00", end: "17:00" }])}
        >
          Thêm ca
        </Button>
      )}
    </FieldSet>
  );
}
