import { workCalendarSchema } from "@admission-crm/shared/sale-work-schedule";
import type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";
import { prisma } from "../../database/prisma";
import {
  Prisma,
  type automation_reassignment_monitors,
} from "../../generated/prisma/client";
import {
  isWorkingInstant,
  nextWorkingInstant,
  workingDeadline,
  type CalendarPeriod,
} from "./work-calendar";
import { lockWorkScheduleProgram } from "./work-schedule-lock";

export async function getWorkPeriods(
  tx: Prisma.TransactionClient,
  saleId: string,
  programId: string,
  start: Date,
): Promise<CalendarPeriod[]> {
  const rows = await tx.sale_work_calendar_periods.findMany({
    where: {
      user_id: saleId,
      institution_program_id: programId,
      OR: [{ effective_to: null }, { effective_to: { gt: start } }],
    },
    orderBy: { effective_from: "asc" },
    select: { calendar: true, effective_from: true, effective_to: true },
  });
  return rows.map((row) => ({
    calendar: workCalendarSchema.parse(row.calendar),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }));
}
export function buildWorkingSchedule(
  start: Date,
  policy: AutomationReassignmentPolicy,
  periods: CalendarPeriod[],
) {
  return {
    reassignmentDueAt: workingDeadline(start, policy.timeoutMinutes, periods),
    warningDueAt: policy.warningEnabled
      ? workingDeadline(
          start,
          Math.max(0, policy.timeoutMinutes - policy.warningBeforeMinutes),
          periods,
        )
      : null,
    secondWarningDueAt: policy.secondWarningEnabled
      ? workingDeadline(
          start,
          Math.max(
            0,
            policy.timeoutMinutes - (policy.secondWarningBeforeMinutes ?? 1),
          ),
          periods,
        )
      : null,
  };
}
// Caller holds the program lock before locking/updating a monitor.
export async function refreshWorkingMonitor(
  tx: Prisma.TransactionClient,
  monitor: automation_reassignment_monitors,
  now: Date,
) {
  const policy =
    monitor.policy_snapshot as unknown as AutomationReassignmentPolicy;
  if (policy.workingTimeOnly !== true) return { monitor, working: true };
  if (!monitor.institution_program_id) return { monitor, working: false };
  const assignment = await tx.lead_assignments.findUnique({
    where: { id: monitor.assignment_id },
    select: { assigned_at: true },
  });
  const start = assignment?.assigned_at ?? monitor.created_at;
  const periods = await getWorkPeriods(
    tx,
    monitor.assignee_id,
    monitor.institution_program_id,
    start,
  );
  const current = periods.find(
    (period) => period.effectiveTo === null && period.effectiveFrom <= now,
  );
  const schedule = buildWorkingSchedule(start, policy, periods);
  const working = Boolean(current && isWorkingInstant(now, current.calendar));
  const next = current
    ? nextWorkingInstant(now, current.calendar)
    : new Date(now.getTime() + 60_000);
  const due = schedule.reassignmentDueAt;
  const data = {
    calendar_refresh_required: false,
    reassignment_due_at:
      !due || !current ? next : due <= now && !working ? next : due,
    warning_due_at: !current
      ? null
      : schedule.warningDueAt && schedule.warningDueAt <= now && !working
        ? next
        : schedule.warningDueAt,
    second_warning_due_at: !current
      ? null
      : schedule.secondWarningDueAt &&
          schedule.secondWarningDueAt <= now &&
          !working
        ? next
        : schedule.secondWarningDueAt,
    last_error: !current
      ? "Sale chưa có lịch làm việc đang áp dụng; automation đang chờ cấu hình."
      : null,
  };
  const updated = await tx.automation_reassignment_monitors.update({
    where: { id: monitor.id },
    data,
  });
  return { monitor: updated, working: working && due !== null };
}
export async function refreshChangedWorkCalendars(
  limit = 500,
  now = new Date(),
) {
  const rows = await prisma.automation_reassignment_monitors.findMany({
    where: {
      calendar_refresh_required: true,
      status: { in: ["pending", "warned"] },
    },
    select: { id: true, institution_program_id: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  for (const row of rows)
    await prisma.$transaction(async (tx) => {
      if (row.institution_program_id)
        await lockWorkScheduleProgram(tx, row.institution_program_id);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`reassignment-monitor:${row.id}`}))`,
      );
      const monitor = await tx.automation_reassignment_monitors.findUnique({
        where: { id: row.id },
      });
      if (
        monitor &&
        ["pending", "warned"].includes(monitor.status) &&
        monitor.calendar_refresh_required
      )
        await refreshWorkingMonitor(tx, monitor, now);
    });
  return rows.length;
}
