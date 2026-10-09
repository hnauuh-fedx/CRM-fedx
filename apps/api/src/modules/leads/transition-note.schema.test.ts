import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { parseTransitionNoteTemplates, transitionNoteTargetSchema, transitionNoteTemplatesSchema } from "./transition-note.schema";

describe("transition note configuration validation", () => {
  it("accepts a stage UUID or Fail, never a hardcoded stage name", () => {
    assert.equal(transitionNoteTargetSchema.safeParse(randomUUID()).success, true);
    assert.equal(transitionNoteTargetSchema.safeParse("FAIL").success, true);
    assert.equal(transitionNoteTargetSchema.safeParse("L3").success, false);
  });

  it("trims content and preserves configured order and activation", () => {
    const first = { id: randomUUID(), content: "  Còn phân vân học phí  ", isActive: true };
    const second = { id: randomUUID(), content: "Hẹn gọi lại", isActive: false };
    assert.deepEqual(parseTransitionNoteTemplates(JSON.stringify([first, second])), [{ ...first, content: "Còn phân vân học phí" }, second]);
  });

  it("rejects blank, oversized, duplicate and excessive templates", () => {
    const template = { id: randomUUID(), content: "Ghi chú", isActive: true };
    assert.equal(transitionNoteTemplatesSchema.safeParse([{ ...template, content: "  " }]).success, false);
    assert.equal(transitionNoteTemplatesSchema.safeParse([{ ...template, content: "a".repeat(1801) }]).success, false);
    assert.equal(transitionNoteTemplatesSchema.safeParse([template, template]).success, false);
    assert.equal(transitionNoteTemplatesSchema.safeParse(Array.from({ length: 101 }, () => ({ ...template, id: randomUUID() }))).success, false);
  });

  it("handles missing and malformed stored settings safely", () => {
    for (const value of [null, "", "{broken", "{}", "null", '[{"content":"missing id"}]']) assert.deepEqual(parseTransitionNoteTemplates(value), []);
    assert.deepEqual(transitionNoteTemplatesSchema.parse([]), []);
  });
});
