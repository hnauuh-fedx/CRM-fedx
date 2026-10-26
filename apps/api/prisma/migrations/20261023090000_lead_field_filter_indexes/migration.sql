-- Lead list filters reach address and relative fields through EXISTS on lead_id.
CREATE INDEX IF NOT EXISTS "idx_addresses_lead_type" ON "addresses"("lead_id", "type");
CREATE INDEX IF NOT EXISTS "idx_relatives_lead_primary" ON "relatives"("lead_id", "is_primary");
