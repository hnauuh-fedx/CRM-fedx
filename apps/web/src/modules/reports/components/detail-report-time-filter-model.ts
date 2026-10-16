export type RelativeDatePreset =
  | "LAST_7_DAYS"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER";
export type DetailReportTimeFilterValue =
  | { condition: "RELATIVE"; preset: RelativeDatePreset }
  | { condition: "CUSTOM"; fromDate: string; toDate: string };
export type ReportDateRange = { fromDate: string; toDate: string };
export function resolveDetailReportDateRange(
  value: DetailReportTimeFilterValue,
  today = new Date(),
): ReportDateRange {
  if (value.condition === "CUSTOM")
    return { fromDate: value.fromDate, toDate: value.toDate };

  let from = startOfDay(today);
  let to = startOfDay(today);
  if (value.preset === "LAST_7_DAYS") from = addDays(to, -6);
  if (value.preset === "THIS_WEEK" || value.preset === "LAST_WEEK") {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = addDays(
      startOfDay(today),
      -mondayOffset + (value.preset === "LAST_WEEK" ? -7 : 0),
    );
    to = value.preset === "LAST_WEEK" ? addDays(from, 6) : startOfDay(today);
  }
  if (value.preset === "THIS_MONTH" || value.preset === "LAST_MONTH") {
    const monthOffset = value.preset === "LAST_MONTH" ? -1 : 0;
    from = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    to =
      value.preset === "LAST_MONTH"
        ? new Date(from.getFullYear(), from.getMonth() + 1, 0)
        : startOfDay(today);
  }
  if (value.preset === "THIS_QUARTER" || value.preset === "LAST_QUARTER") {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const quarterOffset = value.preset === "LAST_QUARTER" ? -3 : 0;
    from = new Date(today.getFullYear(), quarterStartMonth + quarterOffset, 1);
    to =
      value.preset === "LAST_QUARTER"
        ? new Date(from.getFullYear(), from.getMonth() + 3, 0)
        : startOfDay(today);
  }
  return { fromDate: toDateInput(from), toDate: toDateInput(to) };
}
export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
