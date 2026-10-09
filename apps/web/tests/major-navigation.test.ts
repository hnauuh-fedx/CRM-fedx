import assert from "node:assert/strict";
import { getActiveNavigationSection, getNavigationSections, isNavigationLink } from "../src/components/layout/navigation";

const sections = getNavigationSections(["admission_major.manage", "institution_program.manage", "admission.view"]);
const management = getActiveNavigationSection("/quan-ly/nganh", sections);
assert.ok(management);
const links = management.items.filter(isNavigationLink);
const programIndex = links.findIndex((item) => item.href === "/quan-ly/chuong-trinh");
assert.equal(links[programIndex + 1]?.href, "/quan-ly/nganh");
assert.equal(links[programIndex + 1]?.label, "Quản lý ngành");
assert.ok(!sections.flatMap((section) => section.items).filter(isNavigationLink).some((item) => item.href === "/tuyen-sinh/nganh"));
assert.ok(!getNavigationSections(["admission.view"]).flatMap((section) => section.items).filter(isNavigationLink).some((item) => item.href === "/quan-ly/nganh"));
assert.equal(getActiveNavigationSection("/quan-ly/nganh", getNavigationSections(["admission_major.manage"]))?.label, "Quản lý");
console.log("Major management navigation: location, ordering and permissions verified.");
