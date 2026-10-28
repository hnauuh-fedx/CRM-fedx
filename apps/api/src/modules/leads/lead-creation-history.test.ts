import assert from "node:assert/strict";
import { test } from "node:test";
process.env.NODE_ENV = "test";

test("trusted inbound creation must not attribute API receipt to the director", async () => {
  const { createTrustedInboundLeadInTransaction } = await import("./application/create-lead.use-case.js");
  const activities: any[] = [];
  const audits: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    system_settings: { findUnique: async () => null },
    leads: { create: async () => ({ id: "lead" }) },
    student_profiles: { findUnique: async () => null },
    admission_profiles: { findUnique: async () => null },
    addresses: { findFirst: async () => null }, relatives: { findFirst: async () => null },
    utm_trackings: { findFirst: async () => null },
    lead_activities: { create: async ({ data }: any) => { activities.push(data); } },
    audit_logs: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const actor: any = { id: "director", fullName: "Giám đốc", permissions: [], departmentIds: [], institutionProgramIds: [], accessScope: "ALL" };
  const result = await createTrustedInboundLeadInTransaction(tx, actor,
    { fullName: "Nguyễn Văn A", phone: "0901234567", sourceId: "", institutionProgramId: "program" },
    { allowDuplicate: true, allowMissingSource: true });
  assert.equal(result.ok, true);
  assert.equal(activities[0].user_id, null);
  assert.match(activities[0].content, /API/);
  assert.equal(audits[0].new_data.creation.channel, "api");
  assert.equal(audits[0].new_data.creation.initialValues.fullName, "Nguyễn Văn A");
});

test("creation summaries retain source and initial data, with sensitive values filtered", async () => {
  const { describeLeadCreation } = await import("./lead-creation-history.js");
  const creation = { channel: "webhook", webhookName: "Facebook tuyển sinh", requestId: "request-1", initialValues: { fullName: "Tên lúc tạo", phone: "0901234567", email: "lead@example.vn", cccd: "123456789012", note: "Thông tin riêng", unknownSecret: "secret" } };
  const visible = describeLeadCreation(creation, true);
  assert.match(visible.description, /API đã đổ dữ liệu tạo lead qua webhook Facebook tuyển sinh/);
  assert.match(visible.description, /Họ và tên: Tên lúc tạo/);
  assert.match(visible.description, /Số điện thoại: 0901234567/);
  assert.doesNotMatch(visible.description, /unknownSecret|secret/);
  const restricted = describeLeadCreation(creation, false);
  assert.doesNotMatch(restricted.description, /0901234567|lead@example.vn|123456789012|Thông tin riêng/);
  assert.equal(restricted.actorLabel, "API / Webhook");
  assert.match(describeLeadCreation({ channel: "manual", creatorName: "Nguyễn Văn B", initialValues: { fullName: "A" } }, true).description, /Nguyễn Văn B tạo lead mới thủ công/);
  assert.match(describeLeadCreation({ channel: "public_form", formName: "Đăng ký tư vấn" }, true).description, /biểu mẫu Đăng ký tư vấn/);
  assert.match(describeLeadCreation({ channel: "webhook", formName: "Đăng ký tư vấn", formId: "form" }, true).description, /webhook của biểu mẫu Đăng ký tư vấn/);
});

test("legacy API creation uses only a CREATED request and never later webhook updates", async () => {
  const { loadLeadCreationHistory } = await import("./lead-creation-history.service.js");
  const { describeLeadCreation } = await import("./lead-creation-history.js");
  let requestQuery: any;
  const database: any = {
    audit_logs: { findFirst: async () => ({ id: "audit", action: "create", new_data: { fullName: "Tên gốc" }, users: { full_name: "Giám đốc" } }) },
    webhook_requests: { findFirst: async (query: any) => {
      requestQuery = query;
      return { webhook_id: "hook", request_id: "req", config_snapshot: { webhookName: "Webhook gốc" }, mapped_payload: { fullName: "Tên gốc", phone: "0901234567" }, webhooks: { name: "Tên đã đổi" } };
    } },
  };
  const result = await loadLeadCreationHistory("lead", database);
  assert.equal(requestQuery.where.record_id, "lead");
  assert.equal(requestQuery.where.action, "CREATED");
  const display = describeLeadCreation(result.creation, true);
  assert.match(display.description, /Webhook gốc/);
  assert.doesNotMatch(display.description, /Giám đốc|Tên đã đổi/);
  database.webhook_requests.findFirst = async () => null;
  assert.match(describeLeadCreation((await loadLeadCreationHistory("lead", database)).creation, true).description, /chưa lưu hình thức tạo/);
  database.audit_logs.findFirst = async () => ({ id: "audit", new_data: { creation: { channel: "manual", creatorName: "Người tạo gốc", initialValues: { fullName: "Tên gốc" } } } });
  database.webhook_requests.findFirst = async () => { throw new Error("A later webhook must not override the manual creation snapshot"); };
  assert.match(describeLeadCreation((await loadLeadCreationHistory("lead", database)).creation, true).description, /Người tạo gốc tạo lead mới thủ công/);
});

