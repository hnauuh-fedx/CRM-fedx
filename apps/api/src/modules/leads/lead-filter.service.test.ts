import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import {
  buildLeadFilterWhere,
  CUSTOM_FIELD_MATCH_LIMIT,
  filterConditionsParamSchema,
  LeadFilterError,
  resolveDateRange,
  type FilterCondition,
} from "./lead-filter.service";
import { listLeads } from "./lead-list.service";

const textFieldId = "10000000-0000-4000-8000-000000000001";
const sensitiveFieldId = "10000000-0000-4000-8000-000000000002";
const stageId = "10000000-0000-4000-8000-000000000003";

const user: AuthUser = {
  id: "sale-1", email: "sale@example.test", fullName: "Sale", avatarUrl: null,
  roles: [], permissions: ["lead.view_assigned"], departmentIds: [],
  institutionProgramIds: ["program-1"], accessScope: "ASSIGNED_ONLY",
};

function mockDelegate<Args extends unknown[], Result>(context: TestContext, target: unknown, method: string, implementation: (...args: Args) => Result) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[method];
  const replacement = context.mock.fn(implementation);
  delegate[method] = replacement;
  context.after(() => { delegate[method] = original; });
  return replacement;
}

function mockCustomFields(context: TestContext) {
  return mockDelegate(context, prisma.custom_fields, "findMany", async (args: { where: { id: { in: string[] } } }) => [
    { id: textFieldId, field_key: "school", field_type: "TEXT", is_sensitive: false },
    { id: sensitiveFieldId, field_key: "income", field_type: "NUMBER", is_sensitive: true },
  ].filter((field) => args.where.id.in.includes(field.id)));
}

async function rejectsWith(promise: Promise<unknown>, status: 400 | 403) {
  await assert.rejects(promise, (error: unknown) => error instanceof LeadFilterError && error.status === status);
}

test("filters query param is parsed from JSON and limited to 5 known conditions", () => {
  assert.deepEqual(filterConditionsParamSchema.parse(undefined), []);
  assert.deepEqual(filterConditionsParamSchema.parse(""), []);
  const parsed = filterConditionsParamSchema.parse(JSON.stringify([
    { field: "fullName", operator: "CONTAINS", value: "An" },
    { combinator: "OR", field: `cf:${textFieldId}`, operator: "HAS_VALUE" },
  ]));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].combinator, "OR");
  const six = Array.from({ length: 6 }, () => ({ field: "fullName", operator: "HAS_VALUE" }));
  assert.equal(filterConditionsParamSchema.safeParse(JSON.stringify(six)).success, false);
  assert.equal(filterConditionsParamSchema.safeParse(JSON.stringify([{ field: "password_hash", operator: "HAS_VALUE" }])).success, false);
  assert.equal(filterConditionsParamSchema.safeParse("{not json").success, false);
});

test("conditions combine left-to-right: (A AND B) OR C", async () => {
  const where = await buildLeadFilterWhere(user, [
    { field: "fullName", operator: "CONTAINS", value: "An" },
    { combinator: "AND", field: "pipelineStageId", operator: "EQUALS", value: stageId },
    { combinator: "OR", field: "status", operator: "EQUALS", value: "FAIL" },
  ], false);
  assert.deepEqual(where, {
    OR: [
      { AND: [{ full_name: { contains: "An", mode: "insensitive" } }, { pipeline_stage_id: stageId }] },
      { status: { startsWith: "FAIL:" } },
    ],
  });
  assert.equal(await buildLeadFilterWhere(user, [], false), null);
});

test("negative text and enum conditions keep leads without a value", async () => {
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "leadCode", operator: "NOT_CONTAINS", value: "X" }], false), {
    OR: [{ lead_code: null }, { NOT: { lead_code: { contains: "X", mode: "insensitive" } } }],
  });
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "sourceId", operator: "NOT_EQUALS", value: stageId }], false), {
    OR: [{ source_id: null }, { NOT: { source_id: stageId } }],
  });
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "temperature", operator: "HAS_NO_VALUE" }], false), {
    OR: [{ temperature: null }, { temperature: "" }],
  });
});

