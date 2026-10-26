import {
  workCalendarSchema,
  type SaleWorkScheduleInput,
} from "@admission-crm/shared/sale-work-schedule";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { lockWorkScheduleProgram } from "./work-schedule-lock";
import { InstitutionProgramScopeError } from "../institutions/institution-program-scope";

export class WorkScheduleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function assertScheduleProgram(user: AuthUser, programId: string) {
  if (
    !user.institutionProgramIds.includes(programId) ||
    (user.workingInstitutionProgramId !== undefined &&
      user.workingInstitutionProgramId !== programId)
  )
    throw new InstitutionProgramScopeError(
      403,
      "Chương trình nằm ngoài phạm vi truy cập.",
    );
}
export function scheduleSaleWhere(
  user: AuthUser,
  programId: string,
): Prisma.usersWhereInput {
  return {
    status: "active",
    deleted_at: null,
    user_program_roles: {
      some: {
        institution_program_id: programId,
        roles: {
          role_permissions: {
            some: { permissions: { code: "lead.view_assigned" } },
          },
        },
      },
      none: {
        institution_program_id: programId,
        roles: {
          role_permissions: {
            some: {
              permissions: {
                code: { in: ["lead.view_all", "lead.view_department"] },
              },
            },
          },
        },
      },
    },
    ...(user.accessScope === "ALL" && user.permissions.includes("lead.view_all")
      ? {}
      : user.accessScope === "DEPARTMENT"
        ? {
            user_departments: {
              some: { department_id: { in: user.departmentIds } },
            },
          }
        : { id: user.id }),
  };
}
function scheduleWhere(
  user: AuthUser,
  programId: string,
): Prisma.sale_work_schedulesWhereInput {
  return {
    institution_program_id: programId,
    ...(user.accessScope === "ALL" && user.permissions.includes("lead.view_all")
      ? {}
      : {
          AND: [
            { OR: [{ members: { some: {} } }, { updated_by: user.id }] },
            {
              members: { every: { sale: scheduleSaleWhere(user, programId) } },
            },
          ],
        }),
  };
}
const select = {
  id: true,
  name: true,
  note: true,
  is_active: true,
  calendar: true,
  version: true,
  updated_at: true,
  updated_by: true,
  members: {
    select: { sale: { select: { id: true, full_name: true } } },
    orderBy: { user_id: "asc" as const },
  },
} satisfies Prisma.sale_work_schedulesSelect;
function serialize(
  row: Prisma.sale_work_schedulesGetPayload<{ select: typeof select }>,
) {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    isActive: row.is_active,
    calendar: workCalendarSchema.parse(row.calendar),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
    saleIds: row.members.map((member) => member.sale.id),
    sales: row.members.map((member) => ({
      id: member.sale.id,
      fullName: member.sale.full_name,
    })),
  };
}
export async function listWorkSchedules(
  user: AuthUser,
  programId: string,
  query: { page: number; limit: number; search?: string; isActive?: boolean },
) {
  await assertScheduleProgram(user, programId);
  const where = {
    ...scheduleWhere(user, programId),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
    ...(query.isActive !== undefined ? { is_active: query.isActive } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.sale_work_schedules.findMany({
      where,
      select,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
    }),
    prisma.sale_work_schedules.count({ where }),
  ]);
  const updaters = await prisma.users.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.updated_by))] } },
    select: { id: true, full_name: true },
  });
  const names = new Map(
    updaters.map((updater) => [updater.id, updater.full_name]),
  );
  return {
    data: rows.map((row) => ({
      ...serialize(row),
      updatedByName: names.get(row.updated_by),
    })),
    pagination: {
      page: query.page,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
export async function searchScheduleSales(
  user: AuthUser,
  programId: string,
  search: string,
  page: number,
) {
  await assertScheduleProgram(user, programId);
  const rows = await prisma.users.findMany({
    where: {
      AND: [
        scheduleSaleWhere(user, programId),
        { full_name: { contains: search, mode: "insensitive" } },
      ],
    },
    select: { id: true, full_name: true },
    orderBy: [{ full_name: "asc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
  });
  return {
    data: rows
      .slice(0, 20)
      .map((row) => ({ id: row.id, fullName: row.full_name })),
    hasMore: rows.length > 20,
  };
}
export async function saveWorkSchedule(
  user: AuthUser,
  programId: string,
  id: string | undefined,
  input: SaleWorkScheduleInput,
  ip?: string,
) {
  await assertScheduleProgram(user, programId);
  return prisma.$transaction(
    async (tx) => {
      // Shared with monitor creation and final assignment, so a saved calendar cannot race expiry.
      await lockWorkScheduleProgram(tx, programId);
      const old = id
        ? await tx.sale_work_schedules.findFirst({
            where: { id, ...scheduleWhere(user, programId) },
            select,
          })
        : null;
      if (id && !old)
        throw new WorkScheduleError(
          404,
          "Không tìm thấy lịch trong phạm vi truy cập.",
        );
      if (old && old.version !== input.version)
        throw new WorkScheduleError(
          409,
          "Lịch đã được thay đổi. Vui lòng tải lại trước khi lưu.",
        );
      const count = await tx.users.count({
        where: {
          AND: [
            scheduleSaleWhere(user, programId),
            { id: { in: input.saleIds } },
          ],
        },
      });
      if (count !== input.saleIds.length)
        throw new WorkScheduleError(
          403,
          "Có Sale không còn hợp lệ hoặc nằm ngoài phạm vi quản lý.",
        );
      const conflicts = input.isActive
        ? await tx.sale_work_schedules.findMany({
            where: {
              institution_program_id: programId,
              is_active: true,
              ...(id ? { id: { not: id } } : {}),
              members: { some: { user_id: { in: input.saleIds } } },
            },
            select: { id: true, members: { select: { user_id: true } } },
          })
        : [];
      if (conflicts.length && !input.replaceExisting)
        throw new WorkScheduleError(
          409,
          "Một số Sale đã có lịch đang áp dụng. Chọn thay thế lịch hiện tại để tiếp tục.",
        );
      // Replacing membership cannot be used to edit a schedule outside the actor's scope.
      if (conflicts.length) {
        const visibleCount = await tx.sale_work_schedules.count({
          where: {
            AND: [
              scheduleWhere(user, programId),
              { id: { in: conflicts.map((row) => row.id) } },
            ],
          },
        });
        if (visibleCount !== conflicts.length)
          throw new WorkScheduleError(
            403,
            "Không được thay thế lịch nằm ngoài phạm vi quản lý.",
          );
      }
      const now = new Date();
      const affected = [
        ...new Set([
          ...(old?.members.map((member) => member.sale.id) ?? []),
          ...input.saleIds,
        ]),
      ];
      if (conflicts.length)
        await tx.sale_work_schedule_members.deleteMany({
          where: {
            schedule_id: { in: conflicts.map((row) => row.id) },
            user_id: { in: input.saleIds },
          },
        });
      for (const conflict of conflicts) {
        await tx.sale_work_schedules.update({
          where: { id: conflict.id },
          data: {
            version: { increment: 1 },
            updated_at: now,
            updated_by: user.id,
          },
        });
        await tx.audit_logs.create({
          data: {
            user_id: user.id,
            entity_type: "sale_work_schedule",
            entity_id: conflict.id,
            action: "replace_members",
            old_data: {
              saleIds: conflict.members.map((member) => member.user_id),
            },
            new_data: {
              removedSaleIds: input.saleIds.filter((saleId) =>
                conflict.members.some((member) => member.user_id === saleId),
              ),
            },
            ip_address: ip,
          },
        });
      }
      const data = {
        name: input.name,
        note: input.note,
        is_active: input.isActive,
        calendar: input.calendar as Prisma.InputJsonValue,
        updated_by: user.id,
        updated_at: now,
      };
      const saved = old
        ? await tx.sale_work_schedules.update({
            where: { id: old.id },
            data: {
              ...data,
              version: { increment: 1 },
              members: {
                deleteMany: {},
                create: input.saleIds.map((user_id) => ({ user_id })),
              },
            },
            select,
          })
        : await tx.sale_work_schedules.create({
            data: {
              ...data,
              institution_program_id: programId,
              members: {
                create: input.saleIds.map((user_id) => ({ user_id })),
              },
            },
            select,
          });
      await tx.sale_work_calendar_periods.updateMany({
        where: {
          user_id: { in: affected },
          institution_program_id: programId,
          effective_to: null,
        },
        data: { effective_to: now },
      });
      if (input.isActive && input.saleIds.length)
        await tx.sale_work_calendar_periods.createMany({
          data: input.saleIds.map((user_id) => ({
            user_id,
            institution_program_id: programId,
            schedule_id: saved.id,
            schedule_version: saved.version,
            calendar: input.calendar as Prisma.InputJsonValue,
            effective_from: now,
          })),
        });
      // Inactive schedules must not interrupt a different active schedule for the same Sale.
      const otherActive = await tx.sale_work_schedules.findMany({
        where: {
          institution_program_id: programId,
          is_active: true,
          id: { not: saved.id },
          members: { some: { user_id: { in: affected } } },
        },
        select: {
          id: true,
          version: true,
          calendar: true,
          members: {
            where: { user_id: { in: affected } },
            select: { user_id: true },
          },
        },
      });
      for (const other of otherActive)
        await tx.sale_work_calendar_periods.createMany({
          data: other.members.map((member) => ({
            user_id: member.user_id,
            institution_program_id: programId,
            schedule_id: other.id,
            schedule_version: other.version,
            calendar: other.calendar as Prisma.InputJsonValue,
            effective_from: now,
          })),
        });
      await tx.automation_reassignment_monitors.updateMany({
        where: {
          institution_program_id: programId,
          assignee_id: { in: affected },
          status: { in: ["pending", "warned", "processing"] },
          policy_snapshot: { path: ["workingTimeOnly"], equals: true },
        },
        data: { calendar_refresh_required: true },
      });
      await tx.audit_logs.create({
        data: {
          user_id: user.id,
          entity_type: "sale_work_schedule",
          entity_id: saved.id,
          action: old ? "update" : "create",
          old_data: old
            ? (serialize(old) as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          new_data: serialize(saved) as unknown as Prisma.InputJsonValue,
          ip_address: ip,
        },
      });
      return serialize(saved);
    },
    { timeout: 30_000 },
  );
}
