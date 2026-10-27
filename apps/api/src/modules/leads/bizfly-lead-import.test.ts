import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
process.env.NODE_ENV = "test";
const importer = import("./bizfly-lead-import.service.js");

function workbook(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Leads");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Bizfly reads both header rows, takes FZ note, ignores unrelated fields and preserves physical row numbers", async () => {
  const { readBizflyRows } = await importer;
  const header = Array(182).fill("");
  for (const [column, label] of [[0, "Họ và tên"], [20, "Số điện thoại"], [106, "Nguồn HV"], [181, "Ghi chú"], [19, "Ghi chú"], [96, "Ngành đăng ký"], [98, "Quy trình Telesale cấp 1"], [107, "Nhân viên"], [39, "Email"], [160, "Ngày tạo"], [2, "Giới tính"]] as const) header[column] = label;
  const data = Array(182).fill("");
  data[0] = "Nguyễn Văn A"; data[20] = "0901234567"; data[106] = "Facebook";
  data[19] = "Không lấy"; data[181] = "Ghi chú FZ"; data[2] = "Nam";
  data[107] = "staff@test.vn"; data[39] = "lead@test.vn";
  const rows = readBizflyRows(workbook([["Thông tin cơ bản"], header, [], data]));
  assert.equal(rows?.[0].row, 4);
  assert.equal(rows?.[0].values.note, "Ghi chú FZ");
  assert.equal(rows?.[0].values.gender, undefined);
  assert.equal(rows?.[0].values.assigneeEmail, "staff@test.vn");
  assert.equal(rows?.[0].values.email, "lead@test.vn");
  assert.equal(readBizflyRows(workbook([["fullName", "phone", "sourceName"], ["Lead", "0901234567", "Facebook"]])), null);
});

test("Bizfly parses local time-first timestamps, leap dates, serial dates and ISO timestamps", async () => {
  const { parseBizflyCreatedAt } = await importer;
  assert.equal(parseBizflyCreatedAt("13:26:51 07/10/2026")?.toISOString(), "2026-10-07T06:26:51.000Z");
  assert.equal(parseBizflyCreatedAt("29/02/2024")?.toISOString(), "2024-02-28T17:00:00.000Z");
  assert.equal(parseBizflyCreatedAt("2026-10-07T13:26:51+07:00")?.toISOString(), "2026-10-07T06:26:51.000Z");
  assert.ok(parseBizflyCreatedAt(45000));
  assert.equal(parseBizflyCreatedAt(""), undefined);
  assert.throws(() => parseBizflyCreatedAt("31/02/2026"));
  assert.throws(() => parseBizflyCreatedAt("2026-02-31"));
  assert.equal(parseBizflyCreatedAt(new Date("2026-10-07T13:26:51Z"))?.toISOString(), "2026-10-07T06:26:51.000Z");
  assert.throws(() => parseBizflyCreatedAt("Không phải ngày"));
});

test("Bizfly maps L3 to L4 and L8 to L5 using existing stage identities, rejects unknown or ambiguous stages", async () => {
  const { resolveBizflyStage } = await importer;
  const stages = [0, 1, 2, 4, 5].map((n) => ({ id: `stage-${n}`, name: `Giai đoạn (L${n})` }));
  for (const n of [0, 1, 2, 5]) assert.equal(resolveBizflyStage(`Tiến trình (L${n})`, stages), `stage-${n}`);
  assert.equal(resolveBizflyStage("Đăng ký học (L3)", stages), "stage-4");
  assert.equal(resolveBizflyStage("L8", stages), "stage-5");
  assert.equal(resolveBizflyStage("Tiến trình (L8)", stages), "stage-5");
  assert.equal(resolveBizflyStage(" l8 ", stages), "stage-5");
  assert.equal(resolveBizflyStage("L8", [...stages, { id: "stage-8", name: "L8" }]), "stage-5");
  assert.throws(() => resolveBizflyStage("L8", stages.filter((s) => s.id !== "stage-5")));
  assert.throws(() => resolveBizflyStage("L8", [...stages, { id: "other", name: "L5" }]));
  assert.throws(() => resolveBizflyStage("L9", stages));
  assert.equal(resolveBizflyStage("", stages), undefined);
  assert.throws(() => resolveBizflyStage("L3", stages.filter((s) => s.id !== "stage-4")));
  assert.throws(() => resolveBizflyStage("L3", [...stages, { id: "other", name: "L4" }]));
  assert.equal(resolveBizflyStage("Fail", stages), "stage-0");
  assert.equal(resolveBizflyStage(" fail ", stages), "stage-0");
  assert.throws(() => resolveBizflyStage("Fail", stages.filter((s) => s.id !== "stage-0")));
  assert.throws(() => resolveBizflyStage("Unknown", stages));
});

