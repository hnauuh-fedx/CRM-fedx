CREATE TABLE integration_task_receipts (
  task_key varchar(200) PRIMARY KEY,
  provider varchar(20) NOT NULL CHECK(provider IN ('zalo','meta')),
  entity_id uuid NOT NULL,
  status varchar(30) NOT NULL CHECK(status IN ('running','completed','needs_review')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_integration_task_receipts_provider_entity ON integration_task_receipts(provider, entity_id);
CREATE INDEX idx_integration_task_receipts_review ON integration_task_receipts(status, started_at);
