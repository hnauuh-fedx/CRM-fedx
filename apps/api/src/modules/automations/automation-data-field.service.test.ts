import assert from "node:assert/strict";
import test from "node:test";

import { renderAutomationTemplate } from "./automation-data-field.service";

test("renderAutomationTemplate replaces configured system and custom fields", () => {
  const values = new Map<string, unknown>([
    ["system:fullName", "Nguyễn Văn An"],
    ["custom:interest", ["CNTT", "Thiết kế"]],
  ]);

  assert.equal(
    renderAutomationTemplate(
      "Lead {{system:fullName}} quan tâm {{custom:interest}}.",
      values,
    ),
    "Lead Nguyễn Văn An quan tâm CNTT, Thiết kế.",
  );
});

test("renderAutomationTemplate keeps unknown tokens so configuration errors remain visible", () => {
  assert.equal(
    renderAutomationTemplate("Xin chào {{system:removedField}}", new Map()),
    "Xin chào {{system:removedField}}",
  );
});

test("renderAutomationTemplate supports legacy lead placeholders", () => {
  const values = new Map<string, unknown>([["system:fullName", "Lead cũ"]]);
  assert.equal(renderAutomationTemplate("{{lead.fullName}}", values), "Lead cũ");
});

test("renderAutomationTemplate supports admission program and major variables", () => {
  const values = new Map<string, unknown>([
    ["system:institutionProgramName", "Chương trình chính quy"],
    ["system:majorName", "Công nghệ thông tin"],
    ["system:admissionCode", "HS-001"],
  ]);

  assert.equal(
    renderAutomationTemplate("{{system:admissionCode}} · {{system:majorName}} · {{system:institutionProgramName}}", values),
    "HS-001 · Công nghệ thông tin · Chương trình chính quy",
  );
});
