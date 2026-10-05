ALTER TABLE "automation_jobs"
  ADD COLUMN IF NOT EXISTS "requested_by" UUID,
  ADD COLUMN IF NOT EXISTS "rule_id" UUID,
  ADD COLUMN IF NOT EXISTS "total_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "processed_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failed_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "prepared_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_automation_jobs_requester_created" ON "automation_jobs"("requested_by", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_automation_jobs_rule_created" ON "automation_jobs"("rule_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_automation_jobs_status_run" ON "automation_jobs"("status", "run_at", "id");

ALTER TABLE "automation_jobs"
  ADD CONSTRAINT "automation_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT "automation_jobs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "automation_assignment_cursors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "node_id" VARCHAR(255) NOT NULL,
  "last_assignee_id" UUID,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_assignment_cursors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_assignment_cursors_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_assignment_cursors_last_assignee_id_fkey" FOREIGN KEY ("last_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "uq_automation_assignment_cursor_rule_node" UNIQUE ("rule_id", "node_id")
);

CREATE INDEX IF NOT EXISTS "idx_automation_assignment_cursor_assignee" ON "automation_assignment_cursors"("last_assignee_id");

CREATE TABLE IF NOT EXISTS "automation_sla_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "dispatched_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_sla_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_sla_dispatches_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_sla_dispatches_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "uq_automation_sla_dispatch_rule_lead" UNIQUE ("rule_id", "lead_id")
);

CREATE INDEX IF NOT EXISTS "idx_automation_sla_dispatch_time" ON "automation_sla_dispatches"("dispatched_at", "id");

CREATE TABLE "automation_bulk_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bulk_job_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'prepared',
  "error_message" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_bulk_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_bulk_dispatches_bulk_job_id_fkey" FOREIGN KEY ("bulk_job_id") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_bulk_dispatches_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "uq_automation_bulk_dispatch_job_lead" UNIQUE ("bulk_job_id", "lead_id")
);

CREATE INDEX "idx_automation_bulk_dispatch_job_status" ON "automation_bulk_dispatches"("bulk_job_id", "status", "id");

ALTER TABLE "automation_execution_logs"
  ADD COLUMN "bulk_dispatch_id" UUID,
  ADD CONSTRAINT "automation_execution_logs_bulk_dispatch_id_fkey" FOREIGN KEY ("bulk_dispatch_id") REFERENCES "automation_bulk_dispatches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "automation_execution_logs_bulk_dispatch_id_key" ON "automation_execution_logs"("bulk_dispatch_id");