test("Bizfly persists program, assignee, timestamp and new major without assignment side effects", async () => {
  const { importBizflyRows } = await importer;
  const actor: AuthUser = { id: "actor", email: "actor@test.vn", fullName: "Actor", avatarUrl: null,
    roles: [], permissions: ["lead.create", "lead.assign", "lead.view_all"], departmentIds: [],
    institutionProgramIds: ["program"], accessScope: "ALL" };
  const leadWrites: Array<Record<string, unknown>> = [];
  let majorCreates = 0;
  const activities: string[] = [], audits: string[] = [];
  const noAssignment = async () => { throw new Error("Unexpected assignment side effect"); };
  const tx = {
    $queryRaw: async () => [],
    system_settings: { findUnique: async () => null },
    leads: { findFirst: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { leadWrites.push(data); return { id: "lead" }; } },
    lead_sources: { findUnique: async () => ({ id: "source", institution_program_id: "program" }) },
    institution_programs: { findUnique: async () => ({ id: "program" }) },
    majors: { findFirst: async () => ({ id: "major" }), upsert: async ({ create }: { create: Record<string, unknown> }) => {
      assert.equal(create.institution_program_id, "program"); majorCreates++; return { id: "major" };
    } },
    pipeline_stages: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, name: where.id === "stage-0" ? "L0" : where.id === "stage-5" ? "L5" : "L4" }) },
    users: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, full_name: "Nhân Viên", user_departments: [] }) },
    student_profiles: { findUnique: async () => null }, addresses: { findFirst: async () => null },
    relatives: { findFirst: async () => null }, utm_trackings: { findFirst: async () => null },
    admission_profiles: { findUnique: async () => null, upsert: async () => ({}) },
    lead_activities: { create: async ({ data }: { data: { type: string } }) => { activities.push(data.type); } },
    audit_logs: { create: async ({ data }: { data: { action: string } }) => { audits.push(data.action); } },
    lead_status_histories: { create: async () => ({}) }, students: { updateMany: async () => ({ count: 0 }) },
    lead_assignments: { create: noAssignment }, notifications: { create: noAssignment },
  };
  const database = {
    leads: { findFirst: async () => null },
    institution_programs: { findFirst: async () => ({ id: "program" }) },
    lead_sources: { findMany: async () => [{ id: "source", name: "Nguồn A", institution_program_id: "program" }] },
    majors: { findMany: async () => [] },
    pipeline_stages: { findMany: async () => [{ id: "stage", name: "L4" }, { id: "stage-0", name: "L0" }, { id: "stage-5", name: "L5" }] },
    users: { findMany: async () => [{ id: "staff", email: "Staff@Test.Vn" }, { id: "staff-2", email: "staff2@test.vn" }, { id: "staff-3", email: "staff3@test.vn" }] },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
  } as unknown as typeof prisma;
    const values = { fullName: "Nguyễn Văn A", phone: "0901234567", sourceName: "Nguồn A", majorName: "Ngành mới",
      stageName: "L3", assigneeEmail: " STAFF@test.vn ", createdAt: "13:26:51 07/10/2026", note: "Ghi chú", email: "lead@test.vn" };
    const result = await importBizflyRows(actor, [{ row: 3, values }, { row: 4, values: { ...values, phone: "0901234568", majorName: " ngành mới " } }], "program", undefined, database);
    assert.equal(result.importedRows, 2);
    assert.deepEqual(result.errors, []);
    assert.equal(majorCreates, 1);
    assert.equal(leadWrites[0].institution_program_id, "program");
    assert.equal(leadWrites[0].assigned_to, "staff");
    assert.equal(leadWrites[0].email, "lead@test.vn");
    assert.equal(leadWrites[0].pipeline_stage_id, "stage");
    assert.equal((leadWrites[0].created_at as Date).toISOString(), "2026-10-07T06:26:51.000Z");
    assert.equal(leadWrites[0].status, undefined);
    const failed = await importBizflyRows(actor, [{ row: 5, values: { ...values, phone: "0901234569", stageName: "Fail" } }], "program", undefined, database);
    assert.deepEqual(failed.errors, []);
    assert.equal(failed.importedRows, 1);
    assert.equal(leadWrites[2].status, "FAIL:stage-0");
    assert.equal(leadWrites[2].pipeline_stage_id, "stage-0");
    const l8 = await importBizflyRows(actor, [{ row: 6, values: { ...values, phone: "0901234570", stageName: "Tiến trình (L8)" } }], "program", undefined, database);
    assert.deepEqual(l8.errors, []);
    assert.equal(l8.importedRows, 1);
    assert.equal(leadWrites.at(-1)?.pipeline_stage_id, "stage-5");
    assert.equal(leadWrites.at(-1)?.status, undefined);
    assert.ok(!activities.includes("lead_assigned"));
    assert.ok(!audits.includes("assign"));
    await assert.rejects(importBizflyRows(actor, [{ row: 3, values }]), /chọn chương trình/);
    await assert.rejects(importBizflyRows(actor, [{ row: 3, values }], "other"), /không có quyền/);
    const invalid = await importBizflyRows(actor, [{ row: 8, values: { ...values, assigneeEmail: "missing@test.vn" } }], "program", undefined, database);
    assert.equal(invalid.errors[0].row, 8);
    assert.equal(invalid.importedRows, 0);
    assert.match(invalid.errors[0].message, /Không tìm thấy nhân viên phụ trách có email/);
    const invalidEmail = await importBizflyRows(actor, [{ row: 9, values: { ...values, assigneeEmail: "Nhân Viên" } }], "program", undefined, database);
    assert.equal(invalidEmail.importedRows, 0);
    assert.match(invalidEmail.errors[0].message, /Email nhân viên phụ trách không hợp lệ/);
    const unassigned = await importBizflyRows(actor, [{ row: 10, values: { ...values, assigneeEmail: " " } }], "program", undefined, database);
    assert.equal(unassigned.importedRows, 1);
    assert.equal(leadWrites.at(-1)?.assigned_to, null);
    const denied = await importBizflyRows({ ...actor, permissions: ["lead.create", "lead.view_all"] }, [{ row: 11, values }], "program", undefined, database);
    assert.equal(denied.importedRows, 0);
    assert.match(denied.errors[0].message, /không có quyền gán nhân viên/);
    const multiPhone = await importBizflyRows(actor, [
      { row: 12, values: { ...values, phone: "0918979962|0963726127" } },
      { row: 13, values: { ...values, phone: "090123456789" } },
      { row: 14, values: { ...values, phone: "84a9012" } },
      { row: 15, values: { ...values, phone: " | " } },
    ], "program", undefined, database);
    assert.equal(multiPhone.importedRows, 3);
    assert.equal(leadWrites.at(-3)?.phone, "0918979962");
    assert.deepEqual(leadWrites.at(-3)?.secondary_phones, ["0963726127"]);
    assert.equal(leadWrites.at(-2)?.phone, "090123456789");
    assert.equal(leadWrites.at(-1)?.phone, "84a9012");
    assert.equal(multiPhone.errors[0].row, 15);
    assert.match(multiPhone.errors[0].message, /Vui lòng nhập số điện thoại/);
    const secondary = await importBizflyRows(actor, [
      { row: 16, values: { ...values, phone: "0911111111", assigneeEmail: "staff@test.vn, staff2@test.vn" } },
      { row: 17, values: { ...values, phone: "0911111112", assigneeEmail: "staff@test.vn, staff2@test.vn", secondaryAssigneeEmail: "staff3@test.vn" } },
      { row: 18, values: { ...values, phone: "0911111113", secondaryAssigneeEmail: "missing@test.vn" } },
      { row: 19, values: { ...values, phone: "0911111114", assigneeEmail: "staff@test.vn, staff2@test.vn, staff3@test.vn" } },
      { row: 20, values: { ...values, phone: "0911111115", assigneeEmail: "", secondaryAssigneeEmail: "staff2@test.vn" } },
    ], "program", undefined, database);
    assert.equal(secondary.importedRows, 3);
    assert.equal(leadWrites.at(-3)?.assigned_to, "staff");
    assert.equal(leadWrites.at(-3)?.secondary_assigned_to, "staff-2");
    assert.equal(leadWrites.at(-2)?.assigned_to, "staff");
    assert.equal(leadWrites.at(-2)?.secondary_assigned_to, "staff-3");
    // Without a main assignee the secondary one becomes the main assignee.
    assert.equal(leadWrites.at(-1)?.assigned_to, "staff-2");
    assert.equal(leadWrites.at(-1)?.secondary_assigned_to, null);
    assert.deepEqual(secondary.errors.map((error) => error.row), [18, 19]);
    assert.match(secondary.errors[0].message, /Không tìm thấy nhân viên phụ có email/);
    assert.match(secondary.errors[1].message, /tối đa 2 email/);
    assert.ok(!activities.includes("lead_secondary_assigned"));
});

