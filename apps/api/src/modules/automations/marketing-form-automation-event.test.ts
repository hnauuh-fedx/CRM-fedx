import assert from "node:assert/strict";
import test from "node:test";
import { automationEventExecutionId } from "./automation-event-id";
import { getAutomationEventValues } from "./automation-event-values";
import { AUTOMATION_TRIGGER_TYPES } from "./automation-registry";

test("Form/Survey triggers are registered for rule validation and UI options", () => {
  assert.ok(AUTOMATION_TRIGGER_TYPES.includes("form_submitted"));
  assert.ok(AUTOMATION_TRIGGER_TYPES.includes("survey_completed"));
});

test("event execution IDs are stable per submission and rule", () => {
  const first = automationEventExecutionId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
  const replay = automationEventExecutionId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
  const otherRule = automationEventExecutionId("11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, replay);
  assert.notEqual(first, otherRule);
});

test("Form/Survey context exposes allowlisted metadata and answer fields to conditions", () => {
  const values = getAutomationEventValues({ payload: {
    eventType: "survey_completed",
    formId: "form-1",
    submissionId: "submission-1",
    configurationVersion: "v1",
    answers: { score: "5", interests: ["a", "b"] },
    ignored: "not exposed",
  } });
  assert.equal(values.get("event:eventType"), "survey_completed");
  assert.equal(values.get("event:formId"), "form-1");
  assert.equal(values.get("event:answer:score"), "5");
  assert.deepEqual(values.get("event:answer:interests"), ["a", "b"]);
  assert.equal(values.has("event:ignored"), false);
});
