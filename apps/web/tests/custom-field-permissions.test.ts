import assert from "node:assert/strict";
import { getNavigationSections, isNavigationLink } from "../src/components/layout/navigation";
import { customFieldPermissionDefinitions, expandLegacyCustomFieldPermission, hasCustomFieldPermission } from "../../../packages/shared/src/custom-field-permissions";

function configurationLinks(permissions: string[]) {
  return getNavigationSections(permissions).flatMap((section) => section.items.flatMap((item) =>
    (isNavigationLink(item) ? [item] : item.children).filter((link) => link.href.includes("cau-hinh-truong")),
  )).map((link) => link.href);
}
assert.deepEqual(configurationLinks(["custom_field.marketing_campaign.manage"]), ["/marketing/cau-hinh-truong?form=campaign"]);
assert.deepEqual(configurationLinks(["custom_field.admission_document.manage"]), ["/tuyen-sinh/cau-hinh-truong?form=document"]);
assert.deepEqual(configurationLinks(["custom_field.admission_major.manage"]), []);
assert.deepEqual(configurationLinks(["custom_field.lead.manage"]), ["/sale/cau-hinh-truong?form=lead"]);
assert.deepEqual(configurationLinks(["custom_field.view"]), []);
assert.equal(customFieldPermissionDefinitions.length, 9);
assert.equal(new Set(customFieldPermissionDefinitions.map((item) => item.code)).size, 9);
assert.ok(!customFieldPermissionDefinitions.some((item) => item.code.startsWith("custom_field.admission_major.")));
assert.equal(hasCustomFieldPermission(["custom_field.lead.view"], "LEAD", "view"), false);
assert.equal(hasCustomFieldPermission(["custom_field.marketing_campaign.manage"], "ADMISSION_PROFILE", "update"), false);
const migrated = expandLegacyCustomFieldPermission({ code: "custom_field.view", name: "Legacy", module: "custom_field" });
assert.equal(migrated.length, 9);
assert.ok(migrated.every((item) => item.code.endsWith(".manage")));
console.log("Scoped form permissions and navigation: passed.");
