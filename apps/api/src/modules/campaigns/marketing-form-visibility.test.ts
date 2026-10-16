import assert from "node:assert/strict";
import { test } from "node:test";
import { readMarketingFormVisibility, resolveMarketingFormVisibleKeys, stripHiddenMarketingFormAnswers, validateMarketingFormVisibility } from "@admission-crm/shared/marketing-form-visibility";
import type { MarketingFormConfigField } from "@admission-crm/shared/marketing-form-config";
const parent = { fieldKey: "parent", fieldType: "select", options: [{ value: "yes", label: "Có" }, { value: "no", label: "Không" }] };
const child = { fieldKey: "child", fieldType: "text", validationRules: { visibility: { parentFieldKey: "parent", operator: "equals", value: "yes" } } };
test("visibility compares stored choice IDs, ignores empty negative comparison, and supports contains/empty operators", () => {
  assert.deepEqual(validateMarketingFormVisibility([parent, child]), []);
  assert.equal(resolveMarketingFormVisibleKeys([parent, child], { parent: "yes" }).has("child"), true);
  assert.equal(resolveMarketingFormVisibleKeys([parent, child], { parent: "Có" }).has("child"), false);
  for (const [operator, value, expected] of [["not_equals", "", false], ["not_equals", "no", true], ["is_empty", "", true], ["is_not_empty", "no", true], ["contains", ["yes", "no"], true]] as const) {
    assert.equal(resolveMarketingFormVisibleKeys([parent, { ...child, validationRules: { visibility: { parentFieldKey: "parent", operator, value: "yes" } } }], { parent: value }).has("child"), expected);
  }
});
test("invalid operators/parents/value types, choice IDs and mixed dependency cycles are rejected", () => {
  for (const visibility of [null, {}, { parentFieldKey: "parent", operator: "eval", value: "yes" }, { parentFieldKey: "parent", operator: "equals", value: [] }, { parentFieldKey: "missing", operator: "is_empty" }, { parentFieldKey: "child", operator: "is_empty" }, { parentFieldKey: "parent", operator: "equals", value: "Có" }]) {
    assert.ok(validateMarketingFormVisibility([parent, { ...child, validationRules: { visibility } }]).length);
  }
  assert.throws(() => readMarketingFormVisibility({ visibility: { parentFieldKey: "parent", operator: "equals", value: "x".repeat(1001) } }));
  const loop = [{ ...parent, validationRules: { dependency: { parentFieldKey: "child" } } }, child];
  assert.ok(validateMarketingFormVisibility(loop).some(issue => issue.message.includes("vòng lặp")));
  assert.ok(validateMarketingFormVisibility([{ ...parent, fieldType: "file" }, child]).length);
});
test("hidden ancestors cannot activate children via forged answers; raw payload and system fields are sanitized", () => {
  const grandchild = { fieldKey: "grand", fieldType: "text", validationRules: { visibility: { parentFieldKey: "child", operator: "is_empty" } } };
  const dependent = { fieldKey: "dependent", fieldType: "select", validationRules: { dependency: { parentFieldKey: "child" } } };
  const fields: MarketingFormConfigField[] = [grandchild, dependent, child, parent];
  const payload = { parent: "no", child: "forged", grand: "stale", dependent: "stale", utm_source: "fixture" };
  assert.deepEqual([...resolveMarketingFormVisibleKeys(fields, payload)], ["parent"]);
  assert.deepEqual(stripHiddenMarketingFormAnswers(fields, payload), { parent: "no", utm_source: "fixture" });
  assert.equal(payload.child, "forged", "Input is not mutated.");
  assert.deepEqual(stripHiddenMarketingFormAnswers([parent], { parent: "yes" }), { parent: "yes" });
});
test("conditional contact mapping cannot publish a Lead form, but survey-only may use it", () => {
  const contact = { ...child, crmMappingField: "phone" };
  assert.ok(validateMarketingFormVisibility([parent, contact], "lead_form").length);
  assert.deepEqual(validateMarketingFormVisibility([parent, contact], "survey"), []);
  assert.ok(validateMarketingFormVisibility([{ ...parent, fieldType: "checkbox" }, child]).length);
  assert.ok(validateMarketingFormVisibility([parent, child, { fieldKey: "contact", fieldType: "phone", crmMappingField: "phone", validationRules: { dependency: { parentFieldKey: "child" } } }], "lead_form").some(issue => issue.message.includes("phụ thuộc")));
});
