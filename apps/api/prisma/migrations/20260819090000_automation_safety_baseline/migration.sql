-- Baseline the automation tables that already exist in the Prisma schema.
-- IF NOT EXISTS keeps this migration safe for environments that previously used db push.

CREATE TABLE IF NOT EXISTS "automation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" VARCHAR(100) NOT NULL,
  "payload" JSONB,
  "status" VARCHAR(50) DEFAULT 'pending',
  "run_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sla_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "module" VARCHAR(100),
  "duration_minutes" INTEGER NOT NULL,
  "action" VARCHAR(255),
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sla_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "trigger_type" VARCHAR(100) NOT NULL,
  "graph_data" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_rules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "automation_rules_institution_program_id_fkey"
    FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "automation_execution_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'running',
  "context_data" JSONB,
  "error_message" TEXT,
  "started_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(6),
  CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_execution_logs_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_automation_rules_active_trigger"
  ON "automation_rules"("is_active", "trigger_type");
CREATE INDEX IF NOT EXISTS "idx_automation_rules_program_created_page"
  ON "automation_rules"("institution_program_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_automation_rules_created_page"
  ON "automation_rules"("created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_automation_exec_logs_rule_started_page"
  ON "automation_execution_logs"("rule_id", "started_at", "id");
CREATE INDEX IF NOT EXISTS "idx_automation_exec_logs_status_started_page"
  ON "automation_execution_logs"("status", "started_at", "id");
