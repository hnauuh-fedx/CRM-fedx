ALTER TABLE "automation_rules"
ADD COLUMN "archived_at" TIMESTAMP(6),
ADD COLUMN "archived_by" UUID;

ALTER TABLE "automation_execution_logs"
ADD COLUMN "execution_actor_id" UUID;

CREATE INDEX "idx_automation_rules_archive_active_trigger"
ON "automation_rules"("archived_at", "is_active", "trigger_type");

CREATE INDEX "idx_automation_exec_logs_actor"
ON "automation_execution_logs"("execution_actor_id", "started_at", "id");

INSERT INTO "permissions" ("name", "code", "module", "description", "is_active")
VALUES (
  'Quản lý Rule Automation toàn hệ thống',
  'automation.manage_global',
  'system',
  'Cho phép xem và quản lý rule không giới hạn theo chương trình tuyển sinh khi tài khoản có phạm vi ALL.',
  TRUE
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "is_active" = TRUE;
