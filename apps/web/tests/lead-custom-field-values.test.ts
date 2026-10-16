import assert from "node:assert/strict";
import test from "node:test";
import { formatLeadCustomFieldValue, isLeadCustomFieldFileValue, isLeadCustomFieldStringArray } from "../src/modules/leads/lead-custom-field.helpers";
import type { LeadCustomField, LeadCustomFieldFileValue } from "../src/modules/leads/lead.types";

const field: LeadCustomField = {
  id: "fixture", code: "fixture", name: "Trường kiểm thử", description: null,
  group: { id: "fixture", key: "fixture", label: "Kiểm thử", description: null, isSystem: false, displayOrder: 0 },
  dataType: "FILE", isRequired: false, isSensitive: false, displayOrder: 0,
  options: [{ code: "a", label: "Lựa chọn A", isActive: true, displayOrder: 0 }],
  validationRules: null, value: null, canView: true, canEdit: true,
};
const file: LeadCustomFieldFileValue = { name: "Hồ sơ.pdf", size: 1200, type: "application/pdf", lastModified: 1, url: "https://example.test/file" };

test("custom field formatter keeps file names and metadata separate from selection codes", () => {
  assert.equal(formatLeadCustomFieldValue(field, file), "Hồ sơ.pdf");
  assert.equal(formatLeadCustomFieldValue(field, [file]), "Hồ sơ.pdf");
  assert.equal(formatLeadCustomFieldValue(field, ["a"]), "Chưa cập nhật");
  assert.equal(formatLeadCustomFieldValue({ ...field, dataType: "MULTI_SELECT" }, ["a", "legacy"]), "Lựa chọn A, legacy");
  assert.equal(formatLeadCustomFieldValue({ ...field, dataType: "MULTI_SELECT" }, [file]), "Chưa cập nhật");
  assert.equal(formatLeadCustomFieldValue(field, null), "Chưa cập nhật");
  assert.equal(formatLeadCustomFieldValue(field, []), "Chưa cập nhật");
  assert.equal(file.url, "https://example.test/file");
});

test("guards reject incomplete files, mixed arrays and non-string selection values", () => {
  assert.equal(isLeadCustomFieldFileValue(file), true);
  for (const invalid of [null, [], "file", { name: "file.pdf" }, { ...file, size: "1200" }]) assert.equal(isLeadCustomFieldFileValue(invalid), false);
  assert.equal(isLeadCustomFieldStringArray(["a", "b"]), true);
  assert.equal(isLeadCustomFieldStringArray([]), true);
  for (const invalid of [[file], ["a", file], [1], "a", null]) assert.equal(isLeadCustomFieldStringArray(invalid), false);
});

test("province lookup accepts a known code and preserves an unknown legacy code", () => {
  assert.equal(formatLeadCustomFieldValue({ ...field, dataType: "PROVINCE" }, "cao_bang"), "Cao Bằng");
  assert.equal(formatLeadCustomFieldValue({ ...field, dataType: "PROVINCE" }, "legacy-province"), "legacy-province");
});
