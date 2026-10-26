import assert from "node:assert/strict";
import test from "node:test";

import { mapWebhookPayload, ProcessFailure, type FieldMetadata } from "./webhook.service";
import { webhookFieldMetadata } from "./webhook.types";

const customSelect: FieldMetadata = {
  key: "custom:channel",
  label: "Kênh",
  type: "select",
  requiredByCrm: false,
  group: "CUSTOM",
  customFieldId: "channel",
  options: ["ONLINE", "OFFLINE"],
  choices: [{ code: "ONLINE", label: "Trực tuyến" }, { code: "OFFLINE", label: "Trực tiếp" }],
};
const customMulti: FieldMetadata = { ...customSelect, key: "custom:topics", label: "Chủ đề", type: "multi_select", customFieldId: "topics" };
const customProvince: FieldMetadata = {
  key: "custom:province",
  label: "Tỉnh thành",
  type: "province",
  requiredByCrm: false,
  group: "CUSTOM",
  customFieldId: "province",
  options: ["tp_ho_chi_minh"],
  choices: [{ code: "tp_ho_chi_minh", label: "Thành phố Hồ Chí Minh" }],
};
const metadata: FieldMetadata[] = [...webhookFieldMetadata, customSelect, customMulti, customProvince];

function mappings(pairs: Record<string, string>) {
  return Object.entries(pairs).map(([incoming, crm]) => ({
    incoming_key: incoming,
    crm_field: crm,
    is_required: false,
    default_value: null,
  }));
}

test("webhook metadata lists every mappable Lead form field grouped by form cluster", () => {
  const keys = webhookFieldMetadata.map((field) => field.key);
  for (const key of ["gender", "majorId", "highSchoolName", "province", "relative1FullName", "companyName", "gclid"]) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  for (const key of ["sourceId", "institutionProgramId", "pipelineStageId", "admissionStatusId"]) {
    assert.ok(!keys.includes(key), `${key} must not be mappable`);
  }
  assert.deepEqual(keys.slice(0, 4), ["fullName", "phone", "source", "sourceGroupUrl"]);
  assert.equal(webhookFieldMetadata.find((field) => field.key === "graduationYear")?.groupLabel, "Học vấn và tốt nghiệp");
});

test("matches option labels and Vietnamese text regardless of case and diacritics", async () => {
  const result = await mapWebhookPayload(
    "program",
    { name: "A", phone: "0901234567", gender: "nu", channel: "truc tuyen", province: "TP. Hồ Chí Minh", dob: "15/09/2006" },
    mappings({ name: "fullName", phone: "phone", gender: "gender", channel: "custom:channel", province: "custom:province", dob: "dateOfBirth" }),
    metadata,
  );
  assert.equal(result.leadValues.gender, "female");
  assert.equal(result.leadValues.dateOfBirth, "2006-09-15");
  assert.deepEqual(result.customFieldValues, [
    { fieldId: "channel", value: "ONLINE" },
    { fieldId: "province", value: "tp_ho_chi_minh" },
  ]);
  assert.deepEqual(result.unmatchedValues, []);
  assert.deepEqual(result.resolvedFieldKeys, ["fullName", "phone", "gender", "custom:channel", "custom:province", "dateOfBirth"]);
});

test("keeps unmatched values with a * mark instead of rejecting the request", async () => {
  const result = await mapWebhookPayload(
    "program",
    { name: "A", phone: "0901234567", channel: "Zalo", email: "not-an-email", dob: "2026-02-31", topics: "Trực tuyến, Khác" },
    mappings({ name: "fullName", phone: "phone", channel: "custom:channel", email: "email", dob: "dateOfBirth", topics: "custom:topics" }),
    metadata,
  );
  assert.deepEqual(result.unmatchedValues, [
    { fieldKey: "custom:channel", label: "Kênh", rawValue: "Zalo" },
    { fieldKey: "email", label: "Email", rawValue: "not-an-email" },
    { fieldKey: "dateOfBirth", label: "Ngày sinh", rawValue: "2026-02-31" },
    { fieldKey: "custom:topics", label: "Chủ đề", rawValue: "Khác" },
  ]);
  assert.equal(result.mapped["custom:channel"], "Zalo*");
  assert.equal(result.leadValues.email, undefined);
  assert.equal(result.leadValues.dateOfBirth, undefined);
  // The matched part of a multi-select is still stored.
  assert.deepEqual(result.customFieldValues, [{ fieldId: "topics", value: ["ONLINE"] }]);
});

test("identity fields stay strict because they decide Lead creation and deduplication", async () => {
  await assert.rejects(
    mapWebhookPayload("program", { name: "A", phone: "abc" }, mappings({ name: "fullName", phone: "phone" }), metadata),
    (error: unknown) => error instanceof ProcessFailure && error.code === "INVALID_FIELD_VALUE" && error.field === "phone",
  );
});
