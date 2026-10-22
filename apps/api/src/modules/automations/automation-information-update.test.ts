import assert from "node:assert/strict";
import test from "node:test";
import { automationInformationUpdatesSchema, validateInformationUpdate, type AutomationWritableField } from "@admission-crm/shared/automation-information-update";
import { validateRegisteredAutomationNode } from "./automation-registry";

const field: AutomationWritableField = {
  reference: "custom:example", key: "example", label: "Thông tin", description: null, dataType: "TEXT",
  groupKey: "custom", groupLabel: "Tùy chỉnh", source: "custom", isSensitive: false, canClear: true, options: [],
};

test("information updates reject empty values, duplicate fields and unsupported operations", () => {
  for (const value of [undefined, null, [], [{ field: "", operation: "set" }],
    [{ field: "x", operation: "set", value: " " }], [{ field: "x", operation: "clear", value: "old" }],
    [{ field: "x", operation: "clear" }, { field: "x", operation: "set", value: "new" }],
    [{ field: "x", operation: "increment", value: 1 }], [{ field: "x", operation: "set", value: {} }]]) {
    assert.equal(automationInformationUpdatesSchema.safeParse(value).success, false);
  }
  for (const value of [false, 0, "text", ["option"]]) assert.equal(automationInformationUpdatesSchema.safeParse([{ field: "x", operation: "set", value }]).success, true);
  assert.equal(automationInformationUpdatesSchema.safeParse([{ field: "x", operation: "clear" }]).success, true);
});

test("typed validation rejects invalid dates, coercion, retired options and clearing required fields", () => {
  const check = (dataType: string, value: unknown, options = field.options) => validateInformationUpdate({ field: field.reference, operation: "set", value: value as never }, { ...field, dataType, options });
  assert.ok(check("DATE", "2026-02-30"));
  assert.equal(check("DATE", "2024-02-29"), undefined);
  assert.ok(check("NUMBER", "0"));
  assert.equal(check("NUMBER", 0), undefined);
  assert.ok(check("BOOLEAN", "false"));
  assert.equal(check("BOOLEAN", false), undefined);
  assert.ok(check("SELECT", "retired", [{ code: "active", label: "Đang dùng" }]));
  assert.ok(check("MULTI_SELECT", ["a", "a"], [{ code: "a", label: "A" }]));
  assert.ok(validateInformationUpdate({ field: field.reference, operation: "clear" }, { ...field, canClear: false }));
  assert.equal(validateInformationUpdate({ field: field.reference, operation: "clear" }, field), undefined);
});

test("information update registry validates malformed payloads without throwing", () => {
  for (const informationUpdates of [undefined, {}, [null], [{ field: "system:note", operation: "set", value: 1n }]]) {
    assert.ok(validateRegisteredAutomationNode({ id: "update", type: "action_update_information", position: { x: 0, y: 0 }, data: { label: "Cập nhật", informationUpdates: informationUpdates as never } }).length);
  }
});

test("extended information types enforce lists, files, datetime and workflow restrictions", () => {
  const check = (dataType: string, value: unknown, validationRules = {}) => validateInformationUpdate({ field: field.reference, operation: "set", value: value as never }, { ...field, dataType, validationRules, options: [{ code: "da_nang", label: "Đà Nẵng" }] });
  assert.equal(check("DATETIME", "2026-10-21T10:30:00+07:00"), undefined);
  assert.ok(check("DATETIME", "2026-10-21T10:30"));
  assert.equal(check("PROVINCE", "da_nang"), undefined);
  assert.ok(check("PROVINCE", "missing"));
  assert.equal(check("STRING_LIST", ["Tag A", "Tag B"]), undefined);
  assert.ok(check("STRING_LIST", ["Tag A", " tag a "]));
  assert.ok(check("STRING_LIST", ["invalid"], { phone: true }));
  assert.ok(check("NUMBER", 2025.5, { integer: true }));
  assert.ok(check("NUMBER", 1.234, { decimalPlaces: 2 }));
  const file = { name: "test.pdf", url: "https://example.test/test.pdf", size: 100, type: "application/pdf", lastModified: 0 };
  assert.equal(check("FILE", [file]), undefined);
  assert.ok(check("FILE", [{ ...file, url: "javascript:alert(1)" }]));
  assert.ok(check("FILE", [{ ...file, url: "data:text/plain,test" }]));
  assert.ok(check("FILE", [file, file]));
  assert.equal(validateInformationUpdate({ field: field.reference, operation: "clear" }, { ...field, readOnlyReason: "Quản lý theo quy trình riêng" }), "Quản lý theo quy trình riêng");
  const updates = Array.from({ length: 79 }, (_, index) => ({ field: `system:${index}`, operation: "set", value: "test" }));
  assert.equal(automationInformationUpdatesSchema.safeParse(updates).success, true);
});
