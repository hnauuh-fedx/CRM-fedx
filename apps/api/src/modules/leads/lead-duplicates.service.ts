import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type DuplicateField = "fullName" | "phone" | "email";

const emptyScope = Prisma.sql`FALSE`;

// Keep this in step with getLeadScopeWhere: the grouping must never include a lead
// that the requesting user could not open in the ordinary lead list.
function scopeSql(user: AuthUser) {
  const permissions = new Set(user.permissions);
  if (user.accessScope === "ALL" && permissions.has("lead.view_all")) return Prisma.sql`TRUE`;
  if (user.accessScope === "OWNED_ONLY") return Prisma.sql`l.owner_id = ${user.id}::uuid`;
  if (user.accessScope === "DEPARTMENT" || permissions.has("lead.view_department")) {
    if (user.departmentIds.length === 0) return emptyScope;
    return Prisma.sql`EXISTS (
      SELECT 1 FROM lead_assignments la
      WHERE la.lead_id = l.id AND la.is_main_owner = TRUE
        AND la.department_id IN (${Prisma.join(user.departmentIds.map((id) => Prisma.sql`${id}::uuid`))})
    )`;
  }
  if (!permissions.has("lead.view_assigned") && permissions.has("lead.view_all")) return Prisma.sql`TRUE`;
  return Prisma.sql`(l.assigned_to = ${user.id}::uuid OR EXISTS (
    SELECT 1 FROM lead_assignments la
    WHERE la.lead_id = l.id AND la.is_main_owner = TRUE AND la.assigned_to = ${user.id}::uuid
  ))`;
}

export function canCheckSensitiveDuplicates(user: AuthUser) {
  return user.permissions.some((permission) => [
    "lead.sensitive.view", "lead.update_all", "lead.update_department", "lead.update_assigned",
  ].includes(permission));
}

function keySql(field: DuplicateField) {
  switch (field) {
    case "fullName": return Prisma.sql`lower(regexp_replace(btrim(l.full_name), '[[:space:]]+', ' ', 'g'))`;
    case "phone": return Prisma.sql`regexp_replace(l.phone, '[^0-9]', '', 'g')`;
    case "email": return Prisma.sql`lower(btrim(l.email))`;
  }
}

type GroupRow = { key: string; count: bigint; total_groups: bigint };
type PreviewRow = {
  key: string;
  id: string;
  lead_code: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  created_at: Date | null;
};

export async function listDuplicateLeads(
  user: AuthUser,
  query: { field: DuplicateField; page: number; limit: number; institutionProgramId?: string },
) {
  const key = keySql(query.field);
  const scope = scopeSql(user);
  const program = query.institutionProgramId
    ? Prisma.sql`AND l.institution_program_id = ${query.institutionProgramId}::uuid`
    : Prisma.empty;
  const offset = (query.page - 1) * query.limit;
  const groups = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    WITH matching AS (
      SELECT ${key} AS key, count(*) AS count
      FROM leads l
      WHERE l.deleted_at IS NULL AND ${scope} ${program}
      GROUP BY 1 HAVING count(*) > 1 AND ${key} IS NOT NULL AND ${key} <> ''
    )
    SELECT key, count, count(*) OVER () AS total_groups
    FROM matching ORDER BY count DESC, key ASC
    LIMIT ${query.limit} OFFSET ${offset}
  `);

  const previews = groups.length === 0 ? [] : await prisma.$queryRaw<PreviewRow[]>(Prisma.sql`
    WITH ranked AS (
      SELECT ${key} AS key, l.id, l.lead_code, l.full_name, l.phone, l.email, l.created_at,
        row_number() OVER (PARTITION BY ${key} ORDER BY l.created_at DESC NULLS LAST, l.id) AS position
      FROM leads l
      WHERE l.deleted_at IS NULL AND ${scope} ${program}
        AND ${key} IN (${Prisma.join(groups.map((group) => group.key))})
    )
    SELECT key, id, lead_code, full_name, phone, email, created_at
    FROM ranked WHERE position <= 5 ORDER BY key, position
  `);
  const sensitive = canCheckSensitiveDuplicates(user);
  const previewsByKey = new Map<string, Array<{
    id: string; leadCode: string | null; fullName: string; phone: string | null;
    email: string | null; createdAt: string | null;
  }>>();
  for (const lead of previews) {
    const items = previewsByKey.get(lead.key) ?? [];
    items.push({
      id: lead.id,
      leadCode: lead.lead_code,
      fullName: lead.full_name,
      phone: sensitive ? lead.phone : null,
      email: sensitive ? lead.email : null,
      createdAt: lead.created_at?.toISOString() ?? null,
    });
    previewsByKey.set(lead.key, items);
  }
  const total = Number(groups[0]?.total_groups ?? 0);
  return {
    data: groups.map((group) => ({
      key: group.key,
      count: Number(group.count),
      leads: previewsByKey.get(group.key) ?? [],
    })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function listDuplicateGroupMembers(
  user: AuthUser,
  query: { field: DuplicateField; key: string; page: number; limit: number; institutionProgramId?: string },
) {
  const key = keySql(query.field);
  const scope = scopeSql(user);
  const program = query.institutionProgramId
    ? Prisma.sql`AND l.institution_program_id = ${query.institutionProgramId}::uuid`
    : Prisma.empty;
  const offset = (query.page - 1) * query.limit;
  const where = Prisma.sql`l.deleted_at IS NULL AND ${scope} ${program} AND ${key} = ${query.key}`;
  const [items, countRows] = await Promise.all([
    prisma.$queryRaw<PreviewRow[]>(Prisma.sql`
      SELECT ${key} AS key, l.id, l.lead_code, l.full_name, l.phone, l.email, l.created_at
      FROM leads l WHERE ${where}
      ORDER BY l.created_at DESC NULLS LAST, l.id
      LIMIT ${query.limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) AS count FROM leads l WHERE ${where}`),
  ]);
  const sensitive = canCheckSensitiveDuplicates(user);
  const total = Number(countRows[0]?.count ?? 0);
  return {
    data: items.map((lead) => ({
      id: lead.id,
      leadCode: lead.lead_code,
      fullName: lead.full_name,
      phone: sensitive ? lead.phone : null,
      email: sensitive ? lead.email : null,
      createdAt: lead.created_at?.toISOString() ?? null,
    })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}
