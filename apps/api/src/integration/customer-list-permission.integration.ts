import assert from "node:assert/strict";

import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import { normalizeCustomerListFilterConfig, resolveRelativeDateRange } from "../modules/customer-lists/customer-list-filter";
import { updateCustomerList } from "../modules/customer-lists/customer-list.service";

async function verifyFilterReplacementAndStaticPreservation() {
  const lead = await prisma.leads.findFirst({
    where: { deleted_at: null, institution_program_id: { not: null } },
    select: {
      id: true,
      full_name: true,
      institution_program_id: true,
    },
  });
  const user = await prisma.users.findFirst({
    select: {
      id: true,
      email: true,
      full_name: true,
      avatar_url: true,
    },
  });
  assert.ok(lead?.institution_program_id, "Cần ít nhất một lead thuộc chương trình để kiểm tra cập nhật danh sách.");
  assert.ok(user, "Cần ít nhất một người dùng để kiểm tra cập nhật danh sách.");
  const replacementLead = await prisma.leads.findFirst({
    where: {
      deleted_at: null,
      institution_program_id: lead.institution_program_id,
      full_name: { not: lead.full_name },
    },
    select: { id: true, full_name: true },
  });
  assert.ok(replacementLead, "Cần hai lead có tên khác nhau trong cùng chương trình để kiểm tra thay bộ lọc.");

  const actor: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    roles: ["DIRECTOR"],
    permissions: ["customer_list.manage", "customer_list.view_all", "lead.view_all", "lead.sensitive.view"],
    departmentIds: [],
    institutionProgramIds: [lead.institution_program_id],
    accessScope: "ALL",
  };
  const listName = `__customer_list_update_test_${Date.now()}`;
  let listId: string | undefined;

  try {
    const list = await prisma.customer_lists.create({
      data: {
        institution_program_id: lead.institution_program_id,
        name: listName,
        filter_config: {
          combinator: "AND",
          conditions: [{ field: "fullName", operator: "equals", value: lead.full_name }],
        },
        created_by: user.id,
      },
    });
    listId = list.id;
    await prisma.customer_list_members.create({
      data: { customer_list_id: list.id, lead_id: lead.id, added_by: user.id },
    });

    const replaced = await updateCustomerList(actor, list.id, {
      name: `${listName}_renamed`,
      filters: {
        combinator: "AND",
        conditions: [{ field: "fullName", operator: "equals", value: replacementLead.full_name }],
      },
      institutionProgramId: lead.institution_program_id,
    });

    assert.equal(replaced.ok, true);
    if (!replaced.ok) return;
    assert.equal(replaced.data.name, `${listName}_renamed`);
    assert.equal(replaced.data.isDynamic, true);
    assert.ok(replaced.data.customerCount >= 1);
    assert.equal(
      await prisma.customer_list_members.findUnique({
        where: { customer_list_id_lead_id: { customer_list_id: list.id, lead_id: lead.id } },
      }),
      null,
      "Thành viên còn lại từ bộ lọc cũ phải được xóa khi thay bằng bộ lọc mới.",
    );

    const madeStatic = await updateCustomerList(actor, list.id, {
      name: `${listName}_renamed`,
      filters: { combinator: "AND", conditions: [] },
      institutionProgramId: lead.institution_program_id,
    });

    assert.equal(madeStatic.ok, true);
    if (!madeStatic.ok) return;
    assert.equal(madeStatic.data.isDynamic, false);
    assert.ok(madeStatic.data.customerCount >= 1);
    assert.ok(
      await prisma.customer_list_members.findUnique({
        where: { customer_list_id_lead_id: { customer_list_id: list.id, lead_id: replacementLead.id } },
      }),
      "Lead phù hợp bộ lọc hiện tại phải được giữ lại khi chuyển thành danh sách tĩnh.",
    );
  } finally {
    if (listId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "customer_list", entity_id: listId } });
      await prisma.customer_lists.delete({ where: { id: listId } });
    }
  }
}

async function run() {
  const referenceTime = new Date("2026-09-15T05:00:00.000Z");
  const thisWeek = resolveRelativeDateRange("thisWeek", referenceTime);
  assert.equal(thisWeek.from.toISOString(), "2026-09-13T17:00:00.000Z");
  assert.equal(thisWeek.to.toISOString(), "2026-09-20T17:00:00.000Z");
  const previousQuarter = resolveRelativeDateRange("lastQuarter", referenceTime);
  assert.equal(previousQuarter.from.toISOString(), "2026-03-31T17:00:00.000Z");
  assert.equal(previousQuarter.to.toISOString(), "2026-06-30T17:00:00.000Z");
  assert.deepEqual(normalizeCustomerListFilterConfig({ sourceId: "source-id" }), {
    combinator: "AND",
    conditions: [{ field: "sourceId", operator: "equals", value: "source-id" }],
  });

  const roles = await prisma.roles.findMany({
    where: { code: { in: ["DIRECTOR", "MARKETING_MANAGER"] } },
    select: {
      code: true,
      role_permissions: {
        where: { permissions: { code: "customer_list.manage" } },
        select: { permissions: { select: { code: true } } },
      },
    },
  });

  assert.equal(roles.length, 2, "Thiếu vai trò mặc định để kiểm tra quyền danh sách khách hàng.");
  for (const role of roles) {
    assert.ok(
      role.role_permissions.some((grant) => grant.permissions?.code === "customer_list.manage"),
      `${role.code} chưa được cấp quyền customer_list.manage.`,
    );
  }

  await verifyFilterReplacementAndStaticPreservation();

  console.log("Customer-list permissions, filter replacement, relative dates, and static preservation are valid.");
}

run()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
