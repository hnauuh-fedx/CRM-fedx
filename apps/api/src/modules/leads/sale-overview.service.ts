import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";

export type AssignmentListQuery = {
  page: number;
  limit: number;
  search?: string;
  assigneeId?: string;
  departmentId?: string;
  institutionProgramId?: string;
  sortOrder: "asc" | "desc";
};

export type ActivityListQuery = {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  userId?: string;
  institutionProgramId?: string;
  sortOrder: "asc" | "desc";
};

export type ReminderListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  userId?: string;
  institutionProgramId?: string;
  sortOrder: "asc" | "desc";
};

export type ManualActivityInput = {
  leadId: string;
  type: string;
  content: string;
};

export type ReminderInput = {
  leadId: string;
  title: string;
  content?: string;
  remindAt: string;
};

export async function listLeadAssignments(query: AssignmentListQuery) {
  const where = {
    AND: [
      { leads: { is: { deleted_at: null } } },
      ...(query.institutionProgramId ? [{ leads: { is: { institution_program_id: query.institutionProgramId } } }] : []),
      ...(query.search
        ? [
            {
              OR: [
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
                { leads: { is: { lead_code: { contains: query.search, mode: "insensitive" as const } } } },
                {
                  users_lead_assignments_assigned_toTousers: {
                    is: { full_name: { contains: query.search, mode: "insensitive" as const } },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.assigneeId ? [{ assigned_to: query.assigneeId }] : []),
      ...(query.departmentId ? [{ department_id: query.departmentId }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.lead_assignments.findMany({
      where,
      select: {
        id: true,
        assigned_at: true,
        is_main_owner: true,
        leads: { select: { id: true, lead_code: true, full_name: true, status: true } },
        users_lead_assignments_assigned_toTousers: { select: { id: true, full_name: true } },
        users_lead_assignments_assigned_byTousers: { select: { id: true, full_name: true } },
        departments: { select: { id: true, name: true } },
      },
      orderBy: [{ assigned_at: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lead_assignments.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      assignedAt: item.assigned_at?.toISOString() ?? null,
      isMainOwner: item.is_main_owner ?? false,
      lead: item.leads
        ? {
            id: item.leads.id,
            leadCode: item.leads.lead_code,
            fullName: item.leads.full_name,
            status: item.leads.status,
          }
        : null,
      assignee: item.users_lead_assignments_assigned_toTousers
        ? {
            id: item.users_lead_assignments_assigned_toTousers.id,
            fullName: item.users_lead_assignments_assigned_toTousers.full_name,
          }
        : null,
      assignedBy: item.users_lead_assignments_assigned_byTousers
        ? {
            id: item.users_lead_assignments_assigned_byTousers.id,
            fullName: item.users_lead_assignments_assigned_byTousers.full_name,
          }
        : null,
      department: item.departments,
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      assigneeId: query.assigneeId ?? "",
      departmentId: query.departmentId ?? "",
    },
  };
}

export async function getSaleFilterOptions(user: AuthUser, institutionProgramId?: string) {
  const scopeWhere = {
    deleted_at: null,
    ...getLeadScopeWhere(user),
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const [assignees, departments, activityTypes, reminderStatuses, leads] = await prisma.$transaction([
    prisma.users.findMany({
      where: { deleted_at: null, status: "active", leads_leads_assigned_toTousers: { some: scopeWhere } },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
    prisma.departments.findMany({
      where: { lead_assignments: { some: { leads: { is: scopeWhere } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.lead_activities.findMany({ where: { leads: { is: scopeWhere } }, select: { type: true }, distinct: ["type"], take: 100 }),
    prisma.reminders.findMany({ where: { leads: { is: scopeWhere } }, select: { status: true }, distinct: ["status"], take: 100 }),
    prisma.leads.findMany({
      where: scopeWhere,
      select: { id: true, lead_code: true, full_name: true },
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      take: 100,
    }),
  ]);

  return {
    assignees: assignees.map((item) => ({ id: item.id, fullName: item.full_name })),
    departments,
    activityTypes: activityTypes.map((item) => item.type).sort(),
    reminderStatuses: reminderStatuses.flatMap((item) => (item.status ? [item.status] : [])).sort(),
    leads: leads.map((lead) => ({ id: lead.id, leadCode: lead.lead_code, fullName: lead.full_name })),
  };
}

export async function listLeadActivities(user: AuthUser, query: ActivityListQuery) {
  const where = {
    AND: [
      { leads: { is: { deleted_at: null } } },
      { leads: { is: getLeadScopeWhere(user) } },
      ...(query.institutionProgramId ? [{ leads: { is: { institution_program_id: query.institutionProgramId } } }] : []),
      ...(query.search
        ? [
            {
              OR: [
                { type: { contains: query.search, mode: "insensitive" as const } },
                { content: { contains: query.search, mode: "insensitive" as const } },
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
                { leads: { is: { lead_code: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
      ...(query.type ? [{ type: query.type }] : []),
      ...(query.userId ? [{ user_id: query.userId }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.lead_activities.findMany({
      where,
      select: {
        id: true,
        type: true,
        content: true,
        metadata: true,
        created_at: true,
        leads: { select: { id: true, lead_code: true, full_name: true } },
        users: { select: { id: true, full_name: true } },
      },
      orderBy: [{ created_at: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lead_activities.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      type: item.type,
      content: item.content,
      isManual: (item.metadata as { origin?: string } | null)?.origin === "manual",
      createdAt: item.created_at?.toISOString() ?? null,
      lead: item.leads
        ? { id: item.leads.id, leadCode: item.leads.lead_code, fullName: item.leads.full_name }
        : null,
      actor: item.users ? { id: item.users.id, fullName: item.users.full_name } : null,
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      type: query.type ?? "",
      userId: query.userId ?? "",
    },
  };
}

export async function createManualActivity(user: AuthUser, input: ManualActivityInput, institutionProgramId?: string) {
  const lead = await prisma.leads.findFirst({
    where: { id: input.leadId, deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: { id: true },
  });
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }
  return prisma.$transaction(async (tx) => {
    const activity = await tx.lead_activities.create({
      data: {
        lead_id: lead.id,
        user_id: user.id,
        type: input.type,
        content: input.content.trim(),
        metadata: { origin: "manual" },
      },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead_activity",
        entity_id: activity.id,
        action: "create",
        new_data: { leadId: lead.id, type: input.type, content: input.content.trim() },
      },
    });
    return { ok: true as const, data: activity };
  });
}

export async function updateManualActivity(user: AuthUser, activityId: string, input: Omit<ManualActivityInput, "leadId">, institutionProgramId?: string) {
  const activity = await prisma.lead_activities.findFirst({
    where: { id: activityId, leads: { is: { deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) } } },
    select: { id: true, type: true, content: true, metadata: true },
  });
  const metadata = activity?.metadata as { origin?: string } | null;
  if (!activity || metadata?.origin !== "manual") {
    return { ok: false as const, reason: "activity_not_found" as const };
  }
  return prisma.$transaction(async (tx) => {
    await tx.lead_activities.update({
      where: { id: activityId },
      data: { type: input.type, content: input.content.trim() },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "lead_activity",
        entity_id: activityId,
        action: "update",
        old_data: { type: activity.type, content: activity.content },
        new_data: { type: input.type, content: input.content.trim() },
      },
    });
    return { ok: true as const, data: { id: activityId } };
  });
}

export async function listReminders(user: AuthUser, query: ReminderListQuery) {
  const where = {
    AND: [
      { leads: { is: { deleted_at: null } } },
      { leads: { is: getLeadScopeWhere(user) } },
      ...(query.institutionProgramId ? [{ leads: { is: { institution_program_id: query.institutionProgramId } } }] : []),
      ...(query.search
        ? [
            {
              OR: [
                { title: { contains: query.search, mode: "insensitive" as const } },
                { leads: { is: { full_name: { contains: query.search, mode: "insensitive" as const } } } },
                { leads: { is: { lead_code: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.userId ? [{ user_id: query.userId }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.reminders.findMany({
      where,
      select: {
        id: true,
        title: true,
        content: true,
        remind_at: true,
        status: true,
        created_at: true,
        leads: { select: { id: true, lead_code: true, full_name: true } },
        users: { select: { id: true, full_name: true } },
      },
      orderBy: [{ remind_at: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.reminders.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      remindAt: item.remind_at.toISOString(),
      status: item.status,
      createdAt: item.created_at?.toISOString() ?? null,
      lead: item.leads
        ? { id: item.leads.id, leadCode: item.leads.lead_code, fullName: item.leads.full_name }
        : null,
      owner: item.users ? { id: item.users.id, fullName: item.users.full_name } : null,
    })),
    pagination: pagination(query.page, query.limit, total),
    sort: { sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      status: query.status ?? "",
      userId: query.userId ?? "",
    },
  };
}

export async function createReminder(user: AuthUser, input: ReminderInput, institutionProgramId?: string) {
  const lead = await prisma.leads.findFirst({
    where: { id: input.leadId, deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: { id: true, full_name: true },
  });
  if (!lead) {
    return { ok: false as const, reason: "lead_not_found" as const };
  }
  return prisma.$transaction(async (tx) => {
    const reminder = await tx.reminders.create({
      data: {
        lead_id: lead.id,
        user_id: user.id,
        title: input.title.trim(),
        content: input.content?.trim() || null,
        remind_at: new Date(input.remindAt),
        status: "pending",
      },
      select: { id: true },
    });
    await tx.lead_activities.create({
      data: { lead_id: lead.id, user_id: user.id, type: "reminder_created", content: `Tạo nhắc việc: ${input.title.trim()}.` },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "reminder",
        entity_id: reminder.id,
        action: "create",
        new_data: { leadId: lead.id, title: input.title.trim(), remindAt: input.remindAt },
      },
    });
    return { ok: true as const, data: reminder };
  });
}

async function findVisibleReminder(user: AuthUser, reminderId: string, institutionProgramId?: string) {
  return prisma.reminders.findFirst({
    where: { id: reminderId, leads: { is: { deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) } } },
    select: { id: true, lead_id: true, title: true, content: true, remind_at: true, status: true },
  });
}

export async function updateReminder(user: AuthUser, reminderId: string, input: Omit<ReminderInput, "leadId">, institutionProgramId?: string) {
  const reminder = await findVisibleReminder(user, reminderId, institutionProgramId);
  if (!reminder || !reminder.lead_id) {
    return { ok: false as const, reason: "reminder_not_found" as const };
  }
  const nextRemindAt = new Date(input.remindAt);
  const timeChanged = reminder.remind_at.getTime() !== nextRemindAt.getTime();
  return prisma.$transaction(async (tx) => {
    await tx.reminders.update({
      where: { id: reminderId },
      data: {
        title: input.title.trim(),
        content: input.content?.trim() || null,
        remind_at: nextRemindAt,
        ...(timeChanged ? { due_notified_at: null, overdue_notified_at: null } : {}),
      },
    });
    await tx.lead_activities.create({
      data: { lead_id: reminder.lead_id, user_id: user.id, type: "reminder_updated", content: `Cập nhật nhắc việc: ${input.title.trim()}.` },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "reminder",
        entity_id: reminderId,
        action: "update",
        old_data: { title: reminder.title, content: reminder.content, remindAt: reminder.remind_at.toISOString() },
        new_data: { title: input.title.trim(), content: input.content?.trim() || null, remindAt: input.remindAt },
      },
    });
    return { ok: true as const, data: { id: reminderId } };
  });
}

export async function completeReminder(user: AuthUser, reminderId: string, institutionProgramId?: string) {
  const reminder = await findVisibleReminder(user, reminderId, institutionProgramId);
  if (!reminder || !reminder.lead_id) {
    return { ok: false as const, reason: "reminder_not_found" as const };
  }
  if (reminder.status === "done") {
    return { ok: true as const, data: { id: reminderId } };
  }
  return prisma.$transaction(async (tx) => {
    await tx.reminders.update({ where: { id: reminderId }, data: { status: "done" } });
    await tx.lead_activities.create({
      data: { lead_id: reminder.lead_id, user_id: user.id, type: "reminder_completed", content: `Hoàn tất nhắc việc: ${reminder.title}.` },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "reminder",
        entity_id: reminderId,
        action: "complete",
        old_data: { status: reminder.status },
        new_data: { status: "done" },
      },
    });
    return { ok: true as const, data: { id: reminderId } };
  });
}

export async function getSaleKpi(institutionProgramId?: string) {
  const activeLeadWhere = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const [totalLeads, unassignedLeads, pendingReminders, overdueReminders, activityCount, assigneeGroups, stageGroups] =
    await prisma.$transaction([
      prisma.leads.count({ where: activeLeadWhere }),
      prisma.leads.count({ where: { ...activeLeadWhere, assigned_to: null } }),
      prisma.reminders.count({ where: { status: "pending", leads: { is: activeLeadWhere } } }),
      prisma.reminders.count({
        where: { status: "pending", remind_at: { lt: new Date() }, leads: { is: activeLeadWhere } },
      }),
      prisma.lead_activities.count({ where: { leads: { is: activeLeadWhere } } }),
      prisma.leads.groupBy({
        by: ["assigned_to"],
        where: { ...activeLeadWhere, assigned_to: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { assigned_to: "desc" } },
        take: 10,
      }),
      prisma.leads.groupBy({
        by: ["pipeline_stage_id"],
        where: activeLeadWhere,
        _count: { _all: true },
        orderBy: { _count: { pipeline_stage_id: "desc" } },
        take: 10,
      }),
    ]);

  const [assignees, stages] = await prisma.$transaction([
    prisma.users.findMany({
      where: { id: { in: assigneeGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : [])) } },
      select: { id: true, full_name: true },
    }),
    prisma.pipeline_stages.findMany({
      where: { id: { in: stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])) } },
      select: { id: true, name: true },
    }),
  ]);
  const assigneeNames = new Map(assignees.map((item) => [item.id, item.full_name]));
  const stageNames = new Map(stages.map((item) => [item.id, item.name]));

  return {
    summary: {
      totalLeads,
      unassignedLeads,
      pendingReminders,
      overdueReminders,
      activityCount,
    },
    staffKpi: assigneeGroups.map((group) => ({
      id: group.assigned_to!,
      name: assigneeNames.get(group.assigned_to!) ?? "Chưa xác định",
      total: group._count._all,
    })),
    pipelineBreakdown: stageGroups.map((group) => ({
      id: group.pipeline_stage_id,
      name: group.pipeline_stage_id
        ? (stageNames.get(group.pipeline_stage_id) ?? "Chưa xác định")
        : "Chưa có giai đoạn",
      total: group._count._all,
    })),
  };
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
