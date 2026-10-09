ALTER TABLE "automation_reassignment_monitors"
ADD COLUMN "second_warning_due_at" TIMESTAMP(6),
ADD COLUMN "second_warned_at" TIMESTAMP(6);

CREATE INDEX "idx_automation_reassignment_second_warning_due"
ON "automation_reassignment_monitors"("status", "second_warning_due_at", "id");

CREATE INDEX "idx_audit_logs_entity_user_created"
ON "audit_logs"("entity_type", "entity_id", "user_id", "created_at");

CREATE INDEX "idx_lead_activities_lead_user_created"
ON "lead_activities"("lead_id", "user_id", "created_at");

CREATE INDEX "idx_lead_notes_lead_user_created"
ON "lead_notes"("lead_id", "user_id", "created_at");
