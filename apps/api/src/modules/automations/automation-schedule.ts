export type AutomationSchedule = {
  timezone: string;
  time: string;
  days: string[];
  excludedDates?: string;
};

export function getScheduleMinute(date: Date) {
  const value = new Date(date);
  value.setUTCSeconds(0, 0);
  return value;
}

export function isAutomationScheduleDue(date: Date, schedule: AutomationSchedule) {
  if (!isValidAutomationSchedule(schedule)) return false;
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: schedule.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date).map((part) => [part.type, part.value]));
  } catch {
    return false;
  }
  const weekday = ({ Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6" } as Record<string, string>)[parts.weekday];
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const excluded = new Set((schedule.excludedDates ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  return `${parts.hour}:${parts.minute}` === schedule.time && schedule.days.includes(weekday) && !excluded.has(localDate);
}

export function isValidAutomationSchedule(schedule: AutomationSchedule) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) return false;
  if (schedule.days.length === 0 || schedule.days.some((day) => !/^[0-6]$/.test(day))) return false;
  if ((schedule.excludedDates ?? "").split(",").map((value) => value.trim()).filter(Boolean).some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: schedule.timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function findLatestDueScheduleMinute(now: Date, schedule: AutomationSchedule, catchUpMinutes = 15) {
  for (let minutesAgo = 0; minutesAgo <= catchUpMinutes; minutesAgo += 1) {
    const candidate = new Date(now.getTime() - minutesAgo * 60_000);
    if (isAutomationScheduleDue(candidate, schedule)) return getScheduleMinute(candidate);
  }
  return null;
}