test("Bizfly reads Doanh số tháng as a date-only value", async () => {
  const { parseBizflyDate, readBizflyRows } = await importer;
  assert.equal(parseBizflyDate("31/10/2026", "Doanh số tháng"), "2026-10-31");
  assert.equal(parseBizflyDate("1-2-2026", "Doanh số tháng"), "2026-02-01");
  assert.equal(parseBizflyDate("2026-10-31", "Doanh số tháng"), "2026-10-31");
  assert.equal(parseBizflyDate(new Date("2026-10-30T17:00:00.000Z"), "Doanh số tháng"), "2026-10-31");
  assert.equal(parseBizflyDate(new Date("2026-10-31T00:00:00.000Z"), "Doanh số tháng"), "2026-10-31");
  assert.equal(parseBizflyDate(46326, "Doanh số tháng"), "2026-10-31");
  assert.equal(parseBizflyDate(" ", "Doanh số tháng"), undefined);
  assert.throws(() => parseBizflyDate("31/11/2026", "Doanh số tháng"), /Doanh số tháng không hợp lệ/);
  assert.throws(() => parseBizflyDate("10/2026", "Doanh số tháng"), /Doanh số tháng không hợp lệ/);
  const rows = readBizflyRows(workbook([["Họ và tên", "Số điện thoại", "Nguồn HV", "Doanh số tháng"], ["Lead", "0901234567", "Facebook", "31/10/2026"]]));
  assert.equal(rows?.[0].values.monthlyRevenue, "31/10/2026");
});

