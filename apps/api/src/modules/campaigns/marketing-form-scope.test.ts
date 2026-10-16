import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import { getMarketingFormVisibility, type MarketingFormViewer } from "./marketing-form-scope";
import { getInstitutionProgramScope, InstitutionProgramScopeError } from "../institutions/institution-program-scope";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const viewer: MarketingFormViewer = { id: first, permissions: ["campaign.view_all"], accessScope: "ALL", departmentIds: [], institutionProgramIds: [first] };

test("form scope fails closed without membership, including ALL", () => {
  assert.notDeepEqual(getMarketingFormVisibility({ ...viewer, institutionProgramIds: [] }), []);
  assert.equal(getMarketingFormVisibility(viewer, second)[0].institution_program_id, "00000000-0000-4000-8000-000000000000");
  assert.equal(getMarketingFormVisibility(viewer)[0].institution_program_id, first);
});

test("broad permission never overrides owned or department scope", () => {
  assert.deepEqual(getMarketingFormVisibility({ ...viewer, accessScope: "OWNED_ONLY" })[1], { created_by: first });
  assert.deepEqual(getMarketingFormVisibility({ ...viewer, accessScope: "DEPARTMENT", departmentIds: [second] })[1], { users: { is: { user_departments: { some: { department_id: { in: [second] } } } } } });
});

test("working program header checks membership and UUID before service calls", () => {
  const request = (header: string) => ({ header: () => header, authUser: { institutionProgramIds: [first] } }) as unknown as Request;
  assert.equal(getInstitutionProgramScope(request(first)), first);
  assert.throws(() => getInstitutionProgramScope(request(second)), (error) => error instanceof InstitutionProgramScopeError && error.statusCode === 403);
  assert.throws(() => getInstitutionProgramScope(request("invalid")), (error) => error instanceof InstitutionProgramScopeError && error.statusCode === 400);
});
