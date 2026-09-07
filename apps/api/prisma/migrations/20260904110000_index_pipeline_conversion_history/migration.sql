CREATE INDEX "idx_lead_status_histories_lead_stage_time"
  ON "lead_status_histories"("lead_id", "to_stage_id", "changed_at");
