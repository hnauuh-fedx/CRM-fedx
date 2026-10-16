import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMarketingFormOptions, readMarketingFormQuestionDescription, validateMarketingFormQuestionDescriptions, validateMarketingFormConfig, type MarketingFormConfigField } from "@admission-crm/shared/marketing-form-config";
import { readMarketingFormRatingMax, validateMarketingFormRatings, isMarketingFormRatingValueAllowed } from "@admission-crm/shared/marketing-form-config";
import { validateMarketingFormOther, isMarketingFormOtherAnswerValid, marketingFormOtherSentinel } from "@admission-crm/shared/marketing-form-config";
const question = (overrides: Partial<MarketingFormConfigField> = {}): MarketingFormConfigField => ({ fieldKey: "interest", fieldType: "select", options: ["Lựa chọn 1"], ...overrides });
test("Other answers are explicit bounded text, never arbitrary option IDs or CRM mappings", () => {
  const rules = { allowOther: true };
  assert.ok(isMarketingFormOtherAnswerValid({ kind: "other", text: "Lựa chọn riêng" }, rules));
  for (const answer of [{ kind: "other", text: " " }, { kind: "other", text: "a".repeat(1001) }, { kind: "other", text: 5 }, { kind: "other", text: "Valid", extra: true }, "custom", ["custom"]]) assert.equal(isMarketingFormOtherAnswerValid(answer, rules), false);
  assert.equal(isMarketingFormOtherAnswerValid({ kind: "other", text: "Valid" }, {}), false);
  assert.deepEqual(validateMarketingFormOther([question({ validationRules: rules })]), []);
  for (const field of [question({ fieldType: "multi_select", validationRules: rules }), question({ crmMappingField: "major_id", validationRules: rules }), question({ defaultValue: marketingFormOtherSentinel, validationRules: rules }), question({ validationRules: { allowOther: null } })]) assert.ok(validateMarketingFormOther([field]).length);
  const parent = question({ validationRules: rules });
  assert.ok(validateMarketingFormOther([parent, question({ fieldKey: "child", validationRules: { visibility: { parentFieldKey: parent.fieldKey } } })]).length);
});
test("rating scales, defaults and answers are bounded integers and cannot map into CRM", () => {
  assert.equal(readMarketingFormRatingMax({}), 5);
  for (const max of [2, 5, 10]) {
    const rules = { ratingMax: max };
    assert.deepEqual(validateMarketingFormRatings([question({ fieldType: "rating", validationRules: rules, defaultValue: String(max) })]), []);
    for (const value of [1, max, "1", String(max), "", null]) assert.ok(isMarketingFormRatingValueAllowed(value, rules));
    for (const value of [0, max + 1, -1, 1.5, "01", "1e0", " 1", true, [], {}, "NaN"]) assert.equal(isMarketingFormRatingValueAllowed(value, rules), false);
  }
  for (const ratingMax of [null, "5", 0, 11, 2.5]) assert.ok(validateMarketingFormRatings([question({ fieldType: "rating", validationRules: { ratingMax } })]).length);
  assert.ok(validateMarketingFormRatings([question({ fieldType: "rating", crmMappingField: "note" })]).some(issue => issue.path[2] === "crmMappingField"));
  assert.ok(validateMarketingFormConfig([question({ fieldType: "rating", defaultValue: "6" })], "survey").some(issue => issue.path[2] === "defaultValue"));
});
test("question descriptions accept plain text only with a bounded length, including drafts", () => {
  assert.equal(readMarketingFormQuestionDescription({ questionDescription: "  Hướng dẫn\nDòng hai  " }), "Hướng dẫn\nDòng hai");
  assert.deepEqual(validateMarketingFormQuestionDescriptions([question(), question({ validationRules: { questionDescription: "a".repeat(1000) } })]), []);
  for (const value of [null, 3, {}, [], "a".repeat(1001)]) {
    const fields = [question({ validationRules: { questionDescription: value } })];
    assert.deepEqual(validateMarketingFormQuestionDescriptions(fields)[0].path, ["fields", 0, "validationRules", "questionDescription"]);
    assert.ok(validateMarketingFormConfig(fields, "survey").length);
    assert.equal(readMarketingFormQuestionDescription(fields[0].validationRules), "");
  }
});
test("legacy option adapter preserves values and typed labels", () => {
  assert.deepEqual(normalizeMarketingFormOptions(["Cũ", { value: "uuid", label: "Ngành" }]), [{ value: "Cũ", label: "Cũ" }, { value: "uuid", label: "Ngành" }]);
});
test("survey field names never infer CRM mappings", () => {
  assert.deepEqual(validateMarketingFormConfig([question({ fieldKey: "major_id" })], "survey"), []);
  assert.ok(validateMarketingFormConfig([question()], "lead_form").some((issue) => issue.path.length === 1));
});
test("empty survey and empty choice list cannot publish", () => {
  assert.ok(validateMarketingFormConfig([], "survey").length);
  assert.ok(validateMarketingFormConfig([question({ options: [], crmMappingField: "major_id" })], "survey").some((issue) => issue.path[2] === "options"));
  assert.ok(validateMarketingFormConfig([question({ isActive: false })], "survey").length);
});
test("duplicate mappings, conflicting columns and multiple answers cannot overwrite scalar CRM", () => {
  const issues = validateMarketingFormConfig([question({ fieldKey: "a", crmMappingField: "note" }), question({ fieldKey: "b", crmMappingField: "note", leadField: "phone", fieldType: "multi_select" })], "survey");
  assert.equal(issues.filter((issue) => issue.path[2] === "crmMappingField").length, 3);
});
test("duplicate options and missing default rejected", () => {
  const issues = validateMarketingFormConfig([question({ options: ["a", "a"], defaultValue: "b" })], "survey");
  assert.deepEqual(issues.map((issue) => issue.path[2]), ["options", "defaultValue"]);
});
test("dependency validates active parent and answer IDs, including cycles", () => {
  const dependency = (parentFieldKey: string) => ({ dependency: { parentFieldKey, optionMap: { a: ["a"] } } });
  assert.ok(validateMarketingFormConfig([question({ validationRules: dependency("missing") })], "survey").length);
  const fields = [question({ fieldKey: "a", options: ["a"], validationRules: dependency("b") }), question({ fieldKey: "b", options: ["a"], validationRules: dependency("a") })];
  assert.equal(validateMarketingFormConfig(fields, "survey").filter((issue) => issue.message.includes("vòng lặp")).length, 2);
  assert.ok(validateMarketingFormConfig([question({ fieldKey: "a" }), question({ fieldKey: "b", validationRules: dependency("a") })], "survey").some((issue) => issue.message.includes("không khớp")));
});
