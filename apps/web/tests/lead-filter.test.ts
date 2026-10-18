import assert from "node:assert/strict";
import { test } from "node:test";
import { getAvailableFields, type FilterConditionState } from "../src/modules/leads/filter-fields";
import { getOperatorLabel, OPERATORS_BY_DATA_TYPE } from "../src/modules/leads/filter-operators";
import { applyConditionsToParams, decodeConditions, serializeConditions } from "../src/modules/leads/filter-serialization";
import { validateCondition, validateConditions } from "../src/modules/leads/filter-validation";
import type { LeadCustomField, LeadFilterOptions } from "../src/modules/leads/lead.types";

function condition(patch: Partial<FilterConditionState>): FilterConditionState {
  return { id: "c", field: null, operator: null, value: null, valueTo: null, numberValue: null, ...patch };
}

const options = {
  sources: [{ id: "source-1", name: "Facebook" }],
  institutionPrograms: [],
  assignees: [{ id: "user-1", fullName: "Nguyễn Văn A" }],
  stages: [{ id: "stage-1", name: "Liên hệ (L1)", color: null, pipelineId: null, pipelineName: null, count: 3 }],
  majors: [{ id: "major-1", name: "CNTT" }],
  totalLeads: 3,
  failedLeads: 0,
} satisfies LeadFilterOptions;

const customField = (patch: Partial<LeadCustomField>): LeadCustomField => ({
  id: "field-1", code: "school", name: "Trường THPT", description: null,
  group: { id: "g", key: "g", label: "Nhóm", description: null, isSystem: false, displayOrder: 0 },
  dataType: "TEXT", isRequired: false, isSensitive: false, displayOrder: 0, options: null,
  validationRules: null, value: null, canView: true, canEdit: true, ...patch,
});

test("dropdown fields list their values; sensitive and hidden fields are excluded", () => {
  const fields = getAvailableFields([
    customField({}),
    customField({ id: "field-2", name: "Hệ đào tạo", dataType: "SELECT", options: [
      { code: "full", label: "Chính quy", isActive: true, displayOrder: 0 },
      { code: "old", label: "Ngừng tuyển", isActive: false, displayOrder: 1 },
    ] }),
    customField({ id: "field-3", name: "Thu nhập", canView: false }),
    customField({ id: "field-4", name: "Tỉnh", dataType: "PROVINCE" }),
  ], options, false);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  assert.deepEqual(byKey.get("pipelineStageId")?.options, [{ value: "stage-1", label: "Liên hệ (L1)" }]);
  assert.deepEqual(byKey.get("sourceId")?.options, [{ value: "source-1", label: "Facebook" }]);
  assert.deepEqual(byKey.get("assigneeId")?.options, [{ value: "user-1", label: "Nguyễn Văn A" }]);
  assert.deepEqual(byKey.get("cf:field-2")?.options, [{ value: "full", label: "Chính quy" }]);
  assert.equal(byKey.get("cf:field-4")?.dataType, "enum");
  assert.ok((byKey.get("cf:field-4")?.options?.length ?? 0) > 30);
  assert.equal(byKey.has("cf:field-3"), false);
  assert.equal(byKey.has("phone"), false);
  assert.equal(getAvailableFields([], options, true).some((field) => field.key === "phone"), true);
});

