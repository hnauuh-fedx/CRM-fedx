-- Identifies the current manual unassignment without relying on timestamps.
ALTER TABLE "leads" ADD COLUMN "manual_unassignment_event_id" UUID;
