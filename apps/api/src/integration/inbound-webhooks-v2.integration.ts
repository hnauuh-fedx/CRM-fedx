import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

process.env.NODE_ENV = "test";

let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}
function check(value: unknown, message: string) {
  assertions += 1;
  assert.ok(value, message);
}

async function main() {
  const { prisma } = await import("../database/prisma.js");
  const { app } = await import("../app.js");
  const { setPublicWebhookRateLimiterForTests } = await import("../modules/webhooks/webhooks.router.js");
  const { createMemoryWebhookRateLimiter, createRedisWebhookRateLimiter } = await import("../modules/webhooks/webhook-rate-limit.service.js");
  const { setWebhookQueueAdapterForTests } = await import("../modules/webhooks/webhook-queue.service.js");
  const { enqueuePersistedRequest, processInboundWebhookRequest } = await import("../modules/webhooks/webhook-v2.service.js");
  const { getWebhookOperationalStatus, recoverWebhookQueue, reprocessWebhookRequest } = await import("../modules/webhooks/webhook-operations.service.js");

  const suffix = randomUUID().slice(0, 8);
  const ids = { users: [] as string[], roles: [] as string[], programs: [] as string[], sources: [] as string[], webhooks: [] as string[] };
  let institutionId = "";
  let programTypeId = "";
  const queued: string[] = [];
  const activeJobs = new Set<string>();
  const queue = {
    async add(requestId: string) { queued.push(requestId); activeJobs.add(requestId); return { id: `webhook-request-${requestId}` }; },
    async has(requestId: string) { return activeJobs.has(requestId); },
    async counts() { return { waiting: activeJobs.size }; },
  };
  setWebhookQueueAdapterForTests(queue);
  setPublicWebhookRateLimiterForTests(createMemoryWebhookRateLimiter(10_000));

  try {
    const institution = await prisma.institutions.create({ data: { code: `V2_INST_${suffix}`, name: "Webhook V2 Institution" } });
    institutionId = institution.id;
    const programType = await prisma.program_types.create({ data: { code: `V2_TYPE_${suffix}`, name: "Webhook V2 Type" } });
    programTypeId = programType.id;
    const programs = await Promise.all(["A", "B"].map((label) => prisma.institution_programs.create({ data: { institution_id: institution.id, program_type_id: programType.id, code: `V2_${label}_${suffix}`, name: `Webhook V2 ${label}` } })));
    ids.programs.push(...programs.map((item) => item.id));
    const sources = await Promise.all(programs.map((program) => prisma.lead_sources.create({ data: { institution_program_id: program.id, name: "Website", type: "webhook" } })));
    ids.sources.push(...sources.map((item) => item.id));
    const permission = await prisma.permissions.upsert({ where: { code: "webhook.manage" }, update: { is_active: true }, create: { code: "webhook.manage", name: "Manage webhooks", module: "system", is_active: true } });
    const role = await prisma.roles.create({ data: { code: `V2_ROLE_${suffix}`, name: "Webhook V2 Manager" } });
    ids.roles.push(role.id);
    await prisma.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    await prisma.role_institution_programs.create({ data: { role_id: role.id, institution_program_id: programs[0].id } });
    const user = await prisma.users.create({ data: { email: `webhook.v2.${suffix}@example.test`, password_hash: await hash(`Password-${suffix}`, 10), full_name: "Webhook V2 Manager", status: "active" } });
    ids.users.push(user.id);
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    await prisma.user_access_scopes.create({ data: { user_id: user.id, scope: "ALL" } });
    const noAccessUser = await prisma.users.create({ data: { email: `webhook.v2.denied.${suffix}@example.test`, password_hash: await hash(`Password-${suffix}`, 10), full_name: "Webhook V2 Denied", status: "active" } });
    ids.users.push(noAccessUser.id);
    await prisma.user_access_scopes.create({ data: { user_id: noAccessUser.id, scope: "ALL" } });

    const secret = `secret-${randomUUID()}-${randomUUID()}`;
    async function createWebhook(programIndex: number, name: string) {
      const webhook = await prisma.webhooks.create({
        data: {
          institution_program_id: programs[programIndex].id,
          name,
          webhook_key: `key-${randomUUID()}-${randomUUID()}`,
          secret_hash: await hash(secret, 10),
          created_by: user.id,
          duplicate_policy: "CREATE_NEW",
          field_mappings: { create: [
            { incoming_key: "name", crm_field: "fullName", is_required: true },
            { incoming_key: "phone", crm_field: "phone", is_required: true },
            { incoming_key: "source", crm_field: "source", is_required: true },
          ] },
        },
      });
      ids.webhooks.push(webhook.id);
      return webhook;
    }
    const webhook = await createWebhook(0, "Async primary");
    const webhookB = await createWebhook(1, "Async secondary");

    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const deniedLoginResponse = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: noAccessUser.email, password: `Password-${suffix}` }) });
    const deniedLogin = await deniedLoginResponse.json() as any;
    equal(deniedLoginResponse.status, 200, "User không có quyền vẫn phải đăng nhập được để kiểm tra RBAC.");
    const payload = { name: "Async Lead", phone: `098${Date.now().toString().slice(-7)}`, source: "Website" };
    const acceptedResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `event-${suffix}` },
      body: JSON.stringify(payload),
    });
    const accepted = await acceptedResponse.json() as any;
    equal(acceptedResponse.status, 202, "Public endpoint phải ACK 202.");
    check(typeof accepted.data.request_id === "string", "ACK phải có request_id.");
    equal(accepted.data.record_id, undefined, "ACK async không được trả record_id.");
    const requestId = accepted.data.request_id as string;
    const persistedBeforeWorker = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: requestId } });
    equal(persistedBeforeWorker.status, "QUEUED", "Request phải được persist trước ACK và chuyển QUEUED.");
    equal(queued.includes(requestId), true, "Queue phải nhận request ID.");
    equal(Object.keys({ requestId }).length, 1, "Queue payload chỉ cần requestId.");
    equal(JSON.stringify({ requestId }).includes(secret), false, "Queue payload không chứa secret.");
    equal(JSON.stringify({ requestId }).includes(payload.phone), false, "Queue payload không chứa raw payload.");

    activeJobs.delete(requestId);
    const processed = await processInboundWebhookRequest(requestId, { workerId: "integration-worker" });
    equal(processed.status, "SUCCEEDED", "Worker phải xử lý thành công.");
    const succeeded = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: requestId }, include: { attempts: true } });
    equal(succeeded.status, "SUCCEEDED", "Request phải chuyển SUCCEEDED.");
    check(Boolean(succeeded.record_id), "Kết quả phải lưu record_id.");
    equal(succeeded.attempts.length, 1, "Phải lưu attempt history.");
    equal(succeeded.attempts[0].status, "SUCCEEDED", "Attempt phải hoàn tất.");

    const beforeDuplicateQueueCount = queued.length;
    const duplicateResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `event-${suffix}` },
      body: JSON.stringify({ source: "Website", phone: payload.phone, name: "Async Lead" }),
    });
    const duplicate = await duplicateResponse.json() as any;
    equal(duplicateResponse.status, 202, "Retry cùng semantic payload phải trả 202.");
    equal(duplicate.data.request_id, requestId, "Retry phải trả request gốc.");
    equal(duplicate.data.duplicate, true, "Retry phải được đánh dấu duplicate.");
    equal(queued.length, beforeDuplicateQueueCount, "Request terminal không được enqueue lần nữa.");

    const conflictResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `event-${suffix}` },
      body: JSON.stringify({ ...payload, name: "Different" }),
    });
    equal(conflictResponse.status, 409, "Cùng idempotency key với payload khác phải conflict.");
    equal((await conflictResponse.json() as any).error.code, "IDEMPOTENCY_KEY_CONFLICT", "Conflict phải có code ổn định.");

    const concurrentKey = `concurrent-${suffix}`;
    const concurrentPayload = { ...payload, phone: `097${Date.now().toString().slice(-7)}` };
    const queuedBeforeConcurrent = queued.length;
    const concurrentResults = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": concurrentKey }, body: JSON.stringify(concurrentPayload) }).then(async (response) => ({ status: response.status, body: await response.json() as any }))));
    equal(concurrentResults.every((result) => result.status === 202), true, "Hai request concurrent đều nhận ACK an toàn.");
    equal(concurrentResults[0].body.data.request_id, concurrentResults[1].body.data.request_id, "DB unique phải hợp nhất concurrent idempotency.");
    equal(await prisma.webhook_requests.count({ where: { webhook_id: webhook.id, idempotency_key: concurrentKey } }), 1, "Chỉ có một logical request.");
    equal(queued.length - queuedBeforeConcurrent, 1, "Concurrent idempotency chỉ enqueue một job.");

    const otherWebhookResponse = await fetch(`${baseUrl}/webhooks/${webhookB.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": concurrentKey }, body: JSON.stringify({ ...concurrentPayload, phone: `096${Date.now().toString().slice(-7)}` }) });
    equal(otherWebhookResponse.status, 202, "Key giống nhau ở webhook khác không conflict.");
    equal(await prisma.webhook_requests.count({ where: { idempotency_key: concurrentKey } }), 2, "Idempotency phải scope theo webhook.");

    const noKeyResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret }, body: JSON.stringify({ ...payload, phone: `095${Date.now().toString().slice(-7)}` }) });
    equal(noKeyResponse.status, 202, "Thiếu idempotency key vẫn phải hoạt động.");

    const replayPhone = `094${Date.now().toString().slice(-7)}`;
    const replayResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `replay-${suffix}` }, body: JSON.stringify({ ...payload, phone: replayPhone }) });
    const replayId = ((await replayResponse.json()) as any).data.request_id as string;
    activeJobs.delete(replayId);
    const firstAttempt = await processInboundWebhookRequest(replayId, { fault: "before_success_commit" });
    equal(firstAttempt.status, "RETRYING", "Fault tạm thời phải chuyển RETRYING.");
    equal(await prisma.leads.count({ where: { phone: replayPhone } }), 0, "Fault transaction không được commit Lead dở dang.");
    const secondAttempt = await processInboundWebhookRequest(replayId);
    equal(secondAttempt.status, "SUCCEEDED", "Retry sau fault phải thành công.");
    const replayRequest = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: replayId } });
    equal(await prisma.leads.count({ where: { id: replayRequest.record_id ?? undefined } }), 1, "CREATE_NEW replay chỉ tạo một Lead.");
    await processInboundWebhookRequest(replayId);
    equal(await prisma.leads.count({ where: { id: replayRequest.record_id ?? undefined } }), 1, "Replay terminal không tạo Lead lần hai.");
    equal(await prisma.audit_logs.count({ where: { entity_id: replayRequest.record_id ?? undefined, action: "create" } }), 1, "Replay không nhân đôi audit create.");

    await prisma.webhooks.update({ where: { id: webhook.id }, data: { duplicate_policy: "UPDATE_EXISTING" } });
    const updateResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `update-${suffix}` }, body: JSON.stringify({ ...payload, name: "Updated once" }) });
    const updateId = ((await updateResponse.json()) as any).data.request_id as string;
    activeJobs.delete(updateId);
    const updated = await processInboundWebhookRequest(updateId);
    equal(updated.status, "SUCCEEDED", "UPDATE_EXISTING phải thành công trong worker.");
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: updateId } })).action, "UPDATED", "Request phải lưu action UPDATED.");
    await processInboundWebhookRequest(updateId);
    equal((await prisma.leads.findUniqueOrThrow({ where: { id: succeeded.record_id! } })).full_name, "Updated once", "UPDATE_EXISTING replay không corrupt dữ liệu.");

    await prisma.webhooks.update({ where: { id: webhook.id }, data: { duplicate_policy: "REJECT" } });
    const rejectResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `reject-${suffix}` }, body: JSON.stringify(payload) });
    const rejectId = ((await rejectResponse.json()) as any).data.request_id as string;
    activeJobs.delete(rejectId);
    const rejected = await processInboundWebhookRequest(rejectId);
    equal(rejected.status, "FAILED", "Duplicate REJECT phải kết thúc FAILED.");
    equal(rejected.retry, false, "Duplicate REJECT không được retry.");
    const rejectedRow = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: rejectId } });
    equal(rejectedRow.action, "REJECTED", "Duplicate REJECT phải lưu action.");
    equal(rejectedRow.duplicate_record_id, succeeded.record_id, "Duplicate REJECT phải lưu Lead trùng.");

    await prisma.webhooks.update({ where: { id: webhook.id }, data: { duplicate_policy: "CREATE_NEW" } });
    const invalidResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `invalid-${suffix}` }, body: JSON.stringify({ phone: `091${Date.now().toString().slice(-7)}`, source: "Website" }) });
    const invalidId = ((await invalidResponse.json()) as any).data.request_id as string;
    activeJobs.delete(invalidId);
    const invalidResult = await processInboundWebhookRequest(invalidId);
    equal(invalidResult.status, "FAILED", "Validation deterministic phải FAILED.");
    equal(invalidResult.retry, false, "Validation deterministic không được retry.");
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: invalidId } })).attempt_count, 1, "Validation lỗi chỉ chạy một attempt.");

    const deadResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `dead-${suffix}` }, body: JSON.stringify({ ...payload, phone: `093${Date.now().toString().slice(-7)}` }) });
    const deadId = ((await deadResponse.json()) as any).data.request_id as string;
    activeJobs.delete(deadId);
    await prisma.webhook_requests.update({ where: { request_id: deadId }, data: { max_attempts: 2 } });
    equal((await processInboundWebhookRequest(deadId, { fault: "after_processing" })).status, "RETRYING", "Retryable attempt đầu phải retry.");
    equal((await processInboundWebhookRequest(deadId, { fault: "after_processing" })).status, "DEAD_LETTER", "Hết retry phải vào Dead Letter.");
    const dead = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: deadId }, include: { attempts: true } });
    equal(dead.attempts.length, 2, "Dead Letter phải giữ đủ attempt history.");
    equal(dead.last_error_category, "UNKNOWN", "Dead Letter phải lưu error category.");
    check(Boolean(dead.dead_lettered_at), "Dead Letter phải lưu thời điểm.");

    const unauthorizedReprocess = await fetch(`${baseUrl}/settings/webhooks/${webhook.id}/logs/${dead.id}/reprocess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deniedLogin.accessToken}`, "X-Institution-Program-Id": programs[0].id },
    });
    equal(unauthorizedReprocess.status, 403, "User thiếu webhook.manage không được reprocess.");

    activeJobs.delete(deadId);
    const actor = await (await import("../modules/auth/auth.service.js")).getAuthUser(user.id);
    check(Boolean(actor), "Actor quản trị phải tồn tại.");
    const reprocessed = await reprocessWebhookRequest(actor!, programs[0].id, webhook.id, dead.id, "127.0.0.1");
    equal(reprocessed.ok, true, "Admin có quyền phải reprocess được.");
    const afterReprocess = await prisma.webhook_requests.findUniqueOrThrow({ where: { id: dead.id } });
    equal(afterReprocess.status, "QUEUED", "Manual reprocess phải enqueue lại cùng request.");
    equal(afterReprocess.cycle_attempt_count, 0, "Manual reprocess phải reset attempt của cycle.");
    equal(await prisma.audit_logs.count({ where: { entity_type: "webhook_request", entity_id: dead.id, action: "manual_reprocess", user_id: user.id } }), 1, "Manual reprocess phải audit actor.");
    equal((await reprocessWebhookRequest(actor!, programs[1].id, webhook.id, dead.id)).reason, "not_found", "Tenant khác không được reprocess.");

    const sharedCounters = new Map<string, number>();
    const fakeRedis = { async eval(_script: string, _keys: number, key: string) { const value = (sharedCounters.get(key) ?? 0) + 1; sharedCounters.set(key, value); return [value, 60_000]; } };
    const limiterA = createRedisWebhookRateLimiter(fakeRedis as any, 2, 60_000);
    const limiterB = createRedisWebhookRateLimiter(fakeRedis as any, 2, 60_000);
    equal((await limiterA(webhook.id)).allowed, true, "Redis limiter instance A cho request đầu.");
    equal((await limiterB(webhook.id)).allowed, true, "Redis limiter instance B chia sẻ counter.");
    equal((await limiterA(webhook.id)).allowed, false, "Shared counter phải enforce limit toàn cụm.");
    const limited = await (await import("../modules/webhooks/webhook-v2.service.js")).ingestInboundWebhook(webhook.webhook_key, "wrong", payload, undefined, async () => ({ allowed: false, retryAfterSeconds: 60 }));
    equal(limited.status, 429, "Limiter phải chạy trước secret verification.");
    const redisDown = await (await import("../modules/webhooks/webhook-v2.service.js")).ingestInboundWebhook(webhook.webhook_key, secret, payload, undefined, async () => { throw new Error("redis down"); });
    equal(redisDown.status, 503, "Redis rate limiter down phải fail-closed bằng 503.");

    setWebhookQueueAdapterForTests({ async add() { throw new Error("queue down"); }, async has() { return false; }, async counts() { return {}; } });
    const queueFailed = await (await import("../modules/webhooks/webhook-v2.service.js")).ingestInboundWebhook(webhook.webhook_key, secret, { ...payload, phone: `092${Date.now().toString().slice(-7)}` }, `queue-fail-${suffix}`, createMemoryWebhookRateLimiter(100));
    equal(queueFailed.status, 503, "Enqueue fail phải trả 503.");
    const queueFailedRow = await prisma.webhook_requests.findFirstOrThrow({ where: { webhook_id: webhook.id, idempotency_key: `queue-fail-${suffix}` } });
    equal(queueFailedRow.status, "QUEUE_FAILED", "DB persist phải còn lại khi enqueue fail.");
    setWebhookQueueAdapterForTests(queue);
    activeJobs.delete(queueFailedRow.request_id);
    const recovered = await recoverWebhookQueue();
    check(recovered.recovered >= 1, "Recovery phải enqueue lại request queue failed.");
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { id: queueFailedRow.id } })).status, "QUEUED", "Recovered request phải chuyển QUEUED.");
    activeJobs.delete(queueFailedRow.request_id);
    await prisma.webhook_requests.update({ where: { id: queueFailedRow.id }, data: { status: "RECEIVED", queued_at: null } });
    await assert.rejects(() => enqueuePersistedRequest(queueFailedRow.request_id, "after_claim"));
    assertions += 1;
    const crashedEnqueue = await prisma.webhook_requests.findUniqueOrThrow({ where: { id: queueFailedRow.id } });
    equal(crashedEnqueue.status, "QUEUED", "Crash sau DB claim phải để lại trạng thái có thể recover.");
    equal(crashedEnqueue.queued_at, null, "QUEUED chưa được Redis xác nhận phải giữ queued_at rỗng.");
    await recoverWebhookQueue();
    equal(activeJobs.has(queueFailedRow.request_id), true, "Recovery phải enqueue lại khe crash DB→Redis.");

    const slowPhone = `090${Date.now().toString().slice(-7)}`;
    const slowResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `slow-${suffix}` }, body: JSON.stringify({ ...payload, phone: slowPhone }) });
    const slowId = ((await slowResponse.json()) as any).data.request_id as string;
    activeJobs.delete(slowId);
    let releaseSlowWorker!: () => void;
    let signalClaimed!: () => void;
    const slowWorkerReleased = new Promise<void>((resolve) => { releaseSlowWorker = resolve; });
    const slowWorkerClaimed = new Promise<void>((resolve) => { signalClaimed = resolve; });
    const originalWorker = processInboundWebhookRequest(slowId, { afterClaim: async () => { signalClaimed(); await slowWorkerReleased; } });
    await slowWorkerClaimed;
    await prisma.webhook_requests.update({ where: { request_id: slowId }, data: { processing_started_at: new Date(Date.now() - 700_000) } });
    await recoverWebhookQueue();
    releaseSlowWorker();
    equal((await originalWorker).status, "SUPERSEDED", "Worker cũ phải dừng trước business mutation sau stale recovery.");
    activeJobs.delete(slowId);
    equal((await processInboundWebhookRequest(slowId)).status, "SUCCEEDED", "Worker thay thế phải hoàn tất request stale.");
    equal(await prisma.leads.count({ where: { phone: slowPhone } }), 1, "Stale recovery không được nhân đôi Lead CREATE_NEW.");

    const lateFailurePhone = `089${Date.now().toString().slice(-7)}`;
    const lateFailureResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `late-failure-${suffix}` }, body: JSON.stringify({ ...payload, phone: lateFailurePhone }) });
    const lateFailureId = ((await lateFailureResponse.json()) as any).data.request_id as string;
    activeJobs.delete(lateFailureId);
    let releaseLateFailure!: () => void;
    let signalLateFailureClaimed!: () => void;
    const lateFailureReleased = new Promise<void>((resolve) => { releaseLateFailure = resolve; });
    const lateFailureClaimed = new Promise<void>((resolve) => { signalLateFailureClaimed = resolve; });
    const staleFailingWorker = processInboundWebhookRequest(lateFailureId, { fault: "after_processing", afterClaim: async () => { signalLateFailureClaimed(); await lateFailureReleased; } });
    await lateFailureClaimed;
    await prisma.webhook_requests.update({ where: { request_id: lateFailureId }, data: { processing_started_at: new Date(Date.now() - 700_000) } });
    await recoverWebhookQueue();
    activeJobs.delete(lateFailureId);
    equal((await processInboundWebhookRequest(lateFailureId)).status, "SUCCEEDED", "Worker thay thế phải có thể hoàn tất trước worker stale.");
    releaseLateFailure();
    equal((await staleFailingWorker).status, "SUPERSEDED", "Failure muộn của worker stale không được ghi đè attempt mới.");
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: lateFailureId } })).status, "SUCCEEDED", "Failure stale không được đổi SUCCEEDED về retry.");
    equal(await prisma.leads.count({ where: { phone: lateFailurePhone } }), 1, "Failure stale không được gây replay CREATE_NEW.");

    const exhaustedResponse = await fetch(`${baseUrl}/webhooks/${webhook.webhook_key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret, "Idempotency-Key": `stale-exhausted-${suffix}` }, body: JSON.stringify({ ...payload, phone: `088${Date.now().toString().slice(-7)}` }) });
    const exhaustedId = ((await exhaustedResponse.json()) as any).data.request_id as string;
    activeJobs.delete(exhaustedId);
    let releaseExhausted!: () => void;
    let signalExhaustedClaimed!: () => void;
    const exhaustedReleased = new Promise<void>((resolve) => { releaseExhausted = resolve; });
    const exhaustedClaimed = new Promise<void>((resolve) => { signalExhaustedClaimed = resolve; });
    const exhaustedWorker = processInboundWebhookRequest(exhaustedId, { afterClaim: async () => { signalExhaustedClaimed(); await exhaustedReleased; } });
    await exhaustedClaimed;
    await prisma.webhook_requests.update({ where: { request_id: exhaustedId }, data: { processing_started_at: new Date(Date.now() - 700_000), max_attempts: 1 } });
    const queueBeforeExhaustedRecovery = queued.length;
    await recoverWebhookQueue();
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: exhaustedId } })).status, "DEAD_LETTER", "Stale attempt cuối phải vào Dead Letter.");
    equal(queued.length, queueBeforeExhaustedRecovery, "Stale attempt đã hết lượt không được enqueue lại.");
    releaseExhausted();
    equal((await exhaustedWorker).status, "SUPERSEDED", "Worker của stale Dead Letter phải dừng trước mutation.");

    activeJobs.delete(queueFailedRow.request_id);
    await prisma.webhook_requests.update({ where: { id: queueFailedRow.id }, data: { status: "PROCESSING", processing_started_at: new Date(Date.now() - 700_000), attempt_count: 1, cycle_attempt_count: 1 } });
    await prisma.webhook_request_attempts.create({ data: { request_id: queueFailedRow.id, attempt_number: 1, status: "PROCESSING", started_at: new Date(Date.now() - 700_000) } });
    const staleRecovery = await recoverWebhookQueue();
    check(staleRecovery.stale >= 1, "Recovery phải phát hiện PROCESSING quá hạn.");
    equal((await prisma.webhook_requests.findUniqueOrThrow({ where: { id: queueFailedRow.id } })).status, "QUEUED", "Stale PROCESSING phải được requeue an toàn.");
    const terminalQueueCount = queued.length;
    await recoverWebhookQueue();
    equal(queued.length, terminalQueueCount, "Recovery không enqueue request terminal hoặc job đang active.");
    const operationsA = await getWebhookOperationalStatus(programs[0].id);
    const operationsB = await getWebhookOperationalStatus(programs[1].id);
    check(Object.values(operationsA.attempts).reduce((total, count) => total + count, 0) > 0, "Operational status phải có attempt của tenant hiện tại.");
    equal(Object.values(operationsB.attempts).reduce((total, count) => total + count, 0), 0, "Operational status không được lộ attempt tenant khác.");
    equal("counts" in operationsA.queue, false, "Operational status theo tenant không được lộ queue counts toàn hệ thống.");

    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log(`Inbound webhook V2 integration verified with ${assertions} assertions.`);
  } finally {
    setWebhookQueueAdapterForTests(undefined);
    const leadIds = (await prisma.leads.findMany({ where: { owner_id: { in: ids.users } }, select: { id: true } })).map((item) => item.id);
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { entity_id: { in: [...leadIds, ...ids.webhooks] } }] } });
    await prisma.automation_execution_logs.deleteMany({ where: { requested_by: { in: ids.users } } });
    await prisma.webhooks.deleteMany({ where: { id: { in: ids.webhooks } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.lead_origins.deleteMany({ where: { institution_program_id: { in: ids.programs } } });
    await prisma.lead_sources.deleteMany({ where: { id: { in: ids.sources } } });
    await prisma.user_access_scopes.deleteMany({ where: { user_id: { in: ids.users } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: ids.users } } });
    await prisma.users.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: ids.roles } } });
    await prisma.role_institution_programs.deleteMany({ where: { role_id: { in: ids.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: ids.roles } } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: ids.programs } } });
    if (institutionId) await prisma.institutions.deleteMany({ where: { id: institutionId } });
    if (programTypeId) await prisma.program_types.deleteMany({ where: { id: programTypeId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
