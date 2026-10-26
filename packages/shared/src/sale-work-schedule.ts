import { z } from "zod";

export const WORK_WEEKDAYS = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
] as const;
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ (HH:mm).");
export const workDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    shifts: z
      .array(z.object({ start: timeSchema, end: timeSchema }))
      .max(2, "Tối đa hai ca mỗi ngày."),
  })
  .superRefine((day, ctx) => {
    const shifts = [...day.shifts].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    for (const [index, shift] of shifts.entries()) {
      if (shift.start >= shift.end)
        ctx.addIssue({
          code: "custom",
          message: "Giờ bắt đầu phải trước giờ kết thúc.",
          path: ["shifts"],
        });
      if (index > 0 && shifts[index - 1].end > shift.start)
        ctx.addIssue({
          code: "custom",
          message: "Các ca không được chồng nhau.",
          path: ["shifts"],
        });
    }
  });
export const workCalendarSchema = z
  .object({
    timezone: z.literal("Asia/Ho_Chi_Minh"),
    days: z
      .array(workDaySchema)
      .length(7, "Cần cấu hình đủ bảy ngày.")
      .transform((days) => [...days].sort((a, b) => a.weekday - b.weekday)),
  })
  .superRefine((calendar, ctx) => {
    if (new Set(calendar.days.map((day) => day.weekday)).size !== 7)
      ctx.addIssue({
        code: "custom",
        message: "Các ngày không được trùng nhau.",
        path: ["days"],
      });
    if (!calendar.days.some((day) => day.shifts.length > 0))
      ctx.addIssue({
        code: "custom",
        message: "Cần ít nhất một ca làm việc.",
        path: ["days"],
      });
  });
export const saleWorkScheduleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên lịch cần ít nhất hai ký tự.")
    .max(255, "Tên lịch tối đa 255 ký tự."),
  note: z.string().trim().max(2000, "Ghi chú tối đa 2.000 ký tự.").default(""),
  isActive: z.boolean(),
  calendar: workCalendarSchema,
  saleIds: z
    .array(z.string().uuid("Mã Sale không hợp lệ."))
    .max(1000, "Chọn tối đa 1.000 Sale cho một lịch.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Sale không được trùng nhau.",
    ),
  version: z.number().int().positive().optional(),
  replaceExisting: z.boolean().default(false),
});
export type WorkCalendar = z.infer<typeof workCalendarSchema>;
export type SaleWorkScheduleInput = z.infer<typeof saleWorkScheduleSchema>;
export type SaleWorkSchedule = Omit<
  SaleWorkScheduleInput,
  "replaceExisting"
> & {
  id: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  updatedByName?: string;
  sales: { id: string; fullName: string }[];
};
export function defaultWorkCalendar(): WorkCalendar {
  return {
    timezone: "Asia/Ho_Chi_Minh",
    days: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      shifts:
        weekday === 0 || weekday === 6
          ? []
          : [
              { start: "08:00", end: "12:00" },
              { start: "13:00", end: "17:00" },
            ],
    })),
  };
}
