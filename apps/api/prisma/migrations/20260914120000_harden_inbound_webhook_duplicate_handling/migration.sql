ALTER TABLE "webhooks"
ADD COLUMN "duplicate_policy" VARCHAR(30) NOT NULL DEFAULT 'CREATE_NEW';

ALTER TABLE "webhook_requests"
ADD COLUMN "action" VARCHAR(30) NOT NULL DEFAULT 'FAILED',
ADD COLUMN "duplicate_record_id" UUID;

UPDATE "webhook_requests"
SET "action" = CASE
  WHEN "status" = 'SUCCESS' THEN 'CREATED'
  ELSE 'FAILED'
END;

CREATE INDEX "idx_webhook_requests_duplicate_record"
ON "webhook_requests"("duplicate_record_id");
