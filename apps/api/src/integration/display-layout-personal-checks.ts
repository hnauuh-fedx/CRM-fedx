import assert from "node:assert/strict";
import type { AuthUser } from "../modules/auth/auth.types";
import {
  createLayout,
  effectiveLayout,
  previewLayout,
  publishLayout,
  restoreLayout,
  saveLayout,
} from "../modules/display-layouts/display-layout.service";
import {
  savePersonalLayout,
  resetPersonalLayout,
} from "../modules/display-layouts/personal-display-layout.service";

export async function checkPersonalLayouts(
  actor: AuthUser,
  sale: AuthUser,
  other: AuthUser,
  programId: string,
  otherProgram: string,
) {
  const policy = { visibility: true, order: true, pinning: true, widths: true };
  let template = await createLayout(actor, programId, null, {
    name: "Mẫu giai đoạn hai",
    visibleFields: ["fullName", "phone", "source"],
    targets: [{ type: "USER", id: sale.id }],
    pinnedFields: ["fullName"],
    columnWidths: { fullName: 260 },
    personalization: policy,
  });
  const publish = async () => {
    const preview = await previewLayout(
      actor,
      programId,
      template.id,
      template.revision,
    );
    template = await publishLayout(
      actor,
      programId,
      template.id,
      template.revision,
      preview.assignmentRevision,
    );
  };
  await publish();
  const base = await effectiveLayout(sale, programId);
  assert.deepEqual(base.pinnedFields, ["fullName"]);
  assert.deepEqual(base.columnWidths, { fullName: 260 });
  const input = {
    revision: 0,
    baseTemplateId: template.id,
    baseVersion: template.publishedVersion,
    presentation: {
      visibleFields: ["phone", "fullName"],
      pinnedFields: ["phone"],
      columnWidths: { phone: 180, fullName: 300 },
    },
  };
  const custom = await savePersonalLayout(sale, programId, input);
  assert.equal(custom.personalized, true);
  assert.deepEqual(custom.visibleFields, ["phone", "fullName"]);
  assert.deepEqual(custom.pinnedFields, ["phone"]);
  assert.deepEqual(custom.columnWidths, { phone: 180, fullName: 300 });
  assert.equal((await effectiveLayout(other, programId)).personalized, false);
  await assert.rejects(
    savePersonalLayout(sale, programId, input),
    /đã thay đổi/,
  );
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...input,
      revision: custom.personalRevision,
      presentation: {
        ...input.presentation,
        visibleFields: ["fullName", "email"],
      },
    }),
    /ngoài mẫu/,
  );
  await assert.rejects(
    savePersonalLayout({ ...sale, accessScope: "READ_ONLY" }, programId, input),
    /quyền/,
  );
  await assert.rejects(savePersonalLayout(sale, otherProgram, input), /quyền/);
  const inherited = await resetPersonalLayout(
    sale,
    programId,
    custom.personalRevision,
  );
  assert.equal(inherited.personalized, false);
  assert.deepEqual(inherited.pinnedFields, ["fullName"]);
  assert.deepEqual(inherited.columnWidths, { fullName: 260 });
  await assert.rejects(
    resetPersonalLayout(sale, programId, custom.personalRevision),
    /đã thay đổi/,
  );
  const restored = await savePersonalLayout(sale, programId, {
    ...input,
    revision: inherited.personalRevision,
  });
  template = await saveLayout(
    actor,
    programId,
    template.id,
    template.revision,
    {
      ...template.draft,
      personalization: {
        visibility: false,
        order: false,
        pinning: false,
        widths: false,
      },
      columnWidths: { fullName: 280 },
    },
  );
  await publish();
  const revoked = await effectiveLayout(sale, programId);
  assert.equal(revoked.personalized, false);
  assert.equal(revoked.personalizationStale, true);
  assert.deepEqual(revoked.columnWidths, { fullName: 280 });
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...input,
      revision: restored.personalRevision,
    }),
    /đã thay đổi/,
  );
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...input,
      revision: restored.personalRevision,
      baseVersion: template.publishedVersion,
    }),
    /chưa cho phép/,
  );
  template = await restoreLayout(
    actor,
    programId,
    template.id,
    template.revision,
    1,
  );
  assert.deepEqual(template.draft.pinnedFields, ["fullName"]);
  assert.deepEqual(template.draft.columnWidths, { fullName: 260 });
  assert.deepEqual(template.draft.personalization, policy);
  await publish();
  assert.equal(
    (await effectiveLayout(sale, programId)).personalized,
    false,
    "Khôi phục không làm sống lại tùy chỉnh cũ.",
  );
  // Only visibility is allowed: changing order, pinning or widths must fail independently.
  template = await saveLayout(
    actor,
    programId,
    template.id,
    template.revision,
    {
      ...template.draft,
      personalization: {
        visibility: true,
        order: false,
        pinning: false,
        widths: false,
      },
    },
  );
  await publish();
  const restricted = await effectiveLayout(sale, programId);
  const restrictedInput = {
    revision: restricted.personalRevision,
    baseTemplateId: template.id,
    baseVersion: template.publishedVersion,
    presentation: {
      visibleFields: ["fullName", "phone"],
      pinnedFields: ["fullName"],
      columnWidths: { fullName: 260 },
    },
  };
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...restrictedInput,
      presentation: {
        ...restrictedInput.presentation,
        pinnedFields: ["phone"],
      },
    }),
    /cột ghim/,
  );
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...restrictedInput,
      presentation: {
        ...restrictedInput.presentation,
        visibleFields: ["phone", "fullName"],
      },
    }),
    /thứ tự/,
  );
  await assert.rejects(
    savePersonalLayout(sale, programId, {
      ...restrictedInput,
      presentation: {
        ...restrictedInput.presentation,
        columnWidths: { fullName: 300 },
      },
    }),
    /độ rộng/,
  );
  const races = await Promise.allSettled([
    savePersonalLayout(sale, programId, restrictedInput),
    savePersonalLayout(sale, programId, restrictedInput),
  ]);
  assert.equal(
    races.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    races.filter((result) => result.status === "rejected").length,
    1,
  );
  console.log(
    "PASS personal layouts: policy, columns, widths, pinning, ownership, reset, publication, restore, concurrency",
  );
}
