ALTER TABLE student_services
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;

UPDATE student_services
SET status = 'open'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_services_handler_created_page
  ON student_services (handled_by, created_at, id);

CREATE INDEX IF NOT EXISTS idx_student_services_status_created_page
  ON student_services (status, created_at, id);

CREATE INDEX IF NOT EXISTS idx_student_services_student_created_page
  ON student_services (student_id, created_at, id);
