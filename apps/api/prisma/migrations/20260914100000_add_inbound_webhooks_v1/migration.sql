CREATE TABLE "webhooks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "target_module" VARCHAR(50) NOT NULL DEFAULT 'LEAD',
  "webhook_key" VARCHAR(100) NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  "created_by" UUID NOT NULL,
  "last_received_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhooks_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "webhook_field_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "webhook_id" UUID NOT NULL,
  "incoming_key" VARCHAR(150) NOT NULL,
  "crm_field" VARCHAR(100) NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "default_value" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_field_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_field_mappings_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "webhook_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "webhook_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "payload" JSONB NOT NULL,
  "mapped_payload" JSONB,
  "response_code" INTEGER NOT NULL,
  "error_code" VARCHAR(100),
  "error_message" TEXT,
  "record_id" UUID,
  "processing_time_ms" INTEGER NOT NULL,
  "received_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "webhook_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_requests_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "webhooks_webhook_key_key" ON "webhooks"("webhook_key");
CREATE INDEX "idx_webhooks_program_created" ON "webhooks"("institution_program_id", "created_at", "id");
CREATE INDEX "idx_webhooks_program_status" ON "webhooks"("institution_program_id", "status");
CREATE UNIQUE INDEX "webhook_field_mappings_webhook_id_incoming_key_key" ON "webhook_field_mappings"("webhook_id", "incoming_key");
CREATE UNIQUE INDEX "webhook_field_mappings_webhook_id_crm_field_key" ON "webhook_field_mappings"("webhook_id", "crm_field");
CREATE INDEX "idx_webhook_field_mappings_webhook" ON "webhook_field_mappings"("webhook_id");
CREATE UNIQUE INDEX "webhook_requests_request_id_key" ON "webhook_requests"("request_id");
CREATE INDEX "idx_webhook_requests_webhook_received" ON "webhook_requests"("webhook_id", "received_at", "id");
CREATE INDEX "idx_webhook_requests_received" ON "webhook_requests"("received_at");
CREATE INDEX "idx_webhook_requests_record" ON "webhook_requests"("record_id");

INSERT INTO "permissions" ("id", "code", "name", "module", "description", "is_active", "created_at")
VALUES
  (gen_random_uuid(), 'webhook.view', 'Xem webhook và nhật ký', 'system', 'Xem cấu hình inbound webhook và lịch sử request.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'webhook.manage', 'Quản lý webhook', 'system', 'Tạo, sửa, bật/tắt, xóa và đổi secret inbound webhook.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('webhook.view', 'webhook.manage')
WHERE r."code" = 'ADMIN'
ON CONFLICT DO NOTHING;
