import assert from "node:assert/strict";
import test from "node:test";
import { collectMissingFields, isFilledValue, requiredStudentConversionFieldKeys } from "./student-conversion-requirements";

test("core identity fields and input-required fields are always required for conversion", () => {
  const keys = requiredStudentConversionFieldKeys({ email: true, cccd: false }, { dateOfBirth: true, cccd: true });
  assert.ok(["fullName", "phone", "sourceId"].every((key) => keys.includes(key)));
  assert.ok(keys.includes("email"));
  assert.ok(keys.includes("dateOfBirth"));
  assert.ok(keys.includes("cccd"));
  assert.ok(!keys.includes("religion"));
});

test("unchecking the conversion flag keeps only input-required fields", () => {
  const keys = requiredStudentConversionFieldKeys({}, { cccd: false });
  assert.deepEqual(keys, ["fullName", "phone", "sourceId"]);
});

test("empty strings, blank text, empty arrays and missing values count as missing", () => {
  assert.equal(isFilledValue(null), false);
  assert.equal(isFilledValue(undefined), false);
  assert.equal(isFilledValue("   "), false);
  assert.equal(isFilledValue([]), false);
  assert.equal(isFilledValue(0), true);
  assert.equal(isFilledValue(false), true);
  assert.equal(isFilledValue(new Date()), true);
});

test("missing fields are reported with their Vietnamese labels in catalog order", () => {
  const missing = collectMissingFields(["cccd", "fullName", "dateOfBirth"], { fullName: "Nguyễn Văn A", cccd: "", dateOfBirth: null });
  assert.deepEqual(missing, [
    { key: "dateOfBirth", label: "Ngày sinh" },
    { key: "cccd", label: "CCCD" },
  ]);
});
