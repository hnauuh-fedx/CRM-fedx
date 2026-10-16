import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketingFormSnapshot, describeMarketingFormAnswers } from "@admission-crm/shared/marketing-form-snapshot";

test("snapshot owns its field labels, choices and dependency data", () => {
  const fields = [{ fieldKey: "major", label: "Ngành trước", fieldType: "select", isRequired: true, options: [{ value: "id", label: "Nhãn trước" }], validationRules: { questionDescription: "Hướng dẫn trước", dependency: { parentFieldKey: "a" } } }];
  const snapshot = createMarketingFormSnapshot({ formId: "form", formName: "Survey", formType: "survey", institutionProgramId: "program", configurationUpdatedAt: null, fields });
  fields[0].label = "Ngành sau";
  fields[0].options[0].label = "Nhãn sau";
  fields[0].validationRules.dependency.parentFieldKey = "b";
  fields[0].validationRules.questionDescription = "Hướng dẫn sau";
  assert.equal(snapshot.fields[0].label, "Ngành trước");
  assert.deepEqual(snapshot.fields[0].validationRules, { questionDescription: "Hướng dẫn trước", dependency: { parentFieldKey: "a" } });
  assert.deepEqual(describeMarketingFormAnswers({ major: ["id", "không biết"] }, snapshot), [{ fieldKey: "major", label: "Ngành trước", answer: "Nhãn trước; không biết" }]);
});
test("legacy answers keep raw keys/values; no fabricated historic labels", () => {
  assert.deepEqual(describeMarketingFormAnswers({ major: "id" }, null), [{ fieldKey: "major", label: "major", answer: "id" }]);
  assert.deepEqual(describeMarketingFormAnswers(null), []);
});
test("Other labels follow the submitted configuration without fabricating legacy semantics", () => {
  const fields = [{ fieldKey: "choice", label: "Quan tâm", fieldType: "radio", isRequired: true, validationRules: { allowOther: true } }];
  const snapshot = createMarketingFormSnapshot({ formId: "form", formName: "Survey", formType: "survey", institutionProgramId: "program", configurationUpdatedAt: null, fields });
  fields[0].validationRules.allowOther = false;
  assert.equal(describeMarketingFormAnswers({ choice: { kind: "other", text: "Nội dung riêng" } }, snapshot)[0].answer, "Khác: Nội dung riêng");
});
test("rating answer labels use the immutable submitted scale", () => {
  const fields = [{ fieldKey: "score", label: "Hài lòng", fieldType: "rating", isRequired: true, validationRules: { ratingMax: 10 } }];
  const snapshot = createMarketingFormSnapshot({ formId: "form", formName: "Survey", formType: "survey", institutionProgramId: "program", configurationUpdatedAt: null, fields });
  fields[0].validationRules.ratingMax = 5;
  assert.equal(describeMarketingFormAnswers({ score: "8" }, snapshot)[0].answer, "8 / 10 sao");
  assert.equal(describeMarketingFormAnswers({ score: "8" }, null)[0].answer, "8");
});
