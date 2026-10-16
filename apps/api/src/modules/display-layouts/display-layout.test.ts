import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseLayoutTarget,
  layoutIssues,
  leadDisplayFields,
  moveDisplayField,
  normalizeVisibleFields,
} from "@admission-crm/shared/display-layout";
import {
  assertLayoutManager,
  layoutDraftSchema,
} from "./display-layout.validation";
import type { AuthUser } from "../auth/auth.types";
import {
  personalPresentationIssues,
  normalizePresentation,
  presentationIssues,
  lockedPersonalization,
} from "@admission-crm/shared/display-layout";
import { personalLayoutWriteSchema } from "./display-layout.validation";

test("ghim và độ rộng kiểm tra biên và cột ẩn", () => {
  const base = {
    visibleFields: ["fullName", "phone"],
    pinnedFields: ["fullName"],
    columnWidths: { fullName: 260 },
  };
  assert.deepEqual(presentationIssues(base, base.visibleFields), []);
  assert.ok(
    presentationIssues({ ...base, pinnedFields: ["email"] }, base.visibleFields)
      .length,
  );
  assert.ok(
    presentationIssues(
      { ...base, columnWidths: { phone: 119 } },
      base.visibleFields,
    ).length,
  );
  assert.ok(
    presentationIssues(
      { ...base, columnWidths: { phone: 601 } },
      base.visibleFields,
    ).length,
  );
  assert.deepEqual(
    normalizePresentation({
      ...base,
      pinnedFields: ["retired", "phone"],
      columnWidths: { retired: 200, phone: 180 },
    }),
    {
      visibleFields: base.visibleFields,
      pinnedFields: ["phone"],
      columnWidths: { phone: 180 },
    },
  );
});
test("tùy chỉnh cá nhân chỉ dùng cột và từng thao tác được cho phép", () => {
  const base = {
    visibleFields: ["fullName", "phone", "source"],
    pinnedFields: ["fullName"],
    columnWidths: {},
  };
  const candidate = {
    visibleFields: ["phone", "fullName"],
    pinnedFields: ["phone"],
    columnWidths: { phone: 160 },
  };
  assert.equal(
    personalPresentationIssues(candidate, base, lockedPersonalization).length,
    4,
  );
  assert.deepEqual(
    personalPresentationIssues(candidate, base, {
      visibility: true,
      order: true,
      pinning: true,
      widths: true,
    }),
    [],
  );
  assert.ok(
    personalPresentationIssues(
      { ...candidate, visibleFields: ["fullName", "email"] },
      base,
      { visibility: true, order: true, pinning: true, widths: true },
    ).length,
  );
  assert.equal(
    personalLayoutWriteSchema.safeParse({
      revision: 0,
      baseTemplateId: "00000000-0000-4000-8000-000000000001",
      baseVersion: 1,
      presentation: candidate,
      userId: "another-user",
    }).success,
    false,
  );
});

test("mẫu riêng ưu tiên phòng ban, mẫu chung; nhiều phòng ban không chọn ngẫu nhiên", () => {
  const targets = [
    { type: "DEFAULT", id: "default" },
    { type: "DEPARTMENT", id: "a" },
    { type: "USER", id: "sale" },
  ] as const;
  assert.equal(
    chooseLayoutTarget("sale", ["a", "b"], [...targets])?.type,
    "USER",
  );
  assert.equal(
    chooseLayoutTarget("other", ["a"], [...targets])?.type,
    "DEPARTMENT",
  );
  assert.equal(
    chooseLayoutTarget("other", ["a", "b"], [...targets])?.type,
    "DEFAULT",
  );
  assert.equal(chooseLayoutTarget("other", [], [])?.type, undefined);
});
test("cấu hình cũ bỏ trường ngừng dùng, giữ khóa, trường mới không tự xuất hiện", () => {
  assert.deepEqual(
    normalizeVisibleFields(["phone", "retired", "phone"], leadDisplayFields),
    ["fullName", "phone"],
  );
  assert.deepEqual(
    normalizeVisibleFields(null, leadDisplayFields),
    leadDisplayFields.map((f) => f.key),
  );
});
test("kiểm tra trường trùng, khóa, mã lạ và kiểu đối tượng áp dụng", () => {
  assert.ok(
    layoutIssues(
      { name: "Mẫu", visibleFields: ["phone", "phone", "secret"], targets: [] },
      leadDisplayFields,
    ).length >= 3,
  );
  assert.equal(
    layoutDraftSchema.safeParse({
      name: "Mẫu",
      visibleFields: ["fullName"],
      targets: [{ type: "DEFAULT", id: "wrong" }],
    }).success,
    false,
  );
  assert.equal(
    layoutDraftSchema.safeParse({
      name: "Mẫu",
      visibleFields: ["fullName"],
      targets: [],
    }).success,
    true,
  );
});
test("kéo giữa hai danh sách không nhân đôi và giữ vị trí mong muốn", () => {
  assert.deepEqual(
    moveDisplayField(["fullName", "phone", "source"], "source", "phone"),
    ["fullName", "source", "phone"],
  );
  assert.deepEqual(moveDisplayField(["fullName"], "phone"), [
    "fullName",
    "phone",
  ]);
});
test("quyền và phạm vi phải cùng hợp lệ", () => {
  const manager = {
    permissions: ["system.manage"],
    accessScope: "DEPARTMENT",
    departmentIds: ["a"],
  } as AuthUser;
  assert.doesNotThrow(() => assertLayoutManager(manager, "a"));
  assert.throws(() => assertLayoutManager(manager, "b"));
  assert.throws(() => assertLayoutManager(manager, null));
  assert.throws(() =>
    assertLayoutManager(
      { ...manager, accessScope: "ALL", permissions: [] },
      null,
    ),
  );
  assert.throws(() =>
    assertLayoutManager({ ...manager, accessScope: "READ_ONLY" }, "a"),
  );
});
