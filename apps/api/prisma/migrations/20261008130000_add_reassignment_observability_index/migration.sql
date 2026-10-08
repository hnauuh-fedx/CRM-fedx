CREATE INDEX "idx_automation_reassignment_rule_status_processed"
ON "automation_reassignment_monitors"("rule_id", "status", "processed_at");
