import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import type { AuthUser } from "../modules/auth/auth.types";
import {
  layoutTargetOptions,
  createLayout,
} from "../modules/display-layouts/display-layout.service";

async function run() {
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.DATABASE_URL).hostname,
    ),
    "Owner fixtures require a local database.",
  );
  const ids = [randomUUID(), randomUUID()];
  const search = `OWNER-${randomUUID()}`;
  const programId = randomUUID();
  const actor: AuthUser = {
    id: randomUUID(),
    fullName: "Fixture",
    email: "fixture@example.test",
    avatarUrl: null,
    roles: [],
    permissions: ["system.manage"],
    departmentIds: [ids[0]],
    institutionProgramIds: [programId],
    accessScope: "DEPARTMENT",
  };
  try {
    await prisma.departments.createMany({
      data: ids.map((id, index) => ({ id, name: `${search} ${index}` })),
    });
    const owners = await layoutTargetOptions(
      actor,
      programId,
      "DEPARTMENT",
      search,
      1,
      undefined,
      "OWNER",
    );
    assert.deepEqual(
      owners.data.map((item) => item.id),
      [ids[0]],
      "Dropdown must include an owned department even when it has no eligible Sale.",
    );
    const all = await layoutTargetOptions(
      { ...actor, accessScope: "ALL" },
      programId,
      "DEPARTMENT",
      search,
      1,
      undefined,
      "OWNER",
    );
    assert.deepEqual(new Set(all.data.map((item) => item.id)), new Set(ids));
    const assignments = await layoutTargetOptions(
      actor,
      programId,
      "DEPARTMENT",
      search,
      1,
    );
    assert.equal(
      assignments.data.length,
      0,
      "Owner lookup must not loosen assignment eligibility.",
    );
    await assert.rejects(
      () =>
        createLayout(
          { ...actor, accessScope: "ALL" },
          programId,
          randomUUID(),
          { name: "Owner fixture", visibleFields: ["fullName"], targets: [] },
        ),
      /Phòng ban sở hữu mẫu không tồn tại/,
    );
    await assert.rejects(
      () =>
        layoutTargetOptions(
          { ...actor, permissions: [] },
          programId,
          "DEPARTMENT",
          search,
          1,
          undefined,
          "OWNER",
        ),
      /quyền/,
    );
    console.log(
      "PASS owner dropdown: empty department available, scope enforced, assignment eligibility preserved",
    );
  } finally {
    await prisma.departments.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
