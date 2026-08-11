ALTER TABLE marketing_forms
  ADD COLUMN IF NOT EXISTS display_settings JSONB,
  ADD COLUMN IF NOT EXISTS duplicate_settings JSONB,
  ADD COLUMN IF NOT EXISTS success_settings JSONB,
  ADD COLUMN IF NOT EXISTS access_settings JSONB,
  ADD COLUMN IF NOT EXISTS close_settings JSONB,
  ADD COLUMN IF NOT EXISTS advanced_settings JSONB;
