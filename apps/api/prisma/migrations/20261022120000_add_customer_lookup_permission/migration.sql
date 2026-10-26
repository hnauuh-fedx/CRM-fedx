-- Customer lookup is granted explicitly per role; no default grants.
INSERT INTO permissions (code, name, module, is_active)
VALUES ('customer_lookup.view', 'Tra cứu khách hàng', 'sale', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module, is_active = true;

CREATE INDEX IF NOT EXISTS "idx_leads_active_updated_page" ON "leads"("deleted_at", "updated_at", "id");
