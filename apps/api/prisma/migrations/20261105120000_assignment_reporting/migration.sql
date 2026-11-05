-- No backfill: current lead attribution cannot reconstruct historical facts reliably.
BEGIN;
CREATE TABLE IF NOT EXISTS lead_assignment_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(400) NOT NULL UNIQUE,
  event_type varchar(30) NOT NULL CHECK (event_type IN ('ASSIGNED','WARNING_1','WARNING_2','WITHDRAWN')),
  occurred_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assignment_id uuid NOT NULL,
  cause_assignment_id uuid,
  lead_id uuid NOT NULL,
  institution_program_id uuid,
  owner_id uuid,
  assignee_id uuid NOT NULL,
  assignee_name varchar(255) NOT NULL,
  department_id uuid,
  department_name varchar(255),
  source_id uuid,
  source_name varchar(255),
  campaign_ids uuid[] NOT NULL DEFAULT '{}',
  campaign_names text[] NOT NULL DEFAULT '{}',
  method varchar(20) NOT NULL DEFAULT 'MANUAL' CHECK (method IN ('MANUAL','AUTOMATIC')),
  rule_id uuid,
  rule_name varchar(255),
  node_id varchar(255),
  reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignment_report_program_time ON lead_assignment_report_events(institution_program_id,occurred_at,id);