test("legacy public forms and form webhooks retain the original form and submitted values", async () => {
  const { loadLeadCreationHistory } = await import("./lead-creation-history.service.js");
  const { describeLeadCreation } = await import("./lead-creation-history.js");
  for (const source of ["public_form", "webhook"]) {
    const database: any = {
      audit_logs: { findFirst: async () => ({ id: "audit", action: "create_from_marketing_form", new_data: { marketingFormId: "form", sourceId: "source" }, users: { full_name: "Giám đốc" } }) },
      webhook_requests: { findFirst: async () => null },
      marketing_form_submissions: { findFirst: async (query: any) => {
        assert.equal(query.where.marketing_form_id, "form");
        assert.equal(query.where.lead_id, "lead");
        return { source, configuration_snapshot: { formName: "Form lúc tạo" }, normalized_payload: { full_name: "Tên lúc tạo", phone: "0901234567" }, marketing_forms: { name: "Form đã đổi tên" } };
      } },
    };
    const display = describeLeadCreation((await loadLeadCreationHistory("lead", database)).creation, true);
    assert.match(display.description, /Form lúc tạo/);
    assert.match(display.description, /Họ và tên: Tên lúc tạo/);
    assert.doesNotMatch(display.description, /Giám đốc|Form đã đổi tên/);
    assert.equal(display.actorLabel, source === "webhook" ? "API / Webhook" : "Biểu mẫu hệ thống");
  }
});

test("creation values are a snapshot and readable reference names replace IDs", async () => {
  const { createLeadCreationSnapshot, describeLeadCreation } = await import("./lead-creation-history.js");
  const input = { fullName: "Tên lúc tạo", phone: "0901234567", sourceId: "source-uuid", sourceName: "Facebook", pipelineStageId: "stage-uuid", pipelineStageName: "Chờ tư vấn" };
  const creation = createLeadCreationSnapshot(input, { channel: "manual" }, "Người tạo");
  input.fullName = "Tên sau khi sửa";
  const display = describeLeadCreation(creation, true);
  assert.match(display.description, /Họ và tên: Tên lúc tạo/);
  assert.match(display.description, /Nguồn học viên: Facebook/);
  assert.match(display.description, /Tiến trình: Chờ tư vấn/);
  assert.doesNotMatch(display.description, /Tên sau khi sửa|source-uuid|stage-uuid/);
});

test("legacy reference IDs are resolved in batches without changing the saved snapshot", async () => {
  const { resolveLeadCreationNames } = await import("./lead-creation-history.service.js");
  const { describeLeadCreation } = await import("./lead-creation-history.js");
  const sourceId = "00000000-0000-4000-8000-000000000001";
  const assigneeId = "00000000-0000-4000-8000-000000000002";
  const programId = "00000000-0000-4000-8000-000000000003";
  const creation = { channel: "unknown", initialValues: { sourceId, assigneeId, secondaryAssigneeId: assigneeId, phone: "0901234567" } };
  let sourceQueries = 0;
  let userQueries = 0;
  const database: any = {
    lead_sources: { findMany: async (query: any) => {
      sourceQueries++;
      assert.deepEqual(query.where, { id: { in: [sourceId] }, institution_program_id: programId });
      assert.deepEqual(query.select, { id: true, name: true });
      return [{ id: sourceId, name: "Facebook tuyển sinh" }];
    } },
    users: { findMany: async (query: any) => {
      userQueries++;
      assert.deepEqual(query.where.id.in, [assigneeId]);
      assert.equal(query.where.user_program_roles.some.institution_program_id, programId);
      assert.deepEqual(query.select, { id: true, full_name: true });
      return [{ id: assigneeId, full_name: "Nguyễn Văn An" }];
    } },
  };
  const resolved = await resolveLeadCreationNames([creation, creation], programId, database);
  assert.equal(sourceQueries, 1);
  assert.equal(userQueries, 1);
  for (const item of resolved) {
    const display = describeLeadCreation(item, false).description;
    assert.match(display, /Nguồn học viên: Facebook tuyển sinh/);
    assert.match(display, /Nhân viên phụ trách: Nguyễn Văn An/);
    assert.match(display, /Nhân viên phụ trách phụ: Nguyễn Văn An/);
    assert.doesNotMatch(display, /00000000|\(mã\)|0901234567/);
  }
  assert.equal("sourceName" in creation.initialValues, false);
});

test("recorded reference names take precedence and do not need another lookup", async () => {
  const { resolveLeadCreationNames } = await import("./lead-creation-history.service.js");
  const creation = { initialValues: { sourceId: "00000000-0000-4000-8000-000000000001", sourceName: "Nguồn lúc tạo" } };
  const [resolved] = await resolveLeadCreationNames([creation], null, {} as any);
  assert.equal(resolved.initialValues.sourceName, "Nguồn lúc tạo");
});

test("missing references and technical tracking IDs never appear as codes in the summary", async () => {
  const { describeLeadCreation } = await import("./lead-creation-history.js");
  const { resolveLeadCreationNames } = await import("./lead-creation-history.service.js");
  const id = "00000000-0000-4000-8000-000000000001";
  const creation = { channel: "webhook", webhookId: id, formId: id, requestId: id, initialValues: { sourceId: id, assigneeId: "not-a-valid-uuid" } };
  const [resolved] = await resolveLeadCreationNames([creation], null, { lead_sources: { findMany: async () => [] } } as any);
  const display = describeLeadCreation(resolved, true).description;
  assert.match(display, /Nguồn học viên: Không còn thông tin/);
  assert.match(display, /Nhân viên phụ trách: Không còn thông tin/);
  assert.doesNotMatch(display, /00000000|not-a-valid-uuid|\(mã\)|Mã yêu cầu/);
});
