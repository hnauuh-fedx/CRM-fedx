BEGIN;
CREATE TABLE sale_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_program_id uuid NOT NULL REFERENCES institution_programs(id),
  name varchar(255) NOT NULL,
  note text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  calendar jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sale_work_schedule_list ON sale_work_schedules(institution_program_id, is_active, updated_at, id);
CREATE TABLE sale_work_schedule_members (
  schedule_id uuid NOT NULL REFERENCES sale_work_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (schedule_id, user_id)
);
CREATE INDEX idx_sale_work_schedule_member_user ON sale_work_schedule_members(user_id);
CREATE TABLE sale_work_calendar_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  institution_program_id uuid NOT NULL REFERENCES institution_programs(id),
  schedule_id uuid NOT NULL REFERENCES sale_work_schedules(id),
  schedule_version integer NOT NULL,
  calendar jsonb NOT NULL,
  effective_from timestamp(6) NOT NULL,
  effective_to timestamp(6),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX idx_sale_work_calendar_history ON sale_work_calendar_periods(user_id, institution_program_id, effective_from);
CREATE UNIQUE INDEX uq_sale_work_calendar_current ON sale_work_calendar_periods(user_id, institution_program_id) WHERE effective_to IS NULL;
ALTER TABLE automation_reassignment_monitors ADD COLUMN calendar_refresh_required boolean NOT NULL DEFAULT false;
CREATE INDEX idx_reassignment_calendar_refresh ON automation_reassignment_monitors(calendar_refresh_required, status, id);
CREATE INDEX idx_reassignment_assignee_program ON automation_reassignment_monitors(assignee_id, institution_program_id, status);
COMMIT;
