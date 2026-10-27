-- Reassignment warning notifications show how long until the lead is transferred.
ALTER TABLE "notifications" ADD COLUMN "reassignment_monitor_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "action_due_at" TIMESTAMP(6);
ALTER TABLE "notifications" ADD COLUMN "countdown_hidden_at" TIMESTAMP(6);
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_reassignment_monitor_id_fkey" FOREIGN KEY ("reassignment_monitor_id") REFERENCES "automation_reassignment_monitors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_notifications_reassignment_monitor_id" ON "notifications"("reassignment_monitor_id");