CREATE INDEX IF NOT EXISTS idx_assignment_report_assignee_time ON lead_assignment_report_events(institution_program_id,assignee_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_assignment_report_department_time ON lead_assignment_report_events(institution_program_id,department_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_assignment_report_rule_time ON lead_assignment_report_events(institution_program_id,rule_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_assignment_report_source_time ON lead_assignment_report_events(institution_program_id,source_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_assignment_report_owner_time ON lead_assignment_report_events(institution_program_id,owner_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_assignment_report_assignment_type ON lead_assignment_report_events(assignment_id,event_type);
CREATE INDEX IF NOT EXISTS idx_assignment_report_cause ON lead_assignment_report_events(cause_assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_report_campaigns ON lead_assignment_report_events USING gin(campaign_ids);
CREATE TABLE IF NOT EXISTS lead_assignment_report_coverage (
  id integer PRIMARY KEY DEFAULT 1,
  started_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO lead_assignment_report_coverage(id) VALUES(1) ON CONFLICT DO NOTHING;

-- All writers (single/bulk assignment, creation, API and automation) share these tables.
-- Capture facts inside their transaction, including snapshots and an idempotency key.
CREATE OR REPLACE FUNCTION capture_assignment_report_event(
  fact_key text, assignment uuid, kind text, happened_at timestamptz,
  reason_text text, cause uuid DEFAULT NULL, automation_rule uuid DEFAULT NULL, automation_node text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lead_assignment_report_events (
    event_key,event_type,occurred_at,assignment_id,cause_assignment_id,lead_id,institution_program_id,owner_id,
    assignee_id,assignee_name,department_id,department_name,source_id,source_name,campaign_ids,campaign_names,
    method,rule_id,rule_name,node_id,reason
  )
  SELECT fact_key,kind,happened_at,a.id,cause,l.id,l.institution_program_id,l.owner_id,
    a.assigned_to,u.full_name,a.department_id,d.name,l.source_id,s.name,
    ARRAY(SELECT c.id FROM campaigns c WHERE EXISTS (SELECT 1 FROM utm_trackings t WHERE t.campaign_id=c.id AND t.lead_id=l.id) ORDER BY c.id),
    ARRAY(SELECT c.name::text FROM campaigns c WHERE EXISTS (SELECT 1 FROM utm_trackings t WHERE t.campaign_id=c.id AND t.lead_id=l.id) ORDER BY c.id),
    CASE WHEN automation_rule IS NULL THEN 'MANUAL' ELSE 'AUTOMATIC' END,
    automation_rule,r.name,automation_node,reason_text
  FROM lead_assignments a
  JOIN leads l ON l.id=a.lead_id
  JOIN users u ON u.id=a.assigned_to
  LEFT JOIN departments d ON d.id=a.department_id
  LEFT JOIN lead_sources s ON s.id=l.source_id
  LEFT JOIN automation_rules r ON r.id=automation_rule
  WHERE a.id=assignment AND a.assigned_to IS NOT NULL
  ON CONFLICT (event_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION report_assignment_created() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous lead_assignments%ROWTYPE;
BEGIN
  IF NEW.is_main_owner IS NOT TRUE OR NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO previous FROM lead_assignments
    WHERE lead_id=NEW.lead_id AND id<>NEW.id
    ORDER BY assigned_at DESC NULLS LAST,id DESC LIMIT 1;
  -- A repeated assignment to the same employee is not a new business assignment.
  -- A manual unassignment between them is a real new assignment, even to the same person.
  IF previous.assigned_to=NEW.assigned_to AND NOT EXISTS (
    SELECT 1 FROM lead_assignment_report_events WHERE assignment_id=previous.id AND event_type='WITHDRAWN'
  ) THEN RETURN NEW; END IF;
  IF previous.assigned_to IS NOT NULL AND previous.assigned_to<>NEW.assigned_to AND NOT EXISTS (
    SELECT 1 FROM lead_assignment_report_events WHERE assignment_id=previous.id AND event_type='WITHDRAWN'
  ) THEN
    PERFORM capture_assignment_report_event('transfer:'||NEW.id,previous.id,'WITHDRAWN',CURRENT_TIMESTAMP,'Chuyển nhân viên phụ trách',NEW.id);
  END IF;
  PERFORM capture_assignment_report_event('assigned:'||NEW.id,NEW.id,'ASSIGNED',CURRENT_TIMESTAMP,'Giao lead',NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_report_created AFTER INSERT ON lead_assignments FOR EACH ROW EXECUTE FUNCTION report_assignment_created();

CREATE OR REPLACE FUNCTION report_assignment_removed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment uuid;
BEGIN
  IF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NULL AND NEW.deleted_at IS NULL THEN
    SELECT id INTO assignment FROM lead_assignments WHERE lead_id=NEW.id AND assigned_to=OLD.assigned_to
      ORDER BY assigned_at DESC NULLS LAST,id DESC LIMIT 1;
    IF assignment IS NOT NULL THEN
      PERFORM capture_assignment_report_event('removed:'||assignment,assignment,'WITHDRAWN',CURRENT_TIMESTAMP,'Thu hồi thủ công');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_report_removed AFTER UPDATE OF assigned_to ON leads FOR EACH ROW EXECUTE FUNCTION report_assignment_removed();

-- Automation checkpoints are committed in the same transaction as the assignment.
-- Enrich the assignment and its corresponding transfer without depending on log retention.
CREATE OR REPLACE FUNCTION report_automation_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule uuid; rule_label text;
BEGIN
  IF NEW.assignment_result->>'kind'='assigned' AND NEW.assignment_result->>'assignmentId' IS NOT NULL THEN
    SELECT e.rule_id,r.name INTO rule,rule_label FROM automation_execution_logs e
      JOIN automation_rules r ON r.id=e.rule_id WHERE e.id=NEW.execution_log_id;
    UPDATE lead_assignment_report_events SET method='AUTOMATIC',rule_id=rule,rule_name=rule_label,node_id=NEW.node_id
      WHERE cause_assignment_id=(NEW.assignment_result->>'assignmentId')::uuid;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_report_automation AFTER UPDATE OF assignment_result ON automation_node_executions
  FOR EACH ROW EXECUTE FUNCTION report_automation_assignment();

CREATE OR REPLACE FUNCTION report_assignment_monitor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule_label text;
BEGIN
  IF NEW.warned_at IS NOT NULL AND OLD.warned_at IS NULL THEN
    PERFORM capture_assignment_report_event('warning1:'||NEW.id,NEW.assignment_id,'WARNING_1',NEW.warned_at AT TIME ZONE 'UTC','Quá hạn xử lý: cảnh báo lần 1',NULL,NEW.rule_id,NEW.node_id);
  END IF;
  IF NEW.second_warned_at IS NOT NULL AND OLD.second_warned_at IS NULL THEN
    PERFORM capture_assignment_report_event('warning2:'||NEW.id,NEW.assignment_id,'WARNING_2',NEW.second_warned_at AT TIME ZONE 'UTC','Quá hạn xử lý: cảnh báo lần 2',NULL,NEW.rule_id,NEW.node_id);
  END IF;
  IF NEW.status='reassigned' AND NEW.next_assignment_id IS NOT NULL AND OLD.status IS DISTINCT FROM 'reassigned' THEN
    SELECT name INTO rule_label FROM automation_rules WHERE id=NEW.rule_id;
    UPDATE lead_assignment_report_events SET method='AUTOMATIC',rule_id=NEW.rule_id,rule_name=rule_label,node_id=NEW.node_id,
      reason=CASE WHEN event_type='WITHDRAWN' THEN 'Tự động thu hồi do quá hạn xử lý' ELSE reason END
      WHERE cause_assignment_id=NEW.next_assignment_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_report_monitor AFTER UPDATE ON automation_reassignment_monitors
  FOR EACH ROW EXECUTE FUNCTION report_assignment_monitor();
COMMIT;