test("date fields offer comparison operators, ranges, presets and empty checks", () => {
  const dateOperators = OPERATORS_BY_DATA_TYPE.date;
  for (const operator of ["EQUALS", "NOT_EQUALS", "GT", "GTE", "LT", "LTE", "BETWEEN", "IS_THIS_MONTH", "IS_LAST_MONTH",
    "IS_QUARTER_1", "IS_QUARTER_4", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_TODAY", "IS_YESTERDAY", "IS_X_DAYS_AGO", "HAS_VALUE", "HAS_NO_VALUE"] as const) {
    assert.ok(dateOperators.includes(operator), operator);
  }
  assert.equal(getOperatorLabel("EQUALS", "date"), "=");
  assert.equal(getOperatorLabel("NOT_EQUALS", "date"), "!=");
  assert.equal(getOperatorLabel("LTE", "date"), "<=");
  assert.equal(getOperatorLabel("EQUALS", "enum"), "Là");
  for (const dataType of ["text", "number", "date", "enum", "boolean"] as const) {
    assert.ok(OPERATORS_BY_DATA_TYPE[dataType].includes("HAS_VALUE"));
    assert.ok(OPERATORS_BY_DATA_TYPE[dataType].includes("HAS_NO_VALUE"));
  }
});

test("validation only asks for a value when the operator needs one", () => {
  assert.deepEqual(validateCondition(condition({})), ["Vui lòng chọn trường lọc."]);
  assert.deepEqual(validateCondition(condition({ field: "fullName" })), ["Vui lòng chọn điều kiện."]);
  assert.deepEqual(validateCondition(condition({ field: "fullName", operator: "CONTAINS", value: "  " })), ["Vui lòng nhập giá trị."]);
  assert.deepEqual(validateCondition(condition({ field: "fullName", operator: "HAS_NO_VALUE" })), []);
  assert.deepEqual(validateCondition(condition({ field: "createdAt", operator: "IS_THIS_MONTH" })), []);
  assert.equal(validateCondition(condition({ field: "createdAt", operator: "IS_X_DAYS_AGO" })).length, 1);
  assert.deepEqual(validateCondition(condition({ field: "createdAt", operator: "IS_X_DAYS_AGO", numberValue: 0 })), []);
  assert.equal(validateCondition(condition({ field: "createdAt", operator: "BETWEEN", value: "2026-10-01" })).length, 1);
  assert.deepEqual(validateCondition(condition({ field: "cf:bool", operator: "EQUALS", value: false })), []);
  assert.deepEqual(validateConditions([condition({ field: "fullName", operator: "HAS_VALUE" }), condition({ field: "fullName" })]),
    ["Dòng 2: Vui lòng chọn điều kiện."]);
});

test("conditions round-trip through the URL and keep other query params", () => {
  const conditions = [
    condition({ id: "a", combinator: "OR", field: "fullName", operator: "CONTAINS", value: "An & Bình" }),
    condition({ id: "b", combinator: "OR", field: "createdAt", operator: "BETWEEN", value: "2026-10-01", valueTo: "2026-10-15" }),
    condition({ id: "c", field: "createdAt", operator: "IS_X_DAYS_AGO", numberValue: 3 }),
    condition({ id: "d", field: "cf:bool", operator: "EQUALS", value: false }),
  ];
  const serialized = JSON.parse(serializeConditions(conditions));
  assert.equal(serialized[0].combinator, undefined, "dòng đầu không có phép nối");
  assert.equal(serialized[1].combinator, "OR");
  assert.equal(serialized[2].combinator, "AND", "thiếu phép nối được hiểu là Và");
  assert.equal(serialized[3].value, false);

  const params = applyConditionsToParams(new URLSearchParams("tab=sale"), conditions);
  assert.equal(params.get("tab"), "sale");
  const decoded = decodeConditions(new URLSearchParams(params.toString()));
  assert.deepEqual(decoded.map(({ id: _id, ...rest }) => rest), [
    { combinator: undefined, field: "fullName", operator: "CONTAINS", value: "An & Bình", valueTo: null, numberValue: null },
    { combinator: "OR", field: "createdAt", operator: "BETWEEN", value: "2026-10-01", valueTo: "2026-10-15", numberValue: null },
    { combinator: "AND", field: "createdAt", operator: "IS_X_DAYS_AGO", value: null, valueTo: null, numberValue: 3 },
    { combinator: "AND", field: "cf:bool", operator: "EQUALS", value: false, valueTo: null, numberValue: null },
  ]);

  // Đổi "Chứa 088" sang "Có giá trị": giá trị cũ không được gửi đi.
  assert.deepEqual(JSON.parse(serializeConditions([condition({ field: "phone", operator: "HAS_VALUE", value: "088" })])), [
    { field: "phone", operator: "HAS_VALUE" },
  ]);
  assert.deepEqual(JSON.parse(serializeConditions([condition({ field: "fullName", operator: "CONTAINS", value: "An", valueTo: "x" })])), [
    { field: "fullName", operator: "CONTAINS", value: "An" },
  ]);

  assert.equal(applyConditionsToParams(params, []).has("filters"), false);
  assert.deepEqual(decodeConditions(new URLSearchParams("filters=%7Bbroken")), []);
  assert.deepEqual(decodeConditions(new URLSearchParams(`filters=${encodeURIComponent(JSON.stringify([{ field: "x", operator: "DROP" }]))}`)), []);
});