test("Bizfly re-import of a known phone updates only monthly revenue and stage, with history", async () => {
  const { importBizflyRows } = await importer;
  const actor: AuthUser = { id: "actor", email: "actor@test.vn", fullName: "Actor", avatarUrl: null,
    roles: [], permissions: ["lead.create", "lead.update_all", "lead.view_all"], departmentIds: [],
    institutionProgramIds: ["program"], accessScope: "ALL" };
  let profile: { institution_program_id: string; monthly_revenue: Date | null } | null = null;
  let lead = { id: "lead", status: "NEW", pipeline_stage_id: "stage-0", assigned_to: null, secondary_assigned_to: null };
  const leadUpdates: Array<Record<string, unknown>> = [], activities: string[] = [], audits: string[] = [], histories: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    system_settings: { findUnique: async () => null },
    leads: {
      findFirst: async () => lead,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        leadUpdates.push(data);
        if (typeof data.pipeline_stage_id === "string") lead = { ...lead, pipeline_stage_id: data.pipeline_stage_id };
      },
      create: async () => { throw new Error("Known phone must not create a lead"); },
    },
    admission_profiles: {
      findUnique: async () => profile,
      upsert: async ({ create, update }: { create: { monthly_revenue: Date }; update: { monthly_revenue: Date } }) => {
        profile = { institution_program_id: "program", monthly_revenue: (profile ? update : create).monthly_revenue };
      },
    },
    students: { updateMany: async () => ({ count: 0 }) },
    lead_status_histories: { create: async ({ data }: { data: unknown }) => { histories.push(data); } },
    lead_activities: { create: async ({ data }: { data: { type: string } }) => { activities.push(data.type); } },
    audit_logs: { create: async ({ data }: { data: { action: string } }) => { audits.push(data.action); } },
  };
  const database = {
    leads: { findFirst: async () => ({ id: "lead" }) },
    institution_programs: { findFirst: async () => ({ id: "program" }) },
    lead_sources: { findMany: async () => [] },
    majors: { findMany: async () => [] },
    pipeline_stages: { findMany: async () => [{ id: "stage-0", name: "L0" }, { id: "stage-5", name: "L5" }] },
    users: { findMany: async () => [] },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
  } as unknown as typeof prisma;
  // Unknown source/assignee columns are ignored for a known phone.
  const values = { fullName: "Nguyễn Văn A", phone: "0901234567", sourceName: "Nguồn cũ", assigneeEmail: "old@test.vn",
    stageName: "Tiến trình (L8)", monthlyRevenue: "31/10/2026" };

  const first = await importBizflyRows(actor, [{ row: 3, values }], "program", undefined, database);
  assert.deepEqual(first.errors, []);
  assert.deepEqual([first.importedRows, first.updatedRows, first.unchangedRows], [0, 1, 0]);
  assert.equal(profile!.monthly_revenue?.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(lead.pipeline_stage_id, "stage-5");
  assert.equal(histories.length, 1);
  assert.ok(activities.includes("pipeline_stage_changed") && activities.includes("lead_updated"));
  assert.ok(audits.includes("pipeline_stage_changed") && audits.includes("import_update"));

  const again = await importBizflyRows(actor, [{ row: 3, values }], "program", undefined, database);
  assert.deepEqual([again.updatedRows, again.unchangedRows, again.failedRows], [0, 1, 0]);
  assert.equal(leadUpdates.length, 1);

  const failedLead = { ...values, stageName: "L0", monthlyRevenue: "30/11/2026" };
  lead = { ...lead, status: "FAIL:6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7" };
  const failed = await importBizflyRows(actor, [{ row: 4, values: failedLead }], "program", undefined, database);
  assert.equal(failed.updatedRows, 1);
  assert.equal(lead.pipeline_stage_id, "stage-5");
  assert.equal(profile!.monthly_revenue?.toISOString(), "2026-11-30T00:00:00.000Z");

  const denied = await importBizflyRows({ ...actor, permissions: ["lead.create", "lead.view_all"] }, [{ row: 5, values }], "program", undefined, database);
  assert.equal(denied.failedRows, 1);
  assert.match(denied.errors[0].message, /không có quyền cập nhật/);
  const badDate = await importBizflyRows(actor, [{ row: 6, values: { ...values, monthlyRevenue: "10/2026" } }], "program", undefined, database);
  assert.match(badDate.errors[0].message, /Doanh số tháng không hợp lệ/);
});

test("Bizfly phone cells split on | and keep non-standard numbers for review", async () => {
  const { splitLeadPhones, isStandardLeadPhone } = await import("@admission-crm/shared/lead-phone");
  assert.deepEqual(splitLeadPhones("0918979962|0963726127"), ["0918979962", "0963726127"]);
  assert.deepEqual(splitLeadPhones(" 918 979 962 | 0918979962 "), ["0918979962"]);
  assert.deepEqual(splitLeadPhones(918979962), ["0918979962"]);
  assert.deepEqual(splitLeadPhones(""), []);
  assert.ok(isStandardLeadPhone("0918979962"));
  assert.ok(!isStandardLeadPhone("091897996"));
  assert.ok(!isStandardLeadPhone("09189799621"));
  assert.ok(!isStandardLeadPhone("1918979962"));
  assert.ok(!isStandardLeadPhone("09189799a2"));
});
