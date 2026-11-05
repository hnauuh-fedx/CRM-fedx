import { z } from "zod";
import { assignmentEventTypes, assignmentOptionKinds, assignmentReportPermissions } from "@admission-crm/shared/assignment-report";
import type { AuthUser } from "../auth/auth.types";
import { Prisma } from "../../generated/prisma/client";

const ids = z.preprocess((value) => typeof value === "string" ? value.split(",").filter(Boolean) : value ?? [], z.array(z.uuid()).max(50));
const types = z.preprocess((value) => typeof value === "string" ? value.split(",").filter(Boolean) : value ?? [...assignmentEventTypes], z.array(z.enum(assignmentEventTypes)).min(1).max(4));
const baseSchema = z.object({
  fromDate: z.iso.date(), toDate: z.iso.date(),
  departmentIds: ids, assigneeIds: ids, sourceIds: ids, campaignIds: ids, ruleIds: ids,
  method: z.enum(["ALL", "AUTOMATIC", "MANUAL"]).default("ALL"), eventTypes: types,
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z.enum(["name", ...assignmentEventTypes]).default("ASSIGNED"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export const assignmentReportQuerySchema = baseSchema.refine((v) => v.fromDate <= v.toDate, { message: "Ngày kết thúc phải từ ngày bắt đầu trở đi." })
  .refine((v) => v.method !== "MANUAL" || v.ruleIds.length === 0, { message: "Giao thủ công không có quy tắc Automation." });
export const assignmentOptionQuerySchema = z.object({
  kind: z.enum(assignmentOptionKinds), search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  departmentIds: ids,
});

// Scope is evaluated against immutable facts, not the lead's current assignee.
// READ_ONLY and broad role names never elevate an explicit report permission.
export function assignmentReportScope(user: AuthUser, programId: string): Prisma.Sql {
  if (!user.institutionProgramIds.includes(programId) || !assignmentReportPermissions.some((p) => user.permissions.includes(p))) return Prisma.sql`FALSE`;
  const program = Prisma.sql`e.institution_program_id = ${programId}::uuid`;
  if (user.accessScope === "ALL" && user.permissions.includes("report.view_all")) return program;
  if (["ALL", "DEPARTMENT"].includes(user.accessScope) && user.permissions.some((p) => ["report.view_all", "report.sale.view_department"].includes(p))) {
    return user.departmentIds.length ? Prisma.sql`${program} AND e.department_id IN (${Prisma.join(user.departmentIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.sql`FALSE`;
  }
  if (user.accessScope === "OWNED_ONLY") return Prisma.sql`${program} AND e.owner_id = ${user.id}::uuid`;
  return Prisma.sql`${program} AND e.assignee_id = ${user.id}::uuid`;
}

export function assignmentDateBounds(fromDate: string, toDate: string) {
  return { from: new Date(`${fromDate}T00:00:00+07:00`), until: new Date(new Date(`${toDate}T00:00:00+07:00`).getTime() + 86_400_000) };
}

export function assignmentReportWhere(user: AuthUser, programId: string, query: z.infer<typeof assignmentReportQuerySchema>) {
  const bounds = assignmentDateBounds(query.fromDate, query.toDate);
  // Explicit offsets avoid timestamp-without-time-zone parameters inheriting the DB session zone.
  const clauses = [assignmentReportScope(user, programId), Prisma.sql`e.occurred_at >= ${bounds.from.toISOString()}::timestamptz AND e.occurred_at < ${bounds.until.toISOString()}::timestamptz`,
    Prisma.sql`e.event_type IN (${Prisma.join(query.eventTypes)})`];
  const columns = { departmentIds: "e.department_id", assigneeIds: "e.assignee_id", sourceIds: "e.source_id", ruleIds: "e.rule_id" } as const;
  for (const [key, column] of Object.entries(columns) as [keyof typeof columns, string][]) {
    if (query[key].length) clauses.push(Prisma.sql`${Prisma.raw(column)} IN (${Prisma.join(query[key].map((id) => Prisma.sql`${id}::uuid`))})`);
  }
  if (query.campaignIds.length) clauses.push(Prisma.sql`e.campaign_ids && ARRAY[${Prisma.join(query.campaignIds.map((id) => Prisma.sql`${id}::uuid`))}]`);
  if (query.method !== "ALL") clauses.push(Prisma.sql`e.method = ${query.method}`);
  return Prisma.join(clauses.map((clause) => Prisma.sql`(${clause})`), " AND ");
}
