import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAutomationConditions } from "./automation-condition-evaluator";

const values = new Map<string, unknown>([
  ["system:status", "new"],
  ["system:fullName", "Nguyễn Văn An"],
  ["system:email", "an@example.test"],
]);

test("AND condition group requires every predicate to match", () => {
  assert.equal(evaluateAutomationConditions(values, "AND", [
    { field: "system:status", operator: "equals", value: "new" },
    { field: "system:email", operator: "exists" },
  ]), true);

  assert.equal(evaluateAutomationConditions(values, "AND", [
    { field: "system:status", operator: "equals", value: "new" },
    { field: "system:fullName", operator: "contains", value: "Trần" },
  ]), false);
});

test("OR condition group accepts any matching predicate", () => {
  assert.equal(evaluateAutomationConditions(values, "OR", [
    { field: "system:status", operator: "equals", value: "lost" },
    { field: "system:fullName", operator: "contains", value: "Văn An" },
  ]), true);
});

test("evaluates number and date operators without lexical string comparison", () => {
  const typedValues = new Map<string, unknown>([
    ["system:score", 10],
    ["system:date", new Date("2026-10-02T00:00:00.000Z")],
  ]);

  assert.equal(evaluateAutomationConditions(typedValues, "AND", [
    { field: "system:score", operator: "greater_than", value: "2" },
    { field: "system:date", operator: "after", value: "2026-10-01" },
    { field: "system:date", operator: "equals", value: "2026-10-02" },
  ]), true);
});

test("evaluates empty, negative contains, list membership and multi-select arrays", () => {
  const typedValues = new Map<string, unknown>([
    ["system:empty", []],
    ["system:tags", ["vip", "new"]],
  ]);

  assert.equal(evaluateAutomationConditions(typedValues, "AND", [
    { field: "system:empty", operator: "empty" },
    { field: "system:tags", operator: "contains", value: "vip" },
    { field: "system:tags", operator: "not_contains", value: "lost" },
    { field: "system:tags", operator: "in", value: "warm, vip" },
    { field: "system:tags", operator: "not_in", value: "cold, lost" },
  ]), true);
});
