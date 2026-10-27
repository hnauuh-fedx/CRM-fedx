-- Keeps the transition note chosen when a lead enters a pipeline stage.
ALTER TABLE "lead_status_histories" ADD COLUMN "note" TEXT;
