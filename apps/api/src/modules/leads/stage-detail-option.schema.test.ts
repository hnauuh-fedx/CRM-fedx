import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  appendStageDetailToActivity,
  composeStageDetailContent,
  parseStageDetailOptions,
  resolveStageDetailContent,
  stageDetailOptionsSchema,
  stageDetailSelectionSchema,
  stageDetailTargetSchema,
} from "./stage-detail-option.schema";

const child = (label: string) => ({ id: randomUUID(), label });
const option = (label: string, children: Array<{ id: string; label: string }> = []) => ({ id: randomUUID(), label, children });

describe("stage detail (multi-level field) configuration", () => {
  it("targets a stage UUID or Fail, never a hardcoded stage name", () => {
    assert.equal(stageDetailTargetSchema.safeParse(randomUUID()).success, true);
    assert.equal(stageDetailTargetSchema.safeParse("FAIL").success, true);
    assert.equal(stageDetailTargetSchema.safeParse("L3").success, false);
  });

  it("trims labels and keeps the configured order of both levels", () => {
    const first = option("  Hồ sơ không hợp lệ  ", [child("Sai tên"), child(" Sai nơi sinh ")]);
    const second = option("Sai đối tượng");
    const parsed = parseStageDetailOptions(JSON.stringify([first, second]));
    assert.deepEqual(parsed.map((item) => item.label), ["Hồ sơ không hợp lệ", "Sai đối tượng"]);
    assert.deepEqual(parsed[0].children.map((item) => item.label), ["Sai tên", "Sai nơi sinh"]);
  });

  it("rejects blank labels, ids reused across levels and excessive items", () => {
    const item = option("Nội dung");
    assert.equal(stageDetailOptionsSchema.safeParse([{ ...item, label: "  " }]).success, false);
    assert.equal(stageDetailOptionsSchema.safeParse([item, { ...option("Khác"), id: item.id }]).success, false);
    assert.equal(stageDetailOptionsSchema.safeParse([{ ...item, children: [{ id: item.id, label: "Trùng mã" }] }]).success, false);
    assert.equal(stageDetailOptionsSchema.safeParse(Array.from({ length: 101 }, () => option("A"))).success, false);
    // Level 3 has no children of its own.
    assert.equal(stageDetailOptionsSchema.parse([{ ...item, children: [{ ...child("C"), children: [child("D")] }] }])[0].children[0].hasOwnProperty("children"), false);
  });

  it("handles missing and malformed stored settings safely", () => {
    for (const value of [null, "", "{broken", "{}", "null", '[{"label":"missing id"}]']) assert.deepEqual(parseStageDetailOptions(value), []);
  });

  it("joins level 2 and level 3 with a dash and appends the content to the activity sentence", () => {
    assert.equal(composeStageDetailContent({ label: "Hồ sơ không hợp lệ" }, { label: "Sai tên" }), "Hồ sơ không hợp lệ - Sai tên");
    assert.equal(composeStageDetailContent({ label: "Sai đối tượng" }), "Sai đối tượng");
    assert.equal(
      appendStageDetailToActivity("Chuyển lead sang giai đoạn TV chương trình (L2)*.", "Đã liên hệ chăm sóc lại để giải đáp thắc mắc"),
      "Chuyển lead sang giai đoạn TV chương trình (L2)* | Đã liên hệ chăm sóc lại để giải đáp thắc mắc",
    );
    assert.equal(appendStageDetailToActivity("Chuyển lead sang giai đoạn L2.", undefined), "Chuyển lead sang giai đoạn L2.");
  });

  it("resolves a selection only when it still matches the configuration", () => {
    const wrongName = child("Sai tên");
    const invalidProfile = option("Hồ sơ không hợp lệ", [wrongName]);
    const options = [invalidProfile, option("Sai đối tượng")];
    assert.equal(resolveStageDetailContent(options, { optionId: invalidProfile.id }), "Hồ sơ không hợp lệ");
    assert.equal(resolveStageDetailContent(options, { optionId: invalidProfile.id, childOptionId: wrongName.id }), "Hồ sơ không hợp lệ - Sai tên");
    assert.equal(resolveStageDetailContent(options, { optionId: invalidProfile.id, content: "Sai tên, cần bổ sung CCCD" }), "Sai tên, cần bổ sung CCCD");
    assert.equal(resolveStageDetailContent(options, { optionId: randomUUID() }), null);
    assert.equal(resolveStageDetailContent(options, { optionId: options[1].id, childOptionId: wrongName.id }), null);
  });

  it("validates the selection sent by the client", () => {
    assert.equal(stageDetailSelectionSchema.safeParse({ optionId: randomUUID() }).success, true);
    assert.equal(stageDetailSelectionSchema.safeParse({ optionId: randomUUID(), content: "  " }).success, false);
    assert.equal(stageDetailSelectionSchema.safeParse({ optionId: randomUUID(), content: "a".repeat(1801) }).success, false);
    assert.equal(stageDetailSelectionSchema.safeParse({ childOptionId: randomUUID() }).success, false);
  });
});
