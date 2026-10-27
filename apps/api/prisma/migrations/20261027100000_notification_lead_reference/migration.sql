-- Notifications about a lead keep a reference so the UI can open that lead.
ALTER TABLE "notifications" ADD COLUMN "lead_id" UUID;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_notifications_lead_id" ON "notifications"("lead_id");
