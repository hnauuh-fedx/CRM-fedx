import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { displayLayoutsRouter } from "../modules/display-layouts/display-layout.router";
import { createAuthSession } from "../modules/auth/auth-session.service";
import { checkPersonalLayouts } from "./display-layout-personal-checks";
import { checkLayoutScreens } from "./display-layout-screen-checks";
import { checkCustomerLayouts } from "./customer-layout-checks";
import { checkCustomerLayoutMigration } from "./customer-layout-migration-checks";
import type { AuthUser } from "../modules/auth/auth.types";
import type {
  DisplayLayout,
  LayoutDraft,
} from "@admission-crm/shared/display-layout";
import {
  createLayout,
  effectiveLayout,
  layoutDetail,
  layoutTargetOptions,
  listLayouts,
  previewLayout,
  publishLayout,
  restoreLayout,
  saveLayout,
} from "../modules/display-layouts/display-layout.service";

async function run() {
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.DATABASE_URL).hostname,
    ),
    "Integration fixtures require a local database.",
  );
  const programId = randomUUID(),
    otherProgram = randomUUID(),
    roleId = randomUUID();
  const users = Array.from({ length: 4 }, () => randomUUID());
  const departments = [randomUUID(), randomUUID()];
  const actor: AuthUser = {
    id: users[0],
    fullName: "[TEST] Layout manager",
    email: "fixture@example.test",
    avatarUrl: null,
    roles: [],
    permissions: ["system.manage", "lead.view_all"],
    institutionProgramIds: [programId],
    departmentIds: [],
    accessScope: "ALL",
  };
  const sale = (index: number, departmentIds = [departments[0]]): AuthUser => ({
    ...actor,
    id: users[index],
    permissions: ["lead.view_assigned"],
    accessScope: "ASSIGNED_ONLY",
    departmentIds,
  });
  const draft = (
    name: string,
    targets: LayoutDraft["targets"],
    fields = ["fullName", "phone"],
  ): LayoutDraft => ({ name, visibleFields: fields, targets });
  const publish = async (item: DisplayLayout) => {
    const preview = await previewLayout(
      actor,
      programId,
      item.id,
      item.revision,
    );
    return publishLayout(
      actor,
      programId,
      item.id,
      item.revision,
      preview.assignmentRevision,
    );
  };
  try {
    await prisma.institution_programs.create({
      data: {
        id: programId,
        code: `TEST-LAYOUT-${programId}`,
        name: "[TEST] Display layouts",
        institution_name: "[TEST]",
      },
    });
    await prisma.users.createMany({
      data: users.map((id, i) => ({
        id,
        email: `${id}@layout.example.test`,
        full_name: `[TEST] Layout ${i}`,
        password_hash: "disabled-test-password",
      })),
    });
    await prisma.departments.createMany({
      data: departments.map((id, i) => ({
        id,
        name: `[TEST] Layout department ${i}`,
      })),
    });
    await prisma.roles.create({
      data: {
        id: roleId,
        code: `TEST_LAYOUT_${roleId}`,
        name: "[TEST] Layout role",
      },
    });
    const permission = await prisma.permissions.findFirstOrThrow({
      where: { code: "lead.view_assigned" },
    });
    await prisma.role_permissions.create({
      data: { role_id: roleId, permission_id: permission.id },
    });
    await prisma.role_institution_programs.create({
      data: { role_id: roleId, institution_program_id: programId },
    });
    await prisma.user_program_roles.createMany({
      data: users
        .slice(1)
        .map((id) => ({
          user_id: id,
          role_id: roleId,
          institution_program_id: programId,
        })),
    });
    await prisma.user_departments.createMany({
      data: [
        { user_id: users[1], department_id: departments[0] },
        { user_id: users[2], department_id: departments[0] },
        { user_id: users[3], department_id: departments[0] },
        { user_id: users[3], department_id: departments[1] },
      ],
    });
    let common = await createLayout(
      actor,
      programId,
      null,
      draft("Mẫu chung", [{ type: "DEFAULT", id: "default" }]),
    );
    assert.equal(
      (await effectiveLayout(sale(1), programId)).source,
      "SYSTEM",
      "Nháp không được áp dụng.",
    );
    assert.equal(
      (await previewLayout(actor, programId, common.id, common.revision)).users,
      3,
    );
    common = await publish(common);
    assert.equal((await effectiveLayout(sale(1), programId)).source, "DEFAULT");
    let team = await createLayout(
      actor,
      programId,
      null,
      draft(
        "Mẫu phòng ban",
        [{ type: "DEPARTMENT", id: departments[0] }],
        ["phone", "fullName"],
      ),
    );
    assert.equal(
      (await previewLayout(actor, programId, team.id, team.revision)).users,
      2,
      "Người nhiều phòng ban không kế thừa mẫu phòng ban.",
    );
    team = await publish(team);
    assert.equal(
      (await effectiveLayout(sale(1), programId)).source,
      "DEPARTMENT",
    );
    assert.deepEqual(
      (await effectiveLayout(sale(1), programId)).visibleFields,
      ["phone", "fullName"],
    );
    assert.equal(
      (await effectiveLayout(sale(3, departments), programId)).source,
      "DEFAULT",
    );
    let personal = await createLayout(
      actor,
      programId,
      null,
      draft("Mẫu Sale", [{ type: "USER", id: users[1] }], ["fullName"]),
    );
    personal = await publish(personal);
    assert.equal((await effectiveLayout(sale(1), programId)).source, "USER");
    const impact = await previewLayout(
      actor,
      programId,
      team.id,
      team.revision,
    );
    assert.equal(impact.users, 1);
    assert.equal(impact.overriddenUsers, 1);
    const stalePreview = await previewLayout(
      actor,
      programId,
      common.id,
      common.revision,
    );
    team = await publish(team);
    await assert.rejects(
      publishLayout(
        actor,
        programId,
        common.id,
        common.revision,
        stalePreview.assignmentRevision,
      ),
      /Phân bổ mẫu/,
    );
    const original = personal;
    personal = await saveLayout(
      actor,
      programId,
      personal.id,
      personal.revision,
      { ...personal.draft, visibleFields: ["fullName", "source"] },
    );
    await assert.rejects(
      saveLayout(
        actor,
        programId,
        original.id,
        original.revision,
        original.draft,
      ),
      /người khác/,
    );
    assert.deepEqual(
      (await effectiveLayout(sale(1), programId)).visibleFields,
      ["fullName"],
      "Nháp không thay đổi bản đang dùng.",
    );
    personal = await publish(personal);
    personal = await restoreLayout(
      actor,
      programId,
      personal.id,
      personal.revision,
      1,
    );
    assert.deepEqual(
      (await effectiveLayout(sale(1), programId)).visibleFields,
      ["fullName", "source"],
      "Khôi phục chỉ sửa nháp.",
    );
    personal = await publish(personal);
    assert.deepEqual(
      (await effectiveLayout(sale(1), programId)).visibleFields,
      ["fullName"],
    );
    assert.equal(
      (await layoutDetail(actor, programId, personal.id, 1)).versions.length,
      3,
    );
    personal = await saveLayout(
      actor,
      programId,
      personal.id,
      personal.revision,
      { ...personal.draft, targets: [] },
    );
    personal = await publish(personal);
    assert.equal(
      (await effectiveLayout(sale(1), programId)).source,
      "DEPARTMENT",
      "Bỏ gán Sale quay về phòng ban.",
    );
    assert.equal((await listLayouts(actor, programId, 1, "")).total, 3);
    assert.equal(
      (await layoutTargetOptions(actor, programId, "USER", "", 1)).data.length,
      3,
    );
    await assert.rejects(
      layoutDetail(actor, otherProgram, personal.id, 1),
      /chương trình/,
    );
    await assert.rejects(
      createLayout(
        { ...actor, permissions: [] },
        programId,
        null,
        draft("Denied", []),
      ),
      /quyền/,
    );
    await assert.rejects(
      createLayout(
        actor,
        programId,
        null,
        draft("Denied", [{ type: "USER", id: randomUUID() }]),
      ),
      /Sale/,
    );
    const manager = {
      ...actor,
      accessScope: "DEPARTMENT" as const,
      departmentIds: [departments[0]],
    };
    await assert.rejects(
      layoutDetail(manager, programId, common.id, 1),
      /phạm vi/,
    );
    await assert.rejects(
      createLayout(
        manager,
        programId,
        departments[0],
        draft("Denied", [{ type: "DEFAULT", id: "default" }]),
      ),
      /phòng ban/,
    );
    await assert.rejects(
      createLayout(
        manager,
        programId,
        departments[0],
        draft("Denied", [{ type: "USER", id: users[3] }]),
      ),
      /phạm vi/,
    );
    let scoped = await createLayout(
      manager,
      programId,
      departments[0],
      draft("Mẫu riêng phòng", [{ type: "USER", id: users[2] }]),
    );
    const scopedPreview = await previewLayout(
      manager,
      programId,
      scoped.id,
      scoped.revision,
    );
    scoped = await publishLayout(
      manager,
      programId,
      scoped.id,
      scoped.revision,
      scopedPreview.assignmentRevision,
    );
    assert.equal((await effectiveLayout(sale(2), programId)).source, "USER");
    await prisma.user_departments.deleteMany({ where: { user_id: users[2] } });
    assert.equal(
      (await effectiveLayout(sale(2, []), programId)).source,
      "DEFAULT",
      "Rời phòng ban không giữ mẫu do phòng ban quản lý.",
    );
    // Two concurrent writers must not silently overwrite the same draft.
    const race = await Promise.allSettled([
      saveLayout(actor, programId, common.id, common.revision, {
        ...common.draft,
        name: "Concurrent A",
      }),
      saveLayout(actor, programId, common.id, common.revision, {
        ...common.draft,
        name: "Concurrent B",
      }),
    ]);
    assert.equal(
      race.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      race.filter((result) => result.status === "rejected").length,
      1,
    );
    let first = await createLayout(
      actor,
      programId,
      null,
      draft("Mẫu đang gán", [{ type: "USER", id: users[1] }]),
    );
    first = await publish(first);
    const replacement = await createLayout(
      actor,
      programId,
      null,
      draft("Mẫu thay thế", [{ type: "USER", id: users[1] }]),
    );
    const replacing = await previewLayout(
      actor,
      programId,
      replacement.id,
      replacement.revision,
    );
    assert.equal(replacing.replacedAssignments, 1);
    assert.deepEqual(replacing.replacedTemplates, [
      { name: first.draft.name, assignments: 1 },
    ]);
    const forbiddenReplacement = await createLayout(
      manager,
      programId,
      departments[0],
      draft("Mẫu bị chặn", [{ type: "USER", id: users[1] }]),
    );
    await assert.rejects(
      previewLayout(
        manager,
        programId,
        forbiddenReplacement.id,
        forbiddenReplacement.revision,
      ),
      /phạm vi/,
    );
    assert.equal(
      (await effectiveLayout(sale(1), programId)).name,
      first.draft.name,
    );
    await checkPersonalLayouts(
      actor,
      sale(1),
      sale(2, []),
      programId,
      otherProgram,
    );
    await checkLayoutScreens(actor, sale(1), programId, publish);
    await checkCustomerLayouts(actor, sale(1), programId, publish);
    await checkCustomerLayoutMigration();
    const session = await createAuthSession(
      users[1],
      "disabled-test-password",
      false,
    );
    assert.ok(session);
    const http = express()
      .use(express.json())
      .use("/layouts", displayLayoutsRouter)
      .listen(0, "127.0.0.1");
    await once(http, "listening");
    try {
      const address = http.address();
      assert.ok(address && typeof address !== "string");
      const endpoint = `http://127.0.0.1:${address.port}/layouts`;
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Institution-Program-Id": programId,
      };
      assert.equal((await fetch(`${endpoint}/effective`)).status, 401);
      assert.equal(
        (await fetch(`${endpoint}/effective`, { headers })).status,
        200,
      );
      assert.equal(
        (await fetch(endpoint, { headers })).status,
        403,
        "Sale không có system.manage không được quản lý mẫu.",
      );
      const effective = await fetch(`${endpoint}/effective`, { headers }).then(
        (response) => response.json(),
      );
      const personalBody = {
        revision: effective.personalRevision,
        baseTemplateId: effective.baseTemplateId,
        baseVersion: effective.baseVersion,
        presentation: effective.inherited,
      };
      assert.equal(
        (
          await fetch(`${endpoint}/personal`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ ...personalBody, userId: users[2] }),
          })
        ).status,
        400,
      );
      const personalResponse = await fetch(`${endpoint}/personal`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(personalBody),
      });
      assert.equal(
        personalResponse.status,
        200,
        "Sale chỉ lưu được cấu hình cá nhân theo chính sách mẫu.",
      );
      const own = await personalResponse.json();
      assert.equal(
        (
          await fetch(`${endpoint}/personal/reset`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ revision: own.personalRevision }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(`${endpoint}/effective`, {
            headers: { ...headers, "X-Institution-Program-Id": otherProgram },
          })
        ).status,
        403,
      );
      const leadBeforeCustomerWrite = await effectiveLayout(sale(1), programId);
      const customerEffective = await fetch(
        `${endpoint}/effective?screen=CUSTOMER_LIST`,
        { headers },
      ).then((response) => response.json());
      const customerWrite = await fetch(
        `${endpoint}/personal?screen=CUSTOMER_LIST`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: customerEffective.personalRevision,
            baseTemplateId: customerEffective.baseTemplateId,
            baseVersion: customerEffective.baseVersion,
            presentation: customerEffective.inherited,
          }),
        },
      );
      assert.equal(customerWrite.status, 200);
      const customerOwn = await customerWrite.json();
      assert.deepEqual(
        await effectiveLayout(sale(1), programId),
        leadBeforeCustomerWrite,
      );
      assert.equal(
        (
          await fetch(`${endpoint}/personal/reset?screen=CUSTOMER_LIST`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ revision: customerOwn.personalRevision }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(`${endpoint}/personal?screen=LEAD_FORM`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(personalBody),
          })
        ).status,
        400,
      );
    } finally {
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
    const logs = await prisma.audit_logs.count({
      where: { entity_type: "display_layout", user_id: users[0] },
    });
    assert.ok(logs >= 10);
    console.log(
      "PASS display-layout integration: drafts, inheritance, impact, conflict, restore, scope, audit, membership changes",
    );
  } finally {
    await prisma.display_layout_preferences.deleteMany({
      where: { institution_program_id: programId },
    });
    const templates = await prisma.display_layout_templates.findMany({
      where: { institution_program_id: programId },
      select: { id: true },
    });
    await prisma.display_layout_versions.deleteMany({
      where: { template_id: { in: templates.map((t) => t.id) } },
    });
    await prisma.display_layout_assignments.deleteMany({
      where: { institution_program_id: programId },
    });
    await prisma.display_layout_templates.deleteMany({
      where: { institution_program_id: programId },
    });
    await prisma.display_layout_program_state.deleteMany({
      where: { institution_program_id: programId },
    });
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: users } } });
    await prisma.user_departments.deleteMany({
      where: { user_id: { in: users } },
    });
    await prisma.user_program_roles.deleteMany({
      where: { user_id: { in: users } },
    });
    await prisma.role_permissions.deleteMany({ where: { role_id: roleId } });
    await prisma.role_institution_programs.deleteMany({
      where: { role_id: roleId },
    });
    await prisma.roles.deleteMany({ where: { id: roleId } });
    await prisma.users.deleteMany({ where: { id: { in: users } } });
    await prisma.departments.deleteMany({ where: { id: { in: departments } } });
    await prisma.institution_programs.deleteMany({ where: { id: programId } });
    await prisma.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
