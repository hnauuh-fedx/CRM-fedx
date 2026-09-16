# Deployment

## Inbound Webhook V2

Inbound webhook production processing requires PostgreSQL and Redis. Run the API and webhook worker as separate processes from the same release:

```powershell
npm run start --workspace apps/api
npm run worker:webhooks --workspace apps/api
```

Only one worker process command is required per replica. BullMQ safely distributes jobs when multiple intentional worker replicas are deployed. The worker shuts down gracefully on `SIGINT` and `SIGTERM`.

Required and supported environment variables:

```text
REDIS_URL=redis://localhost:6379
WEBHOOK_QUEUE_ENABLED=true
WEBHOOK_WORKER_CONCURRENCY=10
WEBHOOK_MAX_ATTEMPTS=5
WEBHOOK_PROCESSING_STALE_SECONDS=600
WEBHOOK_RATE_LIMIT_PER_MINUTE=300
WEBHOOK_LOG_RETENTION_DAYS=30
```

The public contract is asynchronous:

```http
POST /api/webhooks/{webhook_key}
X-Webhook-Secret: ...
Idempotency-Key: external-event-id
Content-Type: application/json
```

A durable request accepted by the queue returns `202 Accepted` with `request_id`; it does not return a Lead ID. `Idempotency-Key` is optional but recommended. Reusing a key with the same canonical JSON payload returns the original request. Reusing it with a different payload returns `409 IDEMPOTENCY_KEY_CONFLICT`.

Automatic retries use the webhook configuration snapshot captured at ingestion. Manual reprocessing uses the original masked payload with the current webhook mapping and policy. Attempts are finite and exhausted transient failures become `DEAD_LETTER`.

Rate limiting is shared through Redis at 300 requests/minute/webhook by default and runs before bcrypt verification. Redis failure is fail-closed with HTTP `503`; enqueue failure is persisted as `QUEUE_FAILED` and also returns `503` so the sender may retry safely.

Recovery and retention commands:

```powershell
npm run maintenance:webhook-queue-recover --workspace apps/api
npm run maintenance:webhook-logs --workspace apps/api
```

Schedule queue recovery periodically. It re-enqueues durable `RECEIVED`, `QUEUE_FAILED`, due `RETRYING`, and stale `PROCESSING` requests, but never automatically re-enqueues terminal `SUCCEEDED`, `FAILED`, or `DEAD_LETTER` requests.

`QUEUED` rows without `queued_at` are unconfirmed DB-to-Redis handoffs and are also recovered. This closes the process-crash window after the durable DB claim but before `queue.add()` returns.

`GET /api/settings/webhooks/operations` exposes only the selected program's durable request/attempt counts, durable queue depth/lag, one-minute success throughput, and processing-duration aggregate. Queue availability is global, but global Redis queue counts and process-global metrics are intentionally not returned to program-scoped users.
