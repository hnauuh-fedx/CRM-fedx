ALTER TABLE "automation_execution_logs"
ADD COLUMN "last_progress_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "next_run_at" TIMESTAMP(6);

UPDATE "automation_execution_logs"
SET "last_progress_at" = COALESCE("completed_at", "started_at", CURRENT_TIMESTAMP)
WHERE "last_progress_at" IS NULL;

CREATE INDEX "idx_automation_exec_logs_stuck_detection"
ON "automation_execution_logs"("status", "last_progress_at", "next_run_at");
