import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWorkCalendar,
  saleWorkScheduleSchema,
  workCalendarSchema,
} from "@admission-crm/shared/sale-work-schedule";
import {
  isWorkingInstant,
  nextWorkingInstant,
  workingDeadline,
  type CalendarPeriod,
} from "./work-calendar";

const calendar = defaultWorkCalendar();
const date = (value: string) => new Date(`${value}+07:00`);
const periods: CalendarPeriod[] = [
  { calendar, effectiveFrom: date("2026-01-01T00:00:00"), effectiveTo: null },
];
test("nghỉ trưa không cộng thời gian chờ", () => {
  assert.equal(
    workingDeadline(date("2026-10-26T11:30:00"), 60, periods)?.toISOString(),
    date("2026-10-26T13:30:00").toISOString(),
  );
});
test("qua đêm và cuối tuần chỉ đếm phần thời gian còn lại", () => {
  assert.equal(
    workingDeadline(date("2026-10-23T16:30:00"), 60, periods)?.toISOString(),
    date("2026-10-26T08:30:00").toISOString(),
  );
});
test("giao ngoài ca bắt đầu ở ca tiếp theo", () => {
  assert.equal(
    workingDeadline(date("2026-10-24T18:00:00"), 60, periods)?.toISOString(),
    date("2026-10-26T09:00:00").toISOString(),
  );
});
test("hạn đúng giờ đóng ca được thực hiện ở đầu ca tiếp theo", () => {
  assert.equal(
    workingDeadline(date("2026-10-26T11:00:00"), 60, periods)?.toISOString(),
    date("2026-10-26T13:00:00").toISOString(),
  );
  assert.equal(isWorkingInstant(date("2026-10-26T12:00:00"), calendar), false);
  assert.equal(isWorkingInstant(date("2026-10-26T08:00:00"), calendar), true);
  assert.equal(
    nextWorkingInstant(date("2026-10-23T19:00:00"), calendar).toISOString(),
    date("2026-10-26T08:00:00").toISOString(),
  );
});
test("sửa lịch giữ thời gian đã tích lũy và áp dụng lịch mới từ lúc sửa", () => {
  const changed = defaultWorkCalendar();
  changed.days[1].shifts = [{ start: "14:00", end: "17:00" }];
  const history = [
    { ...periods[0], effectiveTo: date("2026-10-26T08:30:00") },
    {
      calendar: changed,
      effectiveFrom: date("2026-10-26T08:30:00"),
      effectiveTo: null,
    },
  ];
  assert.equal(
    workingDeadline(date("2026-10-26T08:00:00"), 60, history)?.toISOString(),
    date("2026-10-26T14:30:00").toISOString(),
  );
});
test("khoảng chưa có lịch không cộng thời gian; ngừng áp dụng không có hạn tương lai", () => {
  assert.equal(
    workingDeadline(date("2026-10-26T08:00:00"), 60, [
      { ...periods[0], effectiveTo: date("2026-10-26T08:30:00") },
    ]),
    null,
  );
  assert.equal(workingDeadline(date("2026-10-26T08:00:00"), 60, []), null);
});
test("tính chính xác giây và nhiều thay đổi liên tiếp", () => {
  assert.equal(
    workingDeadline(date("2026-10-26T11:59:30"), 1, periods)?.toISOString(),
    date("2026-10-26T13:00:30").toISOString(),
  );
  const split = [
    { ...periods[0], effectiveTo: date("2026-10-26T08:15:00") },
    {
      calendar,
      effectiveFrom: date("2026-10-26T08:45:00"),
      effectiveTo: date("2026-10-26T09:00:00"),
    },
    { calendar, effectiveFrom: date("2026-10-26T10:00:00"), effectiveTo: null },
  ];
  assert.equal(
    workingDeadline(date("2026-10-26T08:00:00"), 60, split)?.toISOString(),
    date("2026-10-26T10:30:00").toISOString(),
  );
});
test("validation từ chối ca chồng nhau, ngược giờ, cả tuần nghỉ và ngày trùng", () => {
  for (const shifts of [
    [{ start: "12:00", end: "08:00" }],
    [
      { start: "08:00", end: "12:00" },
      { start: "11:00", end: "14:00" },
    ],
  ]) {
    assert.equal(
      workCalendarSchema.safeParse({
        ...calendar,
        days: calendar.days.map((day) =>
          day.weekday === 1 ? { ...day, shifts } : day,
        ),
      }).success,
      false,
    );
  }
  assert.equal(
    workCalendarSchema.safeParse({
      ...calendar,
      days: calendar.days.map((day) => ({ ...day, shifts: [] })),
    }).success,
    false,
  );
  assert.equal(
    workCalendarSchema.safeParse({
      ...calendar,
      days: Array(7).fill(calendar.days[1]),
    }).success,
    false,
  );
  assert.equal(
    saleWorkScheduleSchema.safeParse({
      name: "Lịch",
      calendar,
      note: "",
      isActive: true,
      saleIds: ["a", "a"],
    }).success,
    false,
  );
});
test("nhảy theo tuần xử lý lịch ca ngắn và thời hạn dài", () => {
  const sparse = defaultWorkCalendar();
  sparse.days = sparse.days.map((day) => ({
    ...day,
    shifts: day.weekday === 1 ? [{ start: "08:00", end: "08:01" }] : [],
  }));
  const start = date("2026-10-26T08:00:00");
  const due = workingDeadline(start, 43_200, [
    { calendar: sparse, effectiveFrom: start, effectiveTo: null },
  ]);
  assert.ok(due);
  assert.equal(due.getTime() - start.getTime(), 43_200 * 7 * 24 * 60 * 60_000);
});
