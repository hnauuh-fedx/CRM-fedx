import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { app } from "../app";
import { prisma } from "../database/prisma";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8).toUpperCase();
let createdMajorId: string | null = null;

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; programId?: string; method?: string; body?: JsonRecord } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.programId ? { "X-Institution-Program-Id": options.programId } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  return { status: response.status, payload };
}

async function login(baseUrl: string, email: string) {
  const response = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password: "123456" },
  });
  assert.equal(response.status, 200, `Không thể đăng nhập tài khoản ${email}.`);
  return response.payload.accessToken as string;
}

async function verifyDirectorMajorManagement() {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const [directorToken, marketingToken] = await Promise.all([
      login(baseUrl, "director@tvu.edu.vn"),
      login(baseUrl, "marketing@tvu.edu.vn"),
    ]);
    const programResponse = await request(baseUrl, "/institution-programs/options", { token: directorToken });
    assert.equal(programResponse.status, 200);
    const programs = programResponse.payload.data as Array<{ id: string; code: string }>;
    const selectedProgram = programs.find((program) => program.code === "TVU-CQ-2026") ?? programs[0];
    const otherProgram = programs.find((program) => program.id !== selectedProgram?.id);
    assert.ok(selectedProgram, "Cần seed chương trình tuyển sinh trước khi kiểm thử quản lý ngành.");

    assert.equal((await request(baseUrl, "/majors?page=1&limit=20", { token: directorToken })).status, 400);
    assert.equal(
      (await request(baseUrl, "/majors?page=1&limit=20", { token: marketingToken, programId: selectedProgram.id })).status,
      403,
      "Tài khoản không có quyền quản lý ngành không được truy cập.",
    );

    const listResponse = await request(baseUrl, "/majors?page=1&limit=20", {
      token: directorToken,
      programId: selectedProgram.id,
    });
    assert.equal(listResponse.status, 200);
    const existingMajors = listResponse.payload.data as Array<{
      id: string;
      admissionCount: number;
      studentCount: number;
    }>;
    const usedMajor = existingMajors.find((major) => major.admissionCount > 0 || major.studentCount > 0);
    assert.ok(usedMajor, "Cần có ngành mẫu đã sử dụng để kiểm tra chặn xóa.");
    assert.equal(
      (await request(baseUrl, `/majors/${usedMajor.id}`, {
        token: directorToken,
        programId: selectedProgram.id,
        method: "DELETE",
      })).status,
      409,
    );

    const code = `TEST-${runId}`;
    const createResponse = await request(baseUrl, "/majors", {
      token: directorToken,
      programId: selectedProgram.id,
      method: "POST",
      body: { name: `Ngành kiểm thử ${runId}`, code, facultyId: "" },
    });
    assert.equal(createResponse.status, 201);
    createdMajorId = createResponse.payload.id as string;
    assert.equal(typeof createdMajorId, "string");

    assert.equal(
      (await request(baseUrl, "/majors", {
        token: directorToken,
        programId: selectedProgram.id,
        method: "POST",
        body: { name: "Ngành trùng mã", code, facultyId: "" },
      })).status,
      409,
    );
    if (otherProgram) {
      assert.equal(
        (await request(baseUrl, `/majors/${createdMajorId}`, {
          token: directorToken,
          programId: otherProgram.id,
          method: "PATCH",
          body: { name: "Không được sửa khác chương trình", code, facultyId: "" },
        })).status,
        404,
      );
    }

    assert.equal(
      (await request(baseUrl, `/majors/${createdMajorId}`, {
        token: directorToken,
        programId: selectedProgram.id,
        method: "PATCH",
        body: { name: `Ngành đã sửa ${runId}`, code, facultyId: "" },
      })).status,
      200,
    );
    assert.equal(
      (await request(baseUrl, `/majors/${createdMajorId}`, {
        token: directorToken,
        programId: selectedProgram.id,
        method: "DELETE",
      })).status,
      200,
    );

    const auditActions = (
      await prisma.audit_logs.findMany({
        where: { entity_type: "major", entity_id: createdMajorId },
        select: { action: true },
      })
    ).map((entry) => entry.action);
    assert.deepEqual(auditActions.sort(), ["create", "delete", "update"]);

    console.log("Director major management verified: permission, selected program scope, CRUD, used-major protection and audit.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (createdMajorId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "major", entity_id: createdMajorId } });
      await prisma.majors.deleteMany({ where: { id: createdMajorId } });
    }
    await prisma.$disconnect();
  }
}

verifyDirectorMajorManagement().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
