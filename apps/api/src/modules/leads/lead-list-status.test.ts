import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadFilterOptions, getLeadScopeWhere, listLeads, type LeadListQuery } from "./lead-list.service";

const user: AuthUser = {
  id: "sale-1", email: "sale@example.test", fullName: "Sale", avatarUrl: null,
  roles: [], permissions: ["lead.view_assigned"], departmentIds: [],
  institutionProgramIds: ["program-1"], accessScope: "ASSIGNED_ONLY",
};
const baseQuery: LeadListQuery = {
  page: 2, limit: 20, sortBy: "createdAt", sortOrder: "desc", institutionProgramId: "program-1",
};

function mockDelegate<Args extends unknown[], Result>(context: TestContext, target: unknown, method: string, implementation: (...args: Args) => Result) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[method];
  const replacement = context.mock.fn(implementation);
  delegate[method] = replacement;
  context.after(() => { delegate[method] = original; });
  return replacement;
}

type ListArgs = { where: { AND: Array<Record<string, unknown>> }; skip: number; take: number };

test("lead lifecycle filtering preserves scope, other filters and server pagination", async (context) => {
  const find = mockDelegate(context, prisma.leads, "findMany", async (_args: ListArgs) => []);
  const count = mockDelegate(context, prisma.leads, "count", async (_args: { where: unknown }) => 45);
  mockDelegate(context, prisma, "$transaction", async (queries: Promise<unknown>[]) => Promise.all(queries));

  for (const filters of [
    {},
    { pipelineStageId: "stage-1" },
    { status: "FAIL" as const },
    { status: "ACTIVE" as const },
  ]) {
    const result = await listLeads(user, { ...baseQuery, search: "Candidate", sourceId: "source-1", ...filters });
    const args = find.mock.calls.at(-1)!.arguments[0];
    const conditions = args.where.AND;
    assert.ok(conditions.some((condition: unknown) => JSON.stringify(condition) === JSON.stringify(getLeadScopeWhere(user, "program-1"))));
    assert.ok(conditions.some((condition: { institution_program_id?: string }) => condition.institution_program_id === "program-1"));
    assert.ok(conditions.some((condition: { source_id?: string }) => condition.source_id === "source-1"));
    assert.equal(args.skip, 20);
    assert.equal(args.take, 20);
    assert.deepEqual(count.mock.calls.at(-1)!.arguments[0].where, args.where);
    const status = conditions.find((condition: { status?: unknown }) => condition.status)?.status;
    assert.deepEqual(status, "status" in filters && filters.status === "FAIL"
      ? { startsWith: "FAIL:" }
      : "pipelineStageId" in filters || "status" in filters ? "ACTIVE" : undefined);
    assert.equal(result.pagination.totalPages, 3);
  }
});

test("Fail count uses the same visibility and program scope as stage counts", async (context) => {
  for (const model of [prisma.lead_sources, prisma.institution_programs, prisma.users, prisma.pipeline_stages, prisma.majors, prisma.custom_fields]) {
    mockDelegate(context, model, "findMany", async () => []);
  }
  const stages = mockDelegate(context, prisma.leads, "groupBy", async (_args: { where: { AND: unknown[] } }) => []);
  const counts = mockDelegate(context, prisma.leads, "count", async (args: { where: unknown }) => JSON.stringify(args.where).includes("FAIL:") ? 7 : 45);
  mockDelegate(context, prisma, "$transaction", async (queries: Promise<unknown>[]) => Promise.all(queries));
  const result = await getLeadFilterOptions(user, "program-1");
  assert.equal(result.failedLeads, 7);
  assert.equal(result.totalLeads, 45);
  const scope = stages.mock.calls[0].arguments[0].where.AND[0];
  assert.deepEqual(counts.mock.calls[1].arguments[0].where, { AND: [scope, { status: { startsWith: "FAIL:" } }] });
});

test("list returns saved Fail stage independently of the current stage, including Bizfly L0", async (context) => {
  const stage0 = "10000000-0000-4000-8000-000000000010";
  const stage2 = "10000000-0000-4000-8000-000000000012";
  const missingStage = "10000000-0000-4000-8000-000000000099";
  const baseLead = {
    student_profiles: null, addresses: [], relatives: [], admission_profiles: null,
    majors: null, institution_programs: null, lead_sources: null, lead_origins: null,
    users_leads_assigned_toTousers: null, utm_trackings: [],
    full_name: "Candidate", phone: "0123456789", email: "candidate@example.test", cccd: "sensitive",
    note: "Ghi chú từ Bizfly", lead_notes: [], pipeline_stages: { id: stage0, name: "Đã tiếp nhận (L0)", color: null },
  };
  const rows = [
    { ...baseLead, id: "imported-fail", status: `FAIL:${stage0}` },
    { ...baseLead, id: "regular-fail", status: `FAIL:${stage2}`, pipeline_stages: null },
    { ...baseLead, id: "unknown-stage-fail", status: `FAIL:${missingStage}` },
    { ...baseLead, id: "active-lead", status: "ACTIVE", lead_notes: [{ content: "Ghi chú chăm sóc mới nhất" }] },
  ];
  const find = mockDelegate(context, prisma.leads, "findMany", async (_args: { select: { status: boolean } }) => rows);
  mockDelegate(context, prisma.leads, "count", async () => rows.length);
  mockDelegate(context, prisma.entity_tags, "findMany", async () => []);
  const stages = mockDelegate(context, prisma.pipeline_stages, "findMany", async (_args: { where: { id: { in: string[] } } }) => [
    { id: stage0, name: "Đã tiếp nhận (L0)" },
    { id: stage2, name: "TV chương trình (L2)" },
  ]);
  mockDelegate(context, prisma, "$transaction", async (queries: Promise<unknown>[]) => Promise.all(queries));

  const result = await listLeads(user, baseQuery);
  assert.equal(find.mock.calls[0].arguments[0].select.status, true);
  assert.deepEqual(result.data.map((lead) => lead.lifecycleStatus.label), ["Fail | L0", "Fail | L2", "Fail", "Active"]);
  assert.deepEqual(result.data.map((lead) => lead.lifecycleStatus.value), ["FAIL", "FAIL", "FAIL", "ACTIVE"]);
  assert.equal(result.data[0].note, "Ghi chú từ Bizfly");
  assert.equal(result.data[0].latestNote, "Ghi chú từ Bizfly");
  assert.equal(result.data[3].latestNote, "Ghi chú chăm sóc mới nhất");
  assert.equal(result.data[3].note, "Ghi chú từ Bizfly");
  for (const lead of result.data) {
    assert.equal(lead.phone, null);
    assert.equal(lead.email, null);
    assert.equal(lead.cccd, null);
  }
  assert.equal(stages.mock.calls.length, 1);
  assert.deepEqual(stages.mock.calls[0].arguments[0].where.id.in, [stage0, stage2, missingStage]);
});
