import assert from "node:assert/strict";
import test from "node:test";

import { isCustomerListFilterCondition } from "../customer-lists/customer-list-filter";
import { getLeadFieldFilterDefinition, leadFieldFilterDefinitions, leadFieldWhere } from "./lead-field-filter";

test("every Lead form field except the program is filterable", () => {
  const keys = leadFieldFilterDefinitions.map((field) => field.key);
  for (const key of ["highSchoolName", "graduationYear", "province", "relative1Job", "decisionSignedDate", "tags", "admissionStatusId"]) {
    assert.ok(keys.includes(key), key);
  }
  assert.ok(!keys.includes("institutionProgramId"));
  assert.equal(getLeadFieldFilterDefinition("province")?.isSensitive, true, "address parts follow the Lead detail visibility");
});

test("related-table fields filter through their relation", () => {
  assert.deepEqual(leadFieldWhere("highSchoolName", { type: "text", mode: "contains", value: "THPT" }), {
    student_profiles: { is: { high_school_name: { contains: "THPT", mode: "insensitive" } } },
  });
  assert.deepEqual(leadFieldWhere("province", { type: "text", mode: "equals", value: "Cần Thơ" }, true), {
    NOT: { addresses: { some: { type: "current", province: { equals: "Cần Thơ", mode: "insensitive" } } } },
  });
  assert.deepEqual(leadFieldWhere("relative1FullName", { type: "hasValue" }), {
    relatives: { some: { AND: [{ is_primary: true }, { NOT: { full_name: "" } }] } },
  });
});

test("negated filters on nullable Lead columns keep Leads without a value", () => {
  assert.deepEqual(leadFieldWhere("cccd", { type: "text", mode: "contains", value: "079" }, true), {
    OR: [{ cccd: null }, { NOT: { cccd: { contains: "079", mode: "insensitive" } } }],
  });
});

test("date-only columns compare the local calendar day", () => {
  const where = leadFieldWhere("decisionSignedDate", { type: "range", gte: new Date(2026, 9, 1), lte: new Date(2026, 9, 1, 23, 59, 59) });
  assert.deepEqual(where, {
    admission_profiles: { is: { decision_signed_date: { gte: new Date(Date.UTC(2026, 9, 1)), lte: new Date(Date.UTC(2026, 9, 1)) } } },
  });
});

test("customer list conditions validate catalog fields by type", () => {
  assert.equal(isCustomerListFilterCondition({ field: "graduationYear", operator: "greaterThan", value: "2020" }), true);
  assert.equal(isCustomerListFilterCondition({ field: "graduationYear", operator: "contains", value: "20" }), false);
  assert.equal(isCustomerListFilterCondition({ field: "decisionSignedDate", operator: "on", value: "2026-10-01" }), true);
  assert.equal(isCustomerListFilterCondition({ field: "admissionStatusId", operator: "equals", value: "male" }), false);
  assert.equal(isCustomerListFilterCondition({ field: "tags", operator: "contains", value: "x" }), false);
});
