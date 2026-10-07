import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.NODE_ENV = "test";

const runId = randomUUID().slice(0, 8);
const createdRuleIds: string[] = [];
const createdLeadIds: string[] = [];
const createdTagIds: string[] = [];
const createdEntityTagIds: string[] = [];

async function verifyAutomationProgramScope() {
  const [{ prisma }, { getAuthUser }, automationService] = await Promise.all([
    import("../database/prisma.js"),
    import("../modules/auth/auth.service.js"),
    import("../modules/automations/automation.service.js"),
  ]);

  try {
    const director = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
      select: { id: true },
    });
    const principal = await getAuthUser(director.id);
    assert.ok(principal, "Cần tài khoản giám đốc để kiểm thử phạm vi chương trình.");
    assert.ok(principal.institutionProgramIds.length >= 2, "Cần ít nhất hai chương trình được phân quyền để kiểm thử tách dữ liệu.");

    const [workingProgramId, otherProgramId] = principal.institutionProgramIds;
    const actor = await getAuthUser(director.id, workingProgramId);
    assert.ok(actor);
    assert.equal(actor.workingInstitutionProgramId, workingProgramId);

    const fixtures = await Promise.all([
      prisma.automation_rules.create({
        data: {
          name: `[PROGRAM ${runId}] Working`,
          trigger_type: "lead_created",
          graph_data: { nodes: [], edges: [] },
          institution_program_id: workingProgramId,
          created_by: actor.id,
        },
        select: { id: true },
      }),
      prisma.automation_rules.create({
        data: {
          name: `[PROGRAM ${runId}] Other`,
          trigger_type: "lead_created",
          graph_data: { nodes: [], edges: [] },
          institution_program_id: otherProgramId,
          created_by: actor.id,
        },
        select: { id: true },
      }),
      prisma.automation_rules.create({
        data: {
          name: `[PROGRAM ${runId}] Global`,
          trigger_type: "lead_created",
          graph_data: { nodes: [], edges: [] },
          institution_program_id: null,
          created_by: actor.id,
        },
        select: { id: true },
      }),
    ]);
    createdRuleIds.push(...fixtures.map((rule) => rule.id));

    const leads = await Promise.all([
      prisma.leads.create({
        data: {
          full_name: `[PROGRAM ${runId}] Assigned lead`,
          phone: `090${runId.slice(0, 7)}`,
          institution_program_id: workingProgramId,
          owner_id: actor.id,
          assigned_to: actor.id,
        },
        select: { id: true },
      }),
      prisma.leads.create({
        data: {
          full_name: `[PROGRAM ${runId}] Unassigned lead`,
          phone: `091${runId.slice(0, 7)}`,
          institution_program_id: workingProgramId,
        },
        select: { id: true },
      }),
      prisma.leads.create({
        data: {
          full_name: `[PROGRAM ${runId}] Other program lead`,
          phone: `092${runId.slice(0, 7)}`,
          institution_program_id: otherProgramId,
        },
        select: { id: true },
      }),
    ]);
    createdLeadIds.push(...leads.map((lead) => lead.id));

    const tagFixtures = await Promise.all([
      prisma.tags.create({ data: { name: `[PROGRAM ${runId}] Assigned tag` }, select: { id: true, name: true } }),
      prisma.tags.create({ data: { name: `[PROGRAM ${runId}] Unassigned tag` }, select: { id: true, name: true } }),
      prisma.tags.create({ data: { name: `[PROGRAM ${runId}] Other tag` }, select: { id: true, name: true } }),
    ]);
    createdTagIds.push(...tagFixtures.map((tag) => tag.id));

    const entityTagFixtures = await Promise.all(tagFixtures.map((tag, index) =>
      prisma.entity_tags.create({
        data: { tag_id: tag.id, entity_type: "lead", entity_id: leads[index].id },
        select: { id: true },
      }),
    ));
    createdEntityTagIds.push(...entityTagFixtures.map((entityTag) => entityTag.id));

    const workingOptions = await automationService.getAutomationOptions(actor, workingProgramId);
    assert.ok(workingOptions, "Phải tải được tùy chọn automation trong chương trình làm việc.");
    const workingTagCodes = workingOptions.systemFieldOptions.tags.map((tag) => tag.code);
    assert.ok(workingTagCodes.includes(tagFixtures[0].name), "Phải thấy tag của lead được phân công trong chương trình làm việc.");
    assert.ok(workingTagCodes.includes(tagFixtures[1].name), "Giám đốc phải thấy tag của lead chưa phân công trong chương trình làm việc.");
    assert.ok(!workingTagCodes.includes(tagFixtures[2].name), "Không được thấy tag thuộc chương trình khác.");

    const assignedActor = {
      ...actor,
      accessScope: "ASSIGNED_ONLY" as const,
      permissions: [...actor.permissions.filter((permission) => permission !== "lead.view_all"), "lead.view_assigned"],
    };
    const assignedOptions = await automationService.getAutomationOptions(assignedActor, workingProgramId);
    assert.ok(assignedOptions, "Phải tải được tùy chọn automation cho người dùng có phạm vi được phân công.");
    const assignedTagCodes = assignedOptions.systemFieldOptions.tags.map((tag) => tag.code);
    assert.ok(assignedTagCodes.includes(tagFixtures[0].name), "Phải thấy tag của lead được phân công cho mình.");
    assert.ok(!assignedTagCodes.includes(tagFixtures[1].name), "Không được thấy tag của lead chưa phân công.");
    assert.ok(!assignedTagCodes.includes(tagFixtures[2].name), "Không được thấy tag thuộc chương trình khác.");

    const listed = await automationService.listAutomationRules(actor, {
      page: 1,
      limit: 20,
      search: `[PROGRAM ${runId}]`,
    });
    assert.ok(listed);
    assert.deepEqual(listed.data.map((rule) => rule.id), [fixtures[0].id], "Danh sách chỉ được trả rule của chương trình làm việc.");

    const spoofedList = await automationService.listAutomationRules(actor, {
      page: 1,
      limit: 20,
      institutionProgramId: otherProgramId,
    });
    assert.equal(spoofedList, null, "Không được đổi phạm vi bằng query chương trình khác.");
    assert.equal(await automationService.getAutomationRule(actor, fixtures[1].id), null, "Không được mở rule của chương trình khác bằng URL trực tiếp.");

    const created = await automationService.createAutomationRule(actor, {
      name: `[PROGRAM ${runId}] Created from working context`,
      triggerType: "lead_created",
      graphData: { nodes: [], edges: [] },
    });
    assert.ok(created, "Tạo rule phải dùng được chương trình làm việc khi body không truyền chương trình.");
    createdRuleIds.push(created.id);
    const persisted = await prisma.automation_rules.findUniqueOrThrow({
      where: { id: created.id },
      select: { institution_program_id: true },
    });
    assert.equal(persisted.institution_program_id, workingProgramId, "Rule mới phải tự gắn chương trình làm việc.");

    const crossProgramCreate = await automationService.createAutomationRule(actor, {
      name: `[PROGRAM ${runId}] Spoofed create`,
      triggerType: "lead_created",
      graphData: { nodes: [], edges: [] },
      institutionProgramId: otherProgramId,
    });
    assert.equal(crossProgramCreate, null, "Không được tạo rule cho chương trình khác bằng body giả mạo.");

    console.log("Automation program scope verified: list, detail and create follow the working program only.");
  } finally {
    await prisma.audit_logs.deleteMany({
      where: { entity_type: "automation_rule", entity_id: { in: createdRuleIds } },
    });
    await prisma.automation_rules.deleteMany({ where: { id: { in: createdRuleIds } } });
    await prisma.entity_tags.deleteMany({ where: { id: { in: createdEntityTagIds } } });
    await prisma.tags.deleteMany({ where: { id: { in: createdTagIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: createdLeadIds } } });
    await prisma.$disconnect();
  }
}

verifyAutomationProgramScope().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
