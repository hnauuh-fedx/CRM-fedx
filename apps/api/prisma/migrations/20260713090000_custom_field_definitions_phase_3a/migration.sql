-- Phase 3A keeps legacy columns and values intact. The explicit duplicate check
-- prevents an unsafe unique constraint from silently discarding production data.
ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS program_id UUID,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_filterable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS options JSONB,
  ADD COLUMN IF NOT EXISTS validation_rules JSONB,
  ADD COLUMN IF NOT EXISTS default_value JSONB,
  ADD COLUMN IF NOT EXISTS created_by_id UUID,
  ADD COLUMN IF NOT EXISTS updated_by_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(6) DEFAULT now();

UPDATE custom_fields
SET entity_type = UPPER(module), scope_type = COALESCE(scope_type, 'GLOBAL'), updated_at = COALESCE(updated_at, created_at, now())
WHERE entity_type IS NULL OR scope_type IS NULL OR updated_at IS NULL;

ALTER TABLE custom_field_values
  ADD COLUMN IF NOT EXISTS value_text TEXT,
  ADD COLUMN IF NOT EXISTS value_number DECIMAL(20, 6),
  ADD COLUMN IF NOT EXISTS value_date TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS value_boolean BOOLEAN,
  ADD COLUMN IF NOT EXISTS value_json JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(6) DEFAULT now();

UPDATE custom_field_values SET value_text = value WHERE value_text IS NULL AND value IS NOT NULL;
UPDATE custom_field_values SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

ALTER TABLE custom_field_values DROP CONSTRAINT IF EXISTS custom_field_values_custom_field_id_fkey;
ALTER TABLE custom_field_values ADD CONSTRAINT custom_field_values_custom_field_id_fkey
  FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE RESTRICT;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES institution_programs(id) ON DELETE RESTRICT;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_updated_by_id_fkey
  FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE custom_fields DROP CONSTRAINT IF EXISTS custom_fields_module_field_key_key;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM custom_field_values WHERE custom_field_id IS NOT NULL GROUP BY custom_field_id, entity_type, entity_id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add custom field value uniqueness: duplicate legacy values need remediation.';
  END IF;
END $$;
DROP INDEX IF EXISTS uq_custom_field_values_field_entity;
ALTER TABLE custom_field_values DROP CONSTRAINT IF EXISTS uq_custom_field_values_field_entity;
ALTER TABLE custom_field_values ADD CONSTRAINT uq_custom_field_values_field_entity UNIQUE (custom_field_id, entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_fields_global_key ON custom_fields(entity_type, field_key) WHERE scope_type = 'GLOBAL' AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_fields_program_key ON custom_fields(entity_type, program_id, field_key) WHERE scope_type = 'PROGRAM' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_scope_order ON custom_fields(entity_type, scope_type, program_id, display_order, id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_text_lookup ON custom_field_values(custom_field_id, value_text);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_number_lookup ON custom_field_values(custom_field_id, value_number);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_date_lookup ON custom_field_values(custom_field_id, value_date);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_boolean_lookup ON custom_field_values(custom_field_id, value_boolean);
