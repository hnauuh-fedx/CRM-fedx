import assert from "node:assert/strict";

import { prisma } from "../database/prisma";
import { normalizeCustomerListFilterConfig, resolveRelativeDateRange } from "../modules/customer-lists/customer-list-filter";

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

  console.log("Customer-list permissions, legacy filters, and relative date ranges are valid.");
}

run()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
