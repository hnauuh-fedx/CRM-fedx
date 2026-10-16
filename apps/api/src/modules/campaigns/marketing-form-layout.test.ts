import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMarketingFormLayout, readMarketingFormLayout, readMarketingFormPlacement, validateMarketingFormLayout } from "@admission-crm/shared/marketing-form-layout";
import { createMarketingFormSnapshot } from "@admission-crm/shared/marketing-form-snapshot";
const layout = { version: 1 as const, pages: [{ id: "first", title: "Thông tin" }, { id: "second", title: "Khảo sát" }], groups: [{ id: "group", pageId: "second", title: "Sở thích" }] };
const field = { fieldKey: "answer", label: "Câu trả lời", fieldType: "text", isRequired: true, validationRules: { formLayout: { pageId: "second", groupId: "group" } } };
test("legacy forms retain a single default page and missing placement uses first page", () => {
  assert.deepEqual(readMarketingFormLayout(null), defaultMarketingFormLayout());
  assert.deepEqual(readMarketingFormPlacement({}, layout), { pageId: "first" });
  assert.deepEqual(validateMarketingFormLayout(undefined, [{ ...field, validationRules: {} }]), []);
});
test("valid pages/groups preserve stable placement without field key references", () => {
  assert.deepEqual(validateMarketingFormLayout({ surveyLayout: layout }, [field]), []);
  const renamed = { ...field, fieldKey: "renamed" };
  assert.deepEqual(readMarketingFormPlacement(renamed, layout), { pageId: "second", groupId: "group" });
});
test("malformed layout, duplicate IDs, limits and cross-page groups are rejected", () => {
  for (const invalid of [null, { ...layout, version: 2 }, { ...layout, pages: [] }, { ...layout, pages: Array(21).fill(layout.pages[0]) }, { ...layout, pages: [layout.pages[0], layout.pages[0]] }, { ...layout, groups: Array(51).fill(layout.groups[0]) }, { ...layout, groups: [{ ...layout.groups[0], pageId: "missing" }] }, { ...layout, pages: [{ id: "__none__", title: "Trang" }] }, { ...layout, pages: [{ id: "first", title: " " }] }]) {
    assert.ok(validateMarketingFormLayout({ surveyLayout: invalid }, []).length);
  }
  for (const placement of [{ pageId: "missing" }, { pageId: "first", groupId: "group" }, { pageId: "second", groupId: "missing" }]) {
    const issues = validateMarketingFormLayout({ surveyLayout: layout }, [{ ...field, validationRules: { formLayout: placement } }]);
    assert.deepEqual(issues[0].path.slice(0, 4), ["fields", 0, "validationRules", "formLayout"]);
  }
});
test("snapshot owns layout and placements; later edits cannot rewrite historic pages", () => {
  const ownedLayout = structuredClone(layout);
  const ownedField = structuredClone(field);
  const snapshot = createMarketingFormSnapshot({ formId: "form", formName: "Survey", formType: "survey", institutionProgramId: "program", configurationUpdatedAt: null, layout: ownedLayout, fields: [ownedField] });
  ownedLayout.pages[1].title = "Đổi tên";
  ownedField.validationRules.formLayout.pageId = "first";
  assert.equal(snapshot.layout?.pages[1].title, "Khảo sát");
  assert.deepEqual(snapshot.fields[0].validationRules.formLayout, { pageId: "second", groupId: "group" });
});
