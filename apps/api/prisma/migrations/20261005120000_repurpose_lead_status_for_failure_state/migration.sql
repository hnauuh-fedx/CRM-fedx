UPDATE "leads"
SET "status" = 'ACTIVE';

ALTER TABLE "leads"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
  ALTER COLUMN "status" SET NOT NULL;

CREATE INDEX "idx_leads_status_pipeline_stage"
  ON "leads"("status", "pipeline_stage_id");
