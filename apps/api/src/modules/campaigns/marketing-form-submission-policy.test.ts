import assert from "node:assert/strict";
import { test } from "node:test";
import { marketingFormPublicationType, readMarketingFormSubmissionPolicy, newMarketingFormSubmissionSettings } from "@admission-crm/shared/marketing-form-submission-policy";
test("new forms default by purpose without changing explicit selections", () => {
  assert.equal(newMarketingFormSubmissionSettings("survey").submissionMode, "survey_only");
  assert.equal(newMarketingFormSubmissionSettings("lead_form").submissionMode, "create_lead");
  assert.equal(newMarketingFormSubmissionSettings("lead_form", { submissionMode: "upsert_lead", submissionPolicyVersion: 1 }).submissionMode, "upsert_lead");
  assert.deepEqual(newMarketingFormSubmissionSettings("external_webhook", { action: "skip" }), { action: "skip" });
  const legacy = { submissionMode: "legacy", action: "skip" };
  assert.deepEqual(newMarketingFormSubmissionSettings("survey", legacy), legacy);
  const input = { fields: ["phone"], action: "skip" };
  const defaults = newMarketingFormSubmissionSettings("survey", input);
  assert.deepEqual(input, { fields: ["phone"], action: "skip" });
  assert.deepEqual(defaults.fields, ["phone"]);
  assert.equal(readMarketingFormSubmissionPolicy(defaults)?.updatePolicy, "fill_empty");
});
test("missing mode preserves legacy behaviour", () => {
  assert.equal(readMarketingFormSubmissionPolicy({ action: "skip" }), null);
  assert.equal(marketingFormPublicationType("lead_form", {}), "lead_form");
});
test("explicit mode controls publication independent of form type", () => {
  assert.equal(marketingFormPublicationType("lead_form", { submissionMode: "survey_only", submissionPolicyVersion: 1 }), "survey");
  assert.equal(marketingFormPublicationType("survey", { submissionMode: "create_lead", submissionPolicyVersion: 1 }), "lead_form");
});
test("reject invalid version, mode, policy and sensitive overwrite targets", () => {
  for (const value of [{ submissionMode: "fake" }, { submissionMode: "upsert_lead", submissionPolicyVersion: 9 }, { submissionMode: "upsert_lead", submissionPolicyVersion: 1, updatePolicy: "all" }, { submissionMode: "upsert_lead", submissionPolicyVersion: 1, overwriteFields: ["owner_id"] }]) assert.throws(() => readMarketingFormSubmissionPolicy(value));
});
