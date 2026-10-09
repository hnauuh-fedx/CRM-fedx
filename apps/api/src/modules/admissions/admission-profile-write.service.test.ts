import assert from "node:assert/strict";
import test from "node:test";

import { hasValidAdmissionReferences } from "./admission-profile-write.service";

function transactionClient({
  programExists = true,
  majorExists = true,
  statusExists = true,
}: {
  programExists?: boolean;
  majorExists?: boolean;
  statusExists?: boolean;
} = {}) {
  return {
    institution_programs: {
      findUnique: async () => programExists ? { id: "program-id" } : null,
    },
    majors: {
      findFirst: async () => majorExists ? { id: "major-id" } : null,
    },
    admission_statuses: {
      findUnique: async () => statusExists ? { id: "status-id" } : null,
    },
  } as never;
}

test("accepts a valid major without requiring an admission status", async () => {
  const valid = await hasValidAdmissionReferences(transactionClient(), {
    institutionProgramId: "program-id",
    majorId: "major-id",
  });

  assert.equal(valid, true);
});

test("accepts a valid admission status without requiring a major", async () => {
  const valid = await hasValidAdmissionReferences(transactionClient(), {
    institutionProgramId: "program-id",
    admissionStatusId: "status-id",
  });

  assert.equal(valid, true);
});

test("rejects only a supplied reference that does not exist", async () => {
  const valid = await hasValidAdmissionReferences(transactionClient({ majorExists: false }), {
    institutionProgramId: "program-id",
    majorId: "missing-major-id",
  });

  assert.equal(valid, false);
});

test("accepts an update without admission fields", async () => {
  const valid = await hasValidAdmissionReferences(transactionClient(), {});

  assert.equal(valid, true);
});
