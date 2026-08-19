CREATE TABLE IF NOT EXISTS "automation_rule_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "trigger_type" VARCHAR(100) NOT NULL,
  "graph_data" JSONB NOT NULL,
  "institution_program_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_rule_versions_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_rule_versions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "uq_automation_rule_versions_rule_version" UNIQUE ("rule_id", "version")
);

CREATE INDEX IF NOT EXISTS "idx_automation_rule_versions_rule_created"
  ON "automation_rule_versions"("rule_id", "created_at", "id");

ALTER TABLE "automation_execution_logs"
  ADD COLUMN IF NOT EXISTS "rule_version_id" UUID,
  ADD COLUMN IF NOT EXISTS "requested_by" UUID,
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) NOT NULL DEFAULT 'event';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_execution_logs_rule_version_id_fkey') THEN
    ALTER TABLE "automation_execution_logs"
      ADD CONSTRAINT "automation_execution_logs_rule_version_id_fkey"
      FOREIGN KEY ("rule_version_id") REFERENCES "automation_rule_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_execution_logs_requested_by_fkey') THEN
    ALTER TABLE "automation_execution_logs"
      ADD CONSTRAINT "automation_execution_logs_requested_by_fkey"
      FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_automation_exec_logs_rule_version"
  ON "automation_execution_logs"("rule_version_id");
CREATE INDEX IF NOT EXISTS "idx_automation_exec_logs_requester"
  ON "automation_execution_logs"("requested_by", "started_at", "id");

CREATE TABLE IF NOT EXISTS "automation_node_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "execution_log_id" UUID NOT NULL,
  "node_id" VARCHAR(255) NOT NULL,
  "node_type" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'processing',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_source_handle" VARCHAR(100),
  "delay_minutes" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "action_completed_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  CONSTRAINT "automation_node_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_node_executions_execution_log_id_fkey"
    FOREIGN KEY ("execution_log_id") REFERENCES "automation_execution_logs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "uq_automation_node_exec_log_node" UNIQUE ("execution_log_id", "node_id")
);

CREATE INDEX IF NOT EXISTS "idx_automation_node_exec_status_started"
  ON "automation_node_executions"("status", "started_at", "id");
