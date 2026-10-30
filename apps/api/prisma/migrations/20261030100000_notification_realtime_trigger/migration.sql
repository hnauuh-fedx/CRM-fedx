-- Realtime notification signal: the API LISTENs on this channel and tells the recipient's open
-- streams to refetch. NOTIFY is delivered only on commit, and Postgres collapses identical
-- payloads within one transaction, so a bulk insert sends one signal per recipient.
CREATE OR REPLACE FUNCTION notify_personal_notifications_changed() RETURNS trigger AS $$
DECLARE
  recipient uuid;
BEGIN
  FOR recipient IN SELECT DISTINCT user_id FROM changed_notifications WHERE user_id IS NOT NULL LOOP
    PERFORM pg_notify('crm_personal_notifications', recipient::text);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Transition tables allow only one event per trigger.
CREATE TRIGGER trg_notifications_realtime_insert
  AFTER INSERT ON notifications
  REFERENCING NEW TABLE AS changed_notifications
  FOR EACH STATEMENT EXECUTE FUNCTION notify_personal_notifications_changed();

CREATE TRIGGER trg_notifications_realtime_update
  AFTER UPDATE ON notifications
  REFERENCING NEW TABLE AS changed_notifications
  FOR EACH STATEMENT EXECUTE FUNCTION notify_personal_notifications_changed();
