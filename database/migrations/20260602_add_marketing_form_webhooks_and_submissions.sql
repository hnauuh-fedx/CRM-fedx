ALTER TABLE marketing_forms
  ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) DEFAULT 'lead_form',
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS submit_button_label VARCHAR(150),
  ADD COLUMN IF NOT EXISTS public_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(128),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(6) DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS marketing_forms_public_key_key
  ON marketing_forms(public_key);

CREATE INDEX IF NOT EXISTS idx_marketing_forms_created_by_page
  ON marketing_forms(created_by, created_at, id);

CREATE INDEX IF NOT EXISTS idx_marketing_forms_type_created_page
  ON marketing_forms(form_type, created_at, id);

CREATE TABLE IF NOT EXISTS marketing_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_form_id UUID NOT NULL REFERENCES marketing_forms(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  field_key VARCHAR(150) NOT NULL,
  label VARCHAR(255) NOT NULL,
  placeholder VARCHAR(255),
  field_type VARCHAR(50) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB,
  lead_field VARCHAR(100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(6) DEFAULT now(),
  CONSTRAINT marketing_form_fields_form_key_unique UNIQUE (marketing_form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_form_fields_form_order
  ON marketing_form_fields(marketing_form_id, sort_order, id);

CREATE TABLE IF NOT EXISTS marketing_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_form_id UUID NOT NULL REFERENCES marketing_forms(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB,
  answers JSONB,
  source VARCHAR(100),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMP(6) DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_created_page
  ON marketing_form_submissions(created_at, id);

CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_lead_page
  ON marketing_form_submissions(lead_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_form_page
  ON marketing_form_submissions(marketing_form_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_form_status_page
  ON marketing_form_submissions(marketing_form_id, status, created_at, id);
