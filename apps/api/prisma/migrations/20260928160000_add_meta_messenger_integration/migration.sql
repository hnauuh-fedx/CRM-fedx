CREATE TABLE "meta_oauth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state_hash" VARCHAR(64) NOT NULL,
    "user_access_token_encrypted" TEXT,
    "institution_program_id" UUID NOT NULL,
    "lead_source_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_oauth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" VARCHAR(100) NOT NULL,
    "page_name" VARCHAR(255),
    "page_access_token_encrypted" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "webhook_subscribed_at" TIMESTAMP(6),
    "last_checked_at" TIMESTAMP(6),
    "last_error" TEXT,
    "institution_program_id" UUID NOT NULL,
    "lead_source_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meta_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "meta_message_id" VARCHAR(255) NOT NULL,
    "sender_psid" VARCHAR(100) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "message_text" TEXT,
    "sent_at" TIMESTAMP(6) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "processing_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "processing_error" TEXT,
    "lead_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),
    CONSTRAINT "meta_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meta_user_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "sender_psid" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255),
    "last_synced_at" TIMESTAMP(6),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meta_lead_extractions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "sender_psid" VARCHAR(100) NOT NULL,
    "source_message_id" UUID NOT NULL,
    "extracted_data" JSONB,
    "confidence" DECIMAL(5,4),
    "status" VARCHAR(50) NOT NULL,
    "lead_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_lead_extractions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_oauth_sessions_state_hash_key" ON "meta_oauth_sessions"("state_hash");
CREATE INDEX "idx_meta_oauth_sessions_user_status" ON "meta_oauth_sessions"("created_by", "status", "expires_at");
CREATE UNIQUE INDEX "meta_connections_page_id_key" ON "meta_connections"("page_id");
CREATE INDEX "idx_meta_connections_program" ON "meta_connections"("institution_program_id", "updated_at");
CREATE INDEX "idx_meta_connections_status" ON "meta_connections"("status", "updated_at");
CREATE UNIQUE INDEX "uq_meta_messages_connection_message" ON "meta_messages"("connection_id", "meta_message_id");
CREATE INDEX "idx_meta_messages_conversation" ON "meta_messages"("connection_id", "sender_psid", "sent_at");
CREATE INDEX "idx_meta_messages_processing" ON "meta_messages"("processing_status", "created_at");
CREATE UNIQUE INDEX "uq_meta_user_profiles_connection_user" ON "meta_user_profiles"("connection_id", "sender_psid");
CREATE INDEX "idx_meta_user_profiles_connection_name" ON "meta_user_profiles"("connection_id", "display_name");
CREATE INDEX "idx_meta_extractions_conversation" ON "meta_lead_extractions"("connection_id", "sender_psid", "created_at");
CREATE INDEX "idx_meta_extractions_status" ON "meta_lead_extractions"("status", "created_at");
