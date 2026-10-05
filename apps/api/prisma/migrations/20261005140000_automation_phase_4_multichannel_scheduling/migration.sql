CREATE TABLE "automation_schedule_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "scheduled_for" TIMESTAMP(6) NOT NULL,
  "bulk_job_id" UUID,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "error_message" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_schedule_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_schedule_dispatches_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_schedule_dispatches_bulk_job_id_fkey" FOREIGN KEY ("bulk_job_id") REFERENCES "automation_jobs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_automation_schedule_dispatch_rule_time" ON "automation_schedule_dispatches"("rule_id", "scheduled_for");
CREATE INDEX "idx_automation_schedule_dispatch_due" ON "automation_schedule_dispatches"("status", "scheduled_for", "id");

CREATE TABLE "automation_message_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_execution_id" UUID NOT NULL,
  "channel" VARCHAR(30) NOT NULL,
  "destination_hash" VARCHAR(64) NOT NULL,
  "destination_masked" VARCHAR(255) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "provider_delivery_id" VARCHAR(255),
  "error_code" VARCHAR(100),
  "error_message" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "sent_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_message_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_message_deliveries_node_execution_id_fkey" FOREIGN KEY ("node_execution_id") REFERENCES "automation_node_executions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "automation_message_deliveries_node_execution_id_key" ON "automation_message_deliveries"("node_execution_id");
CREATE INDEX "idx_automation_message_delivery_status" ON "automation_message_deliveries"("status", "created_at", "id");
CREATE INDEX "idx_automation_message_delivery_destination" ON "automation_message_deliveries"("channel", "destination_hash", "created_at");

CREATE TABLE "automation_contact_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL,
  "channel" VARCHAR(30) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'unknown',
  "source" VARCHAR(100),
  "updated_by" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_contact_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_contact_preferences_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_contact_preferences_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_automation_contact_preference_lead_channel" ON "automation_contact_preferences"("lead_id", "channel");
CREATE INDEX "idx_automation_contact_preference_status" ON "automation_contact_preferences"("channel", "status", "updated_at");

CREATE TABLE "automation_suppressions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID,
  "channel" VARCHAR(30) NOT NULL,
  "destination_hash" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(255),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_suppressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_suppressions_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_suppressions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX "idx_automation_suppression_lookup" ON "automation_suppressions"("channel", "destination_hash", "is_active");
CREATE INDEX "idx_automation_suppression_program" ON "automation_suppressions"("institution_program_id", "created_at", "id");

CREATE TABLE "automation_webhook_endpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID,
  "name" VARCHAR(255) NOT NULL,
  "url" TEXT NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "allowed_hosts" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_webhook_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_webhook_endpoints_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_webhook_endpoints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX "idx_automation_webhook_endpoint_scope" ON "automation_webhook_endpoints"("institution_program_id", "is_active", "name", "id");
