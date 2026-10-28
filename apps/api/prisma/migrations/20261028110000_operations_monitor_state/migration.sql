CREATE TABLE operations_monitor_states (
  key varchar(100) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
