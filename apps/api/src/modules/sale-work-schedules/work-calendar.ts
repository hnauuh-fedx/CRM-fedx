import type { WorkCalendar } from "@admission-crm/shared/sale-work-schedule";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OFFSET = 7 * 60 * MINUTE;
const timeMinutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};
export type CalendarPeriod = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  calendar: WorkCalendar;
};

function windows(date: number, calendar: WorkCalendar) {
  const local = new Date(date + OFFSET);
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    OFFSET;
  const shifts =
    calendar.days.find((day) => day.weekday === local.getUTCDay())?.shifts ??
    [];
  return {
    midnight,
    shifts: [...shifts]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((shift) => ({
        start: midnight + timeMinutes(shift.start) * MINUTE,
        end: midnight + timeMinutes(shift.end) * MINUTE,
      })),
  };
}

export function isWorkingInstant(date: Date, calendar: WorkCalendar) {
  return windows(date.getTime(), calendar).shifts.some(
    (shift) => shift.start <= date.getTime() && date.getTime() < shift.end,
  );
}

// Half-open shifts: a deadline exactly at closing is executed at the next opening.
export function nextWorkingInstant(date: Date, calendar: WorkCalendar): Date {
  let cursor = date.getTime();
  for (let day = 0; day < 8; day++) {
    const current = windows(cursor, calendar);
    for (const shift of current.shifts) {
      if (cursor < shift.end) return new Date(Math.max(cursor, shift.start));
    }
    cursor = current.midnight + DAY;
  }
  throw new Error("Lịch không có ca làm việc.");
}

// Historical periods preserve elapsed work when schedules or membership change.
export function workingDeadline(
  start: Date,
  minutes: number,
  periods: CalendarPeriod[],
): Date | null {
  let remaining = Math.max(0, minutes) * MINUTE;
  for (const period of periods) {
    let cursor = Math.max(start.getTime(), period.effectiveFrom.getTime());
    const end = period.effectiveTo?.getTime() ?? Infinity;
    const weeklyWork = period.calendar.days.reduce(
      (sum, day) =>
        sum +
        day.shifts.reduce(
          (total, shift) =>
            total +
            (timeMinutes(shift.end) - timeMinutes(shift.start)) * MINUTE,
          0,
        ),
      0,
    );
    if (weeklyWork <= 0) continue;
    while (cursor < end) {
      const current = windows(cursor, period.calendar);
      if (cursor === current.midnight) {
        const weeks = Math.min(
          Math.max(0, Math.floor((remaining - 1) / weeklyWork)),
          Math.floor((end - cursor) / (7 * DAY)),
        );
        if (weeks > 0) {
          cursor += weeks * 7 * DAY;
          remaining -= weeks * weeklyWork;
          continue;
        }
      }
      for (const shift of current.shifts) {
        const from = Math.max(cursor, shift.start);
        const to = Math.min(end, shift.end);
        if (from >= to) continue;
        if (remaining < to - from) return new Date(from + remaining);
        remaining -= to - from;
      }
      cursor = current.midnight + DAY;
    }
  }
  return null;
}
