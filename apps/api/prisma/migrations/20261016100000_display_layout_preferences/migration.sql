CREATE TABLE display_layout_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_program_id UUID NOT NULL,
  user_id UUID NOT NULL,
  base_template_id UUID,
  base_version INTEGER NOT NULL DEFAULT 0,
  presentation JSONB,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX display_layout_preferences_institution_program_id_user_id_key
  ON display_layout_preferences(institution_program_id, user_id);
