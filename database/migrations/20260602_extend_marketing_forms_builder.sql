ALTER TABLE marketing_forms
  ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES lead_sources(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN IF NOT EXISTS subtitle VARCHAR(500),
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(32),
  ADD COLUMN IF NOT EXISTS background_color VARCHAR(32);

UPDATE marketing_forms
SET slug = COALESCE(
  slug,
  lower(regexp_replace(regexp_replace(name, '[^A-Za-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || substr(id::text, 1, 8)
)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_forms_slug_key
  ON marketing_forms(slug);

CREATE INDEX IF NOT EXISTS idx_marketing_forms_source_created_page
  ON marketing_forms(source_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_marketing_forms_template_created_page
  ON marketing_forms(template_id, created_at, id);

CREATE TABLE IF NOT EXISTS marketing_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  preview_image TEXT,
  config JSONB,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);

INSERT INTO marketing_form_templates (name, preview_image, config, is_default)
SELECT 'Tư vấn tuyển sinh', NULL, '{"layout":"consultation","radius":"pill","width":"compact"}'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM marketing_form_templates WHERE is_default = TRUE);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_forms_template_id_fkey'
  ) THEN
    ALTER TABLE marketing_forms
      ADD CONSTRAINT marketing_forms_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES marketing_form_templates(id)
      ON DELETE NO ACTION ON UPDATE NO ACTION
      NOT VALID;
    ALTER TABLE marketing_forms VALIDATE CONSTRAINT marketing_forms_template_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_form_templates_default_page
  ON marketing_form_templates(is_default, created_at, id);

ALTER TABLE marketing_form_fields
  ADD COLUMN IF NOT EXISTS validation_rules JSONB,
  ADD COLUMN IF NOT EXISTS crm_mapping_field VARCHAR(100),
  ADD COLUMN IF NOT EXISTS default_value TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

UPDATE marketing_form_fields
SET crm_mapping_field = COALESCE(crm_mapping_field, lead_field)
WHERE crm_mapping_field IS NULL AND lead_field IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_form_fields_crm_mapping
  ON marketing_form_fields(crm_mapping_field);

ALTER TABLE marketing_form_field_mappings
  ADD COLUMN IF NOT EXISTS form_field_id UUID,
  ADD COLUMN IF NOT EXISTS target_table VARCHAR(100),
  ADD COLUMN IF NOT EXISTS target_column VARCHAR(100),
  ADD COLUMN IF NOT EXISTS transform_rule JSONB;

UPDATE marketing_form_field_mappings mapping
SET
  form_field_id = field.id,
  target_table = COALESCE(mapping.target_table, 'leads'),
  target_column = COALESCE(mapping.target_column, mapping.lead_field)
FROM marketing_form_fields field
WHERE mapping.marketing_form_id = field.marketing_form_id
  AND mapping.source_field = field.field_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_form_field_mappings_form_field_id_fkey'
  ) THEN
    ALTER TABLE marketing_form_field_mappings
      ADD CONSTRAINT marketing_form_field_mappings_form_field_id_fkey
      FOREIGN KEY (form_field_id) REFERENCES marketing_form_fields(id)
      ON DELETE CASCADE ON UPDATE NO ACTION
      NOT VALID;
    ALTER TABLE marketing_form_field_mappings VALIDATE CONSTRAINT marketing_form_field_mappings_form_field_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_form_mapping_field
  ON marketing_form_field_mappings(form_field_id);
