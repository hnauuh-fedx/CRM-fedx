ALTER TABLE "webhook_requests"
  ADD COLUMN "idempotency_key" VARCHAR(255),
  ADD COLUMN "payload_hash" CHAR(64),
  ADD COLUMN "source_ip" VARCHAR(64),
  ADD COLUMN "config_snapshot" JSONB,
  ADD COLUMN "last_error_category" VARCHAR(50),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cycle_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "last_attempt_at" TIMESTAMP(6),
  ADD COLUMN "next_retry_at" TIMESTAMP(6),
  ADD COLUMN "queued_at" TIMESTAMP(6),
  ADD COLUMN "processing_started_at" TIMESTAMP(6),
  ADD COLUMN "completed_at" TIMESTAMP(6),
  ADD COLUMN "dead_lettered_at" TIMESTAMP(6),
  ADD COLUMN "reprocessed_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "webhook_requests"
  ALTER COLUMN "response_code" DROP NOT NULL,
  ALTER COLUMN "processing_time_ms" SET DEFAULT 0,
  ALTER COLUMN "processed_at" DROP NOT NULL;

UPDATE "webhook_requests"
SET
  "status" = CASE WHEN "status" = 'SUCCESS' THEN 'SUCCEEDED' ELSE "status" END,
  "completed_at" = "processed_at",
  "attempt_count" = CASE WHEN "status" IN ('SUCCESS', 'FAILED') THEN 1 ELSE 0 END;

CREATE UNIQUE INDEX "uq_webhook_requests_idempotency"
  ON "webhook_requests"("webhook_id", "idempotency_key");
CREATE INDEX "idx_webhook_requests_recovery"
  ON "webhook_requests"("status", "next_retry_at", "received_at");

CREATE TABLE "webhook_request_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "error_code" VARCHAR(100),
  "error_message" TEXT,
  "error_category" VARCHAR(50),
  "worker_id" VARCHAR(255),
  "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(6),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_request_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_request_attempts_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "webhook_requests"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_webhook_request_attempt_number"
  ON "webhook_request_attempts"("request_id", "attempt_number");
CREATE INDEX "idx_webhook_request_attempts_request"
  ON "webhook_request_attempts"("request_id", "started_at");
