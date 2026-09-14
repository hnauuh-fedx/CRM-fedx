CREATE TABLE "zalo_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "oa_id" VARCHAR(100) NOT NULL,
  "oa_name" VARCHAR(255),
  "app_id" VARCHAR(100) NOT NULL,
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT NOT NULL,
  "access_token_expires_at" TIMESTAMP(6) NOT NULL,
  "refresh_token_expires_at" TIMESTAMP(6),
  "next_refresh_at" TIMESTAMP(6) NOT NULL,
  "last_refresh_at" TIMESTAMP(6),
  "last_refresh_error" TEXT,
  "refresh_failure_count" INTEGER NOT NULL DEFAULT 0,
  "token_version" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(50) NOT NULL DEFAULT 'active',
  "institution_program_id" UUID,
  "lead_source_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zalo_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zalo_connections_program_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE SET NULL,
  CONSTRAINT "zalo_connections_source_fkey" FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE RESTRICT,
  CONSTRAINT "zalo_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "uq_zalo_connections_app_oa" ON "zalo_connections"("app_id", "oa_id");
CREATE INDEX "idx_zalo_connections_refresh_due" ON "zalo_connections"("status", "next_refresh_at");
CREATE INDEX "idx_zalo_connections_program" ON "zalo_connections"("institution_program_id");

CREATE TABLE "zalo_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "zalo_message_id" VARCHAR(150) NOT NULL,
  "zalo_user_id" VARCHAR(100) NOT NULL,
  "direction" VARCHAR(20) NOT NULL,
  "event_name" VARCHAR(100) NOT NULL,
  "message_type" VARCHAR(50) NOT NULL,
  "message_text" TEXT,
  "sent_at" TIMESTAMP(6) NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "processing_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "processing_error" TEXT,
  "lead_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(6),
  CONSTRAINT "zalo_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zalo_messages_connection_fkey" FOREIGN KEY ("connection_id") REFERENCES "zalo_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "zalo_messages_lead_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "uq_zalo_messages_connection_message" ON "zalo_messages"("connection_id", "zalo_message_id");
CREATE INDEX "idx_zalo_messages_conversation" ON "zalo_messages"("connection_id", "zalo_user_id", "sent_at");
CREATE INDEX "idx_zalo_messages_processing" ON "zalo_messages"("processing_status", "created_at");

CREATE TABLE "zalo_lead_extractions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "zalo_user_id" VARCHAR(100) NOT NULL,
  "source_message_id" UUID NOT NULL,
  "extracted_data" JSONB,
  "confidence" DECIMAL(5,4),
  "status" VARCHAR(50) NOT NULL,
  "lead_id" UUID,
  "error_message" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zalo_lead_extractions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zalo_extractions_connection_fkey" FOREIGN KEY ("connection_id") REFERENCES "zalo_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "zalo_extractions_message_fkey" FOREIGN KEY ("source_message_id") REFERENCES "zalo_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "zalo_extractions_lead_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_zalo_extractions_conversation" ON "zalo_lead_extractions"("connection_id", "zalo_user_id", "created_at");
CREATE INDEX "idx_zalo_extractions_status" ON "zalo_lead_extractions"("status", "created_at");

INSERT INTO "permissions" ("id", "code", "name", "module")
VALUES
  (gen_random_uuid(), 'integration.view', 'Xem kênh kết nối', 'marketing'),
  (gen_random_uuid(), 'integration.manage', 'Quản lý kênh kết nối', 'marketing'),
  (gen_random_uuid(), 'integration.log.view', 'Xem lịch sử xử lý kênh kết nối', 'marketing')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "is_active" = TRUE;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role.id, permission.id
FROM "roles" AS role
JOIN "permissions" AS permission ON permission.code IN ('integration.view', 'integration.manage', 'integration.log.view')
WHERE role.code IN ('ADMIN', 'MARKETING_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
