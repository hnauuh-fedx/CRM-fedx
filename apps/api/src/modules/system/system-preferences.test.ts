import assert from "node:assert/strict";
import test from "node:test";
import { defaultSystemPreferences, isStructuredSetting, isTechnicalSetting, preferenceSchemas, readPreference, selectInboundFields, simulatePreferences } from "@admission-crm/shared/system-preferences";

test("compatibility defaults preserve source behavior and do not enable SLA", () => {
  assert.equal(readPreference("intake", null).bizflyDuplicate, "legacy");
  assert.equal(readPreference("intake", "broken json").blankValues, "legacy");
  assert.equal(readPreference("sla", null).enabled, false);
  const first = readPreference("exports", null); first.columns.push("email");
  assert.ok(!readPreference("exports", null).columns.includes("email"));
});
test("validators reject contradictory, unknown and out-of-range settings", () => {
  assert.equal(preferenceSchemas.assignment.safeParse({ enabled: true, preserveAssigned: false }).success, false);
  assert.equal(preferenceSchemas.reminders.safeParse({ warnOverlap: true, overdueHours: 0 }).success, false);
  assert.equal(preferenceSchemas.sla.safeParse({ enabled: true, firstContactMinutes: 4 }).success, false);
  assert.equal(preferenceSchemas.exports.safeParse({ format: "xlsx", columns: ["cccd"] }).success, false);
  assert.equal(preferenceSchemas.exports.safeParse({ format: "xlsx", columns: ["phone", "phone"] }).success, false);
  assert.equal(preferenceSchemas.intake.safeParse({ ...defaultSystemPreferences.intake, arbitrary: true }).success, false);
});
test("manual creator exceptions default to empty for legacy settings and validate account IDs", () => {
  const legacy = { enabled: false, preserveAssigned: true, sources: ["manual"] };
  const restored = readPreference("assignment", JSON.stringify({ value: legacy }));
  assert.deepEqual(restored.manualUnassignedCreatorIds, []);
  assert.equal(restored.enabled, false);
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(preferenceSchemas.assignment.safeParse({ ...legacy, manualUnassignedCreatorIds: [id] }).success, true);
  assert.equal(preferenceSchemas.assignment.safeParse({ ...legacy, manualUnassignedCreatorIds: [id, id] }).success, false);
  assert.equal(preferenceSchemas.assignment.safeParse({ ...legacy, manualUnassignedCreatorIds: ["DIRECTOR"] }).success, false);
});
test("preserving blanks keeps false/zero while excluding empty text and missing fields", () => {
  const input = { note: " ", email: "", score: 0, enabled: false, name: "An", absent: undefined };
  assert.deepEqual([...selectInboundFields(Object.keys(input) as Array<keyof typeof input>, input, true)], ["score", "enabled", "name"]);
});
test("simulation agrees with intake policy and historical import assignment behavior", () => {
  const preferences = structuredClone(defaultSystemPreferences);
  preferences.intake.bizflyDuplicate = "skip";
  const simulation = simulatePreferences(preferences, "bizfly", true);
  assert.equal(simulation.action, "Bỏ qua dòng trùng");
  assert.ok(simulation.assignment.includes("không chạy phân công"));
  assert.equal(simulatePreferences(preferences, "excel", false).action, "Tạo lead mới");
});
test("technical settings are separated from editable business settings", () => {
  assert.ok(isTechnicalSetting("migration.example"));
  assert.ok(isTechnicalSetting("mail.password", "secret"));
  assert.ok(isStructuredSetting("form_field_requirements.LEAD"));
  assert.ok(isStructuredSetting("lead_transition_notes.FAIL"));
});
