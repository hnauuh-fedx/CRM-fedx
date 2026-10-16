import assert from "node:assert/strict";
import type { AuthUser } from "../modules/auth/auth.types";
import type {
  DisplayLayout,
  LayoutScreen,
} from "@admission-crm/shared/display-layout";
import {
  createLayout,
  effectiveLayout,
  listLayouts,
  saveLayout,
  restoreLayout,
} from "../modules/display-layouts/display-layout.service";

export async function checkLayoutScreens(
  actor: AuthUser,
  sale: AuthUser,
  programId: string,
  publish: (item: DisplayLayout) => Promise<DisplayLayout>,
) {
  const beforeList = await effectiveLayout(sale, programId);
  const detail = await publish(
    await createLayout(
      actor,
      programId,
      null,
      {
        name: "[TEST] Chi tiết",
        visibleFields: ["email", "fullName", "sourceId"],
        targets: [{ type: "DEFAULT", id: "default" }],
      },
      undefined,
      "LEAD_DETAIL",
    ),
  );
  const form = await publish(
    await createLayout(
      actor,
      programId,
      null,
      {
        name: "[TEST] Biểu mẫu",
        visibleFields: [
          "sourceId",
          "phone",
          "fullName",
          "institutionProgramId",
        ],
        targets: [{ type: "DEFAULT", id: "default" }],
      },
      undefined,
      "LEAD_FORM",
    ),
  );
  assert.deepEqual(
    await effectiveLayout(sale, programId),
    beforeList,
    "Publishing other surfaces must preserve list and personal layout.",
  );
  for (const item of [detail, form]) {
    const screen = item.screen as LayoutScreen;
    const effective = await effectiveLayout(sale, programId, undefined, screen);
    assert.equal(effective.baseTemplateId, item.id);
    assert.deepEqual(effective.visibleFields, item.draft.visibleFields);
    assert.ok(Object.values(effective.policy).every((value) => !value));
    const list = await listLayouts(actor, programId, 1, "", screen);
    assert.ok(list.data.every((record) => record.screen === screen));
  }
  await assert.rejects(
    () =>
      saveLayout(actor, programId, form.id, form.revision, {
        ...form.draft,
        visibleFields: ["fullName"],
      }),
    /bắt buộc/,
  );
  await assert.rejects(
    () =>
      saveLayout(actor, programId, detail.id, detail.revision, {
        ...detail.draft,
        visibleFields: ["fullName", "source"],
      }),
    /ngừng sử dụng/,
  );
  await assert.rejects(
    () =>
      saveLayout(actor, programId, form.id, form.revision, {
        ...form.draft,
        personalization: {
          order: true,
          visibility: false,
          pinning: false,
          widths: false,
        },
      }),
    /Chỉ danh sách/,
  );
  const saved = await saveLayout(actor, programId, detail.id, detail.revision, {
    ...detail.draft,
    visibleFields: ["fullName", "phone"],
  });
  const restored = await restoreLayout(
    actor,
    programId,
    detail.id,
    saved.revision,
    1,
  );
  assert.deepEqual(restored.draft.visibleFields, detail.draft.visibleFields);
  const createOnly = { ...sale, permissions: ["lead.create"] };
  assert.equal(
    (await effectiveLayout(createOnly, programId, undefined, "LEAD_FORM"))
      .baseTemplateId,
    form.id,
  );
  await assert.rejects(
    () => effectiveLayout(createOnly, programId, undefined, "LEAD_DETAIL"),
    /quyền/,
  );
  console.log(
    "PASS screen isolation, required fields, contextual validation, restore, create-only authorization",
  );
}
