import { prisma } from "../../database/prisma";

export type AuditLogListQuery = {
  page: number;
  limit: number;
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy: "createdAt" | "action" | "entityType";
  sortOrder: "asc" | "desc";
};

const auditSortFields = {
  createdAt: "created_at",
  action: "action",
  entityType: "entity_type",
} as const;

export async function listAuditLogs(query: AuditLogListQuery) {
  const where = getAuditLogWhere(query);
  const orderBy = { [auditSortFields[query.sortBy]]: query.sortOrder };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.audit_logs.findMany({
      where,
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        created_at: true,
        users: { select: { id: true, full_name: true } },
      },
      orderBy: [orderBy, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.audit_logs.count({ where }),
  ]);

  return {
    data: items.map((log) => ({
      id: log.id,
      entityType: log.entity_type,
      entityId: log.entity_id,
      action: log.action,
      createdAt: log.created_at?.toISOString() ?? null,
      actor: log.users
        ? { id: log.users.id, fullName: log.users.full_name }
        : null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      action: query.action ?? "",
      entityType: query.entityType ?? "",
      userId: query.userId ?? "",
      fromDate: query.fromDate?.toISOString() ?? "",
      toDate: query.toDate?.toISOString() ?? "",
    },
  };
}

export async function getAuditLogDetail(id: string) {
  const log = await prisma.audit_logs.findUnique({
    where: { id },
    select: {
      id: true,
      entity_type: true,
      entity_id: true,
      action: true,
      old_data: true,
      new_data: true,
      ip_address: true,
      created_at: true,
      users: { select: { id: true, full_name: true } },
    },
  });

  if (!log) return null;

  return {
    id: log.id,
    entityType: log.entity_type,
    entityId: log.entity_id,
    action: log.action,
    createdAt: log.created_at?.toISOString() ?? null,
    actor: log.users ? { id: log.users.id, fullName: log.users.full_name } : null,
    ipAddress: log.ip_address,
    oldData: redactAuditPayload(log.old_data),
    newData: redactAuditPayload(log.new_data),
  };
}

function getAuditLogWhere(query: AuditLogListQuery) {
  const searchAsUuid = query.search && isUuid(query.search) ? query.search : null;

  return {
    AND: [
      ...(query.search
        ? [
            {
              OR: [
                { action: { contains: query.search, mode: "insensitive" as const } },
                { entity_type: { contains: query.search, mode: "insensitive" as const } },
                ...(searchAsUuid ? [{ entity_id: searchAsUuid }] : []),
                {
                  users: {
                    is: { full_name: { contains: query.search, mode: "insensitive" as const } },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.action ? [{ action: query.action }] : []),
      ...(query.entityType ? [{ entity_type: query.entityType }] : []),
      ...(query.userId ? [{ user_id: query.userId }] : []),
      ...(query.fromDate || query.toDate
        ? [
            {
              created_at: {
                ...(query.fromDate ? { gte: query.fromDate } : {}),
                ...(query.toDate ? { lte: query.toDate } : {}),
              },
            },
          ]
        : []),
    ],
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getAuditLogFilterOptions() {
  const [actions, entityTypes, users] = await prisma.$transaction([
    prisma.audit_logs.findMany({ select: { action: true }, distinct: ["action"], take: 100 }),
    prisma.audit_logs.findMany({
      select: { entity_type: true },
      distinct: ["entity_type"],
      take: 100,
    }),
    prisma.users.findMany({
      where: { audit_logs: { some: {} } },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
      take: 200,
    }),
  ]);

  return {
    actions: actions.map((log) => log.action).sort(),
    entityTypes: entityTypes.map((log) => log.entity_type).sort(),
    users: users.map((user) => ({ id: user.id, fullName: user.full_name })),
  };
}

const sensitiveKeys = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cccd",
  "phone",
  "email",
]);

function redactAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactAuditPayload(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sensitiveKeys.has(key) ? "[REDACTED]" : redactAuditPayload(nestedValue),
    ]),
  );
}
