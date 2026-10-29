import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { hash } from "bcryptjs";
import { prisma } from "../database/prisma";
import { app } from "../app";
import { createAuthSession } from "../modules/auth/auth-session.service";
import { cleanupPrivateFiles, privateStorage } from "../modules/files/private-file.service";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/crm_manual_unassign_test_\d+$/);
  const objects = new Map<string, { bytes: Buffer; type: string }>(); let puts = 0, deletes = 0, failPut = false, slowPut = false;
  const storage = createServer(async (req, res) => {
    const key = new URL(req.url!, "http://localhost").pathname;
    if (req.method === "PUT") {
      if (failPut) { res.writeHead(500); res.end(); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      if (slowPut) await new Promise(resolve => setTimeout(resolve, 150));
      objects.set(key, { bytes: Buffer.concat(chunks), type: String(req.headers["content-type"]) }); puts++; res.writeHead(200); res.end();
    } else if (req.method === "DELETE") { objects.delete(key); deletes++; res.writeHead(204); res.end(); }
    else {
      const value = objects.get(key); if (!value) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Length": value.bytes.length, "Content-Type": value.type }); res.end(req.method === "HEAD" ? undefined : value.bytes);
    }
  });
  storage.listen(0, "127.0.0.1"); await once(storage, "listening");
  const storageAddress = storage.address(); assert.ok(storageAddress && typeof storageAddress !== "string");
  Object.assign(process.env, { FILE_STORAGE_PROVIDER: "s3", FILE_UPLOADS_ENABLED: "true", S3_ENDPOINT: `http://127.0.0.1:${storageAddress.port}`, S3_BUCKET: "fixture", S3_ACCESS_KEY_ID: "fixture", S3_SECRET_ACCESS_KEY: "fixture", S3_FORCE_PATH_STYLE: "true", FILE_UPLOAD_MAX_BYTES: "1024" });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
    try {
      // Exercise the additive migration on the temporary database, including legacy non-null URLs.
      await db.query("ALTER TABLE files DROP COLUMN storage_provider,DROP COLUMN storage_status,DROP COLUMN storage_bucket,DROP COLUMN object_key,DROP COLUMN institution_program_id,DROP COLUMN upload_target_id,DROP COLUMN upload_domain,DROP COLUMN document_type,DROP COLUMN request_id,DROP COLUMN request_fingerprint,DROP COLUMN content_sha256,DROP COLUMN operation_token,DROP COLUMN lease_until");
      await db.query(await readFile(path.join(__dirname, "../../prisma/migrations/20261029100000_private_files/migration.sql"), "utf8"));
    } finally { await db.end(); }
    const user = await prisma.users.findFirstOrThrow(), program = await prisma.institution_programs.findFirstOrThrow(), role = await prisma.roles.findFirstOrThrow();
    await prisma.users.update({ where: { id: user.id }, data: { password_hash: await hash("Fixture-password-123", 4), status: "active" } });
    await prisma.user_program_roles.create({ data: { user_id: user.id, role_id: role.id, institution_program_id: program.id } });
    for (const code of ["file.upload", "lead.view_all", "admission.view", "admission_document.upload"]) {
      const permission = await prisma.permissions.upsert({ where: { code }, update: {}, create: { code, name: code, module: "fixture" } });
      await prisma.role_permissions.upsert({ where: { role_id_permission_id: { role_id: role.id, permission_id: permission.id } }, update: {}, create: { role_id: role.id, permission_id: permission.id } });
    }
    const stored = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
    const session = await createAuthSession(user.id, stored.password_hash, false); assert.ok(session);
    const headers = { Authorization: `Bearer ${session.accessToken}`, "X-Institution-Program-Id": program.id };
    const lead = await prisma.leads.create({ data: { full_name: "Private fixture", phone: "0901234567", institution_program_id: program.id } });
    const pdf = "%PDF-1.4\nsynthetic fixture\n%%EOF";
    const upload = async (requestId: string, bytes = pdf, id = lead.id, admission = false, extra: Record<string, string> = {}) => {
      const form = new FormData(); form.append("file", new Blob([bytes], { type: "application/pdf" }), "fixture.pdf");
      const response = await fetch(`${base}/${admission ? "admissions" : "leads"}/${id}/files/upload${admission ? "?documentType=Test" : ""}`, { method: "POST", headers: { ...headers, "X-Request-Id": requestId, ...extra }, body: form });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await fetch(`${base}/health`)).status, 200, "Private router must not protect public endpoints");
    assert.equal((await fetch(`${base}/leads/${lead.id}/files/upload`, { method: "POST" })).status, 401);
    const request = randomUUID(), first = await upload(request); assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal((await upload(request)).status, 201); assert.equal(puts, 1);
    assert.equal((await upload(request, pdf + "different")).status, 409);
    assert.equal((await upload(randomUUID(), "<script>spoof</script>")).status, 400); assert.equal(puts, 1);
    assert.equal((await upload(randomUUID(), "x".repeat(2048))).status, 400);
    assert.equal(await prisma.file_relations.count({ where: { file_id: first.body.id } }), 1);
    assert.equal(await prisma.audit_logs.count({ where: { action: "file_attached", entity_id: lead.id } }), 1);
    const record = await prisma.files.findUniqueOrThrow({ where: { id: first.body.id } }); assert.equal(record.file_url, null); assert.equal(record.storage_status, "ready");
    slowPut = true; const concurrentId = randomUUID(); const concurrent = await Promise.all([upload(concurrentId), upload(concurrentId)]); slowPut = false;
    assert.ok(concurrent.some(result => result.status === 201)); assert.ok(concurrent.every(result => [201, 409].includes(result.status))); assert.equal(puts, 2);
    assert.equal(await prisma.files.count({ where: { request_id: concurrentId } }), 1);
    const download = await fetch(`${base}/files/${record.id}/download-url`, { method: "POST", headers }); assert.equal(download.status, 200);
    const downloadBody = await download.json(); assert.equal(new URL(downloadBody.url).searchParams.get("X-Amz-Expires"), "300");
    const otherProgram = await prisma.institution_programs.findFirstOrThrow({ where: { id: { not: program.id } } });
    assert.equal((await upload(randomUUID(), pdf, lead.id, false, { "X-Institution-Program-Id": otherProgram.id })).status, 403);
    await prisma.admission_profiles.create({ data: { lead_id: lead.id, institution_program_id: program.id } });
    const admission = await upload(randomUUID(), pdf, lead.id, true); assert.equal(admission.status, 201, JSON.stringify(admission.body));
    assert.equal(await prisma.admission_documents.count({ where: { file_id: admission.body.id } }), 1);
    assert.equal((await fetch(`${base}/files/${admission.body.id}/download-url`, { method: "POST", headers })).status, 200);
    failPut = true; const failed = await upload(randomUUID()); assert.equal(failed.status, 503); failPut = false;
    await prisma.files.updateMany({ where: { storage_status: "failed" }, data: { created_at: new Date(0), lease_until: new Date(0) } });
    await cleanupPrivateFiles(); assert.equal(deletes, 1); assert.equal((await prisma.files.findUniqueOrThrow({ where: { id: record.id } })).storage_status, "ready");
    const filePermission = await prisma.permissions.findUniqueOrThrow({ where: { code: "file.upload" } });
    await prisma.role_permissions.deleteMany({ where: { role_id: role.id, permission_id: filePermission.id } });
    assert.equal((await upload(randomUUID())).status, 403);
    const viewPermissions = await prisma.permissions.findMany({ where: { code: { startsWith: "lead.view" } }, select: { id: true } });
    await prisma.role_permissions.deleteMany({ where: { role_id: role.id, permission_id: { in: viewPermissions.map(item => item.id) } } });
    assert.equal((await fetch(`${base}/files/${record.id}/download-url`, { method: "POST", headers })).status, 403);
    process.env.FILE_UPLOADS_ENABLED = "false"; assert.equal((await upload(randomUUID())).status, 409);
    console.log("PASS: additive migration, real API authentication/scope, private upload/download, durable replay, payload conflict, MIME/size checks, admission association, permission revocation, orphan cleanup and disabled local mode.");
  } finally { privateStorage()?.close(); await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => storage.close(() => resolve())); await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
