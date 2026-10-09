import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../database/prisma";
import { createCustomFieldPermissionGuard } from "./custom-field-authorization.middleware";
import type { CustomFieldPermissionAction } from "./custom-field-permissions";
import type { AuthUser } from "../auth/auth.types";

const fieldId = "11111111-1111-4111-8111-111111111111";
const actor: AuthUser = { id: fieldId, email: "test@example.invalid", fullName: "Test", avatarUrl: null, roles: [], permissions: [], departmentIds: [], institutionProgramIds: [], accessScope: "ALL" };
let persistedField = { entity_type: "ADMISSION_PROFILE", program_id: null as string | null, is_sensitive: false };
const requireCustomFieldPermission = createCustomFieldPermissionGuard({
  custom_fields: {
    findUnique: async () => persistedField,
    findMany: async () => [{ entity_type: "MARKETING_CAMPAIGN", program_id: null }, { entity_type: "ADMISSION_PROFILE", program_id: null }],
  },
  custom_field_groups: { findUnique: async () => ({ entity_type: "ADMISSION_PROFILE" }) },
} as unknown as Pick<typeof prisma, "custom_fields" | "custom_field_groups">);
async function authorize(action: CustomFieldPermissionAction, permissions: string[], request: Partial<Request>) {
  let status = 200;
  let proceeded = false;
  const res = { status(code: number) { status = code; return this; }, json() { return this; } } as Response;
  await requireCustomFieldPermission(action)({ params: {}, query: {}, body: {}, path: "/", method: "GET", ...request, authUser: { ...actor, permissions } } as Request, res, (error?: unknown) => {
    if (error) throw error;
    proceeded = true;
  });
  return proceeded ? 200 : status;
}

test("configuration permissions cannot cross forms, persisted IDs, sensitive fields or program scope", async () => {
  const permissions = ["custom_field.marketing_campaign.manage"];
  assert.equal(await authorize("view", permissions, { query: { entityType: "MARKETING_CAMPAIGN" } }), 200);
  assert.equal(await authorize("view", permissions, { query: { entityType: "ADMISSION_PROFILE" } }), 403);
  assert.equal(await authorize("view", ["custom_field.view"], { query: { entityType: "MARKETING_CAMPAIGN" } }), 403);
  assert.equal(await authorize("create", ["custom_field.marketing_campaign.manage"], { method: "POST", query: { entityType: "MARKETING_CAMPAIGN" }, body: { entityType: "ADMISSION_PROFILE" } }), 403);
  assert.equal(await authorize("update", permissions, { path: "/system/LEAD/note-templates/lead", method: "PUT", body: { entityType: "MARKETING_CAMPAIGN" } }), 403);
    const updateRequest = { params: { id: fieldId }, path: `/${fieldId}`, method: "PATCH", body: { entityType: "MARKETING_CAMPAIGN" } };
    assert.equal(await authorize("update", permissions, updateRequest), 403);
    assert.equal(await authorize("update", permissions, { ...updateRequest, path: `/groups/${fieldId}` }), 403);
    assert.equal(await authorize("update", permissions, { path: "/reorder", method: "POST", body: { fieldIds: [fieldId] } }), 403);
    persistedField = { entity_type: "MARKETING_CAMPAIGN", program_id: null, is_sensitive: false };
    assert.equal(await authorize("update", permissions, updateRequest), 200);
    persistedField = { entity_type: "MARKETING_CAMPAIGN", program_id: "unassigned-program", is_sensitive: false };
    assert.equal(await authorize("update", permissions, updateRequest), 403);
    persistedField = { entity_type: "MARKETING_CAMPAIGN", program_id: null, is_sensitive: true };
    assert.equal(await authorize("update", permissions, updateRequest), 200);
    assert.equal(await authorize("update", ["custom_field.marketing_campaign.update"], updateRequest), 403);
    persistedField = { entity_type: "ADMISSION_MAJOR", program_id: null, is_sensitive: false };
    assert.equal(await authorize("update", ["custom_field.admission_major.manage"], updateRequest), 403);
});
