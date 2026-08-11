ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS due_notified_at TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP(6);
