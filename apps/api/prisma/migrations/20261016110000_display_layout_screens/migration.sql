ALTER TABLE display_layout_templates ADD COLUMN screen VARCHAR(20) NOT NULL DEFAULT 'LEAD_LIST';
ALTER TABLE display_layout_assignments ADD COLUMN screen VARCHAR(20) NOT NULL DEFAULT 'LEAD_LIST';
ALTER TABLE display_layout_preferences ADD COLUMN screen VARCHAR(20) NOT NULL DEFAULT 'LEAD_LIST';
DROP INDEX "display_layout_assignments_institution_program_id_target_type_t_key";
DROP INDEX "display_layout_preferences_institution_program_id_user_id_key";
CREATE UNIQUE INDEX "display_layout_assignments_program_screen_target_key"
  ON display_layout_assignments(institution_program_id, screen, target_type, target_id);
CREATE UNIQUE INDEX "display_layout_preferences_program_screen_user_key"
  ON display_layout_preferences(institution_program_id, screen, user_id);
ALTER TABLE display_layout_templates ADD CONSTRAINT display_layout_templates_screen_check CHECK (screen IN ('LEAD_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));
ALTER TABLE display_layout_assignments ADD CONSTRAINT display_layout_assignments_screen_check CHECK (screen IN ('LEAD_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));
ALTER TABLE display_layout_preferences ADD CONSTRAINT display_layout_preferences_screen_check CHECK (screen IN ('LEAD_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));
CREATE INDEX display_layout_templates_program_screen_page_idx ON display_layout_templates(institution_program_id, screen, updated_at, id);