test("required columns (full_name, phone) never compare with null", async () => {
  // Prisma từ chối `null` trên cột NOT NULL → trước đây các điều kiện này làm API lỗi.
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "phone", operator: "HAS_VALUE", value: "088" }], true), { NOT: { phone: "" } });
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "phone", operator: "HAS_NO_VALUE" }], true), { phone: "" });
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "fullName", operator: "NOT_CONTAINS", value: "An" }], false), {
    NOT: { full_name: { contains: "An", mode: "insensitive" } },
  });
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "email", operator: "HAS_VALUE" }], true), {
    AND: [{ email: { not: null } }, { NOT: { email: "" } }],
  });
});

test("date conditions support =, !=, <=, >=, range and presets", async () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00`);
  const notEqual = await buildLeadFilterWhere(user, [{ field: "createdAt", operator: "NOT_EQUALS", value: "2026-10-15" }], false);
  assert.deepEqual(notEqual, {
    OR: [{ created_at: { lt: day("2026-10-15") } }, { created_at: { gt: new Date(2026, 9, 15, 23, 59, 59, 999) } }],
  });
  const range = (condition: Omit<FilterCondition, "field">) => resolveDateRange({ field: "createdAt", ...condition }, new Date(2026, 9, 16, 9));
  assert.deepEqual(range({ operator: "GTE", value: "2026-10-01" }), { gte: day("2026-10-01") });
  assert.deepEqual(range({ operator: "LTE", value: "2026-10-01" }), { lte: new Date(2026, 9, 1, 23, 59, 59, 999) });
  assert.deepEqual(range({ operator: "BETWEEN", value: "2026-10-20", valueTo: "2026-10-01" }), {
    gte: day("2026-10-01"), lte: new Date(2026, 9, 20, 23, 59, 59, 999),
  });
  assert.deepEqual(range({ operator: "IS_THIS_MONTH" }), { gte: day("2026-10-01"), lte: new Date(2026, 9, 31, 23, 59, 59, 999) });
  assert.deepEqual(range({ operator: "IS_QUARTER_2" }), { gte: day("2026-04-01"), lte: new Date(2026, 5, 30, 23, 59, 59, 999) });
  // 16/10/2026 là thứ Sáu → tuần trước bắt đầu thứ Hai 05/10.
  assert.deepEqual(range({ operator: "IS_LAST_WEEK" }), { gte: day("2026-10-05"), lte: new Date(2026, 9, 11, 23, 59, 59, 999) });
  assert.deepEqual(range({ operator: "IS_X_DAYS_AGO", numberValue: 3 }), { gte: day("2026-10-13"), lte: new Date(2026, 9, 13, 23, 59, 59, 999) });
});

test("incomplete conditions are rejected instead of being silently ignored", async () => {
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "fullName", operator: "CONTAINS", value: "  " }], false), 400);
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "createdAt", operator: "BETWEEN", value: "2026-10-01" }], false), 400);
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "status", operator: "EQUALS", value: "DELETED" }], false), 400);
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "createdAt", operator: "IS_X_DAYS_AGO" }], false), 400);
});

test("phone and email filters require permission to view sensitive lead data", async () => {
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "phone", operator: "CONTAINS", value: "09" }], false), 403);
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: "phone", operator: "CONTAINS", value: "09" }], true), {
    phone: { contains: "09", mode: "insensitive" },
  });
});

test("count filters match leads by number of phones or assignees", async (context) => {
  const count = (field: string, numberValue?: number) => buildLeadFilterWhere(user, [{ field, operator: "COUNT_EQUALS", numberValue }], true);
  assert.deepEqual(await count("assigneeId", 0), { assigned_to: null, secondary_assigned_to: null });
  assert.deepEqual(await count("assigneeId", 2), { assigned_to: { not: null }, secondary_assigned_to: { not: null } });
  assert.deepEqual(await count("assigneeId", 3), { id: { in: [] } });
  assert.deepEqual(await count("phone", 1), { secondary_phones: { isEmpty: true }, NOT: { phone: "" } });
  const raw = mockDelegate(context, prisma, "$queryRaw", async () => [{ id: "lead-1" }]);
  assert.deepEqual(await count("phone", 2), { id: { in: ["lead-1"] } });
  assert.deepEqual(raw.mock.calls[0].arguments.slice(1), [1, CUSTOM_FIELD_MATCH_LIMIT + 1]);
  await rejectsWith(count("phone"), 400);
  await rejectsWith(count("fullName", 1), 400);
  await rejectsWith(buildLeadFilterWhere(user, [{ field: "phone", operator: "COUNT_EQUALS", numberValue: 2 }], false), 403);
});

test("custom field conditions resolve matching lead ids from custom_field_values", async (context) => {
  mockCustomFields(context);
  const values = mockDelegate(context, prisma.custom_field_values, "findMany", async (_args: { where: Record<string, unknown>; take: number }) => [
    { entity_id: "lead-1" }, { entity_id: "lead-2" },
  ]);
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: `cf:${textFieldId}`, operator: "CONTAINS", value: "THPT" }], false), {
    id: { in: ["lead-1", "lead-2"] },
  });
  assert.deepEqual(values.mock.calls[0].arguments[0].where, {
    custom_field_id: textFieldId, entity_type: "LEAD", value_text: { contains: "THPT", mode: "insensitive" },
  });
  assert.equal(values.mock.calls[0].arguments[0].take, CUSTOM_FIELD_MATCH_LIMIT + 1);

  // Không có giá trị = không có dòng giá trị → loại trừ các lead đang có giá trị.
  assert.deepEqual(await buildLeadFilterWhere(user, [{ field: `cf:${textFieldId}`, operator: "HAS_NO_VALUE" }], false), {
    id: { notIn: ["lead-1", "lead-2"] },
  });
  assert.deepEqual(values.mock.calls[1].arguments[0].where, { custom_field_id: textFieldId, entity_type: "LEAD" });
});

test("custom field filters reject sensitive, archived and too broad fields", async (context) => {
  mockCustomFields(context);
  await rejectsWith(buildLeadFilterWhere(user, [{ field: `cf:${sensitiveFieldId}`, operator: "GT", value: 10 }], true), 403);
  const manager = { ...user, permissions: [...user.permissions, "custom_field.lead.manage"] };
  mockDelegate(context, prisma.custom_field_values, "findMany", async () => Array.from({ length: CUSTOM_FIELD_MATCH_LIMIT + 1 }, (_, index) => ({ entity_id: `lead-${index}` })));
  await rejectsWith(buildLeadFilterWhere(manager, [{ field: `cf:${sensitiveFieldId}`, operator: "GT", value: 10 }], true), 400);
  await rejectsWith(buildLeadFilterWhere(manager, [{ field: "cf:10000000-0000-4000-8000-000000000099", operator: "HAS_VALUE" }], true), 400);
});

test("listLeads keeps scope and pagination while applying the filter conditions", async (context) => {
  const find = mockDelegate(context, prisma.leads, "findMany", async (_args: { where: { AND: unknown[] }; skip: number }) => []);
  mockDelegate(context, prisma.leads, "count", async () => 0);
  mockDelegate(context, prisma, "$transaction", async (queries: Promise<unknown>[]) => Promise.all(queries));
  await listLeads(user, {
    page: 2, limit: 20, sortBy: "createdAt", sortOrder: "desc", institutionProgramId: "program-1",
    filterConditions: [{ field: "fullName", operator: "EQUALS", value: "An" }],
  });
  const args = find.mock.calls[0].arguments[0];
  assert.equal(args.skip, 20);
  assert.ok(args.where.AND.some((condition) => JSON.stringify(condition) === JSON.stringify({ full_name: { equals: "An", mode: "insensitive" } })));
  assert.ok(args.where.AND.some((condition) => JSON.stringify(condition) === JSON.stringify({ institution_program_id: "program-1" })));
});
