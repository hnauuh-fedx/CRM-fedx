CREATE TABLE "lead_source_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "origin_id" UUID NOT NULL,
    "webhook_id" UUID,
    "request_id" UUID NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "note" TEXT,
    "details" JSONB,
    "received_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_source_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_source_occurrences_request_id_key" ON "lead_source_occurrences"("request_id");
CREATE INDEX "lead_source_occurrences_lead_id_received_at_id_idx" ON "lead_source_occurrences"("lead_id", "received_at", "id");
CREATE INDEX "lead_source_occurrences_origin_id_received_at_id_idx" ON "lead_source_occurrences"("origin_id", "received_at", "id");
CREATE INDEX "lead_source_occurrences_webhook_id_received_at_id_idx" ON "lead_source_occurrences"("webhook_id", "received_at", "id");

ALTER TABLE "lead_source_occurrences" ADD CONSTRAINT "lead_source_occurrences_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lead_source_occurrences" ADD CONSTRAINT "lead_source_occurrences_origin_id_fkey"
    FOREIGN KEY ("origin_id") REFERENCES "lead_origins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "lead_source_occurrences" ADD CONSTRAINT "lead_source_occurrences_webhook_id_fkey"
    FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

UPDATE webhooks SET duplicate_policy = 'UPDATE_EXISTING' WHERE duplicate_policy = 'CREATE_NEW';
