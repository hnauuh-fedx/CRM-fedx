BEGIN;
ALTER TABLE display_layout_templates DROP CONSTRAINT display_layout_templates_screen_check;
ALTER TABLE display_layout_assignments DROP CONSTRAINT display_layout_assignments_screen_check;
ALTER TABLE display_layout_preferences DROP CONSTRAINT display_layout_preferences_screen_check;
ALTER TABLE display_layout_templates ADD CONSTRAINT display_layout_templates_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));
ALTER TABLE display_layout_assignments ADD CONSTRAINT display_layout_assignments_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));
ALTER TABLE display_layout_preferences ADD CONSTRAINT display_layout_preferences_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM'));

-- Preserve the previously shared appearance once, then keep each list independent.
CREATE TEMP TABLE customer_layout_id_map ON COMMIT DROP AS
  SELECT id AS original_id, gen_random_uuid() AS customer_id
  FROM display_layout_templates WHERE screen = 'LEAD_LIST';
INSERT INTO display_layout_templates
  (id, institution_program_id, management_department_id, draft, published, revision, published_version, created_by, created_at, updated_at, screen)
SELECT m.customer_id, t.institution_program_id, t.management_department_id, t.draft, t.published, t.revision, t.published_version, t.created_by, t.created_at, t.updated_at, 'CUSTOMER_LIST'
FROM display_layout_templates t JOIN customer_layout_id_map m ON m.original_id = t.id;
INSERT INTO display_layout_versions (template_id, version, snapshot, actor_id, actor_name, created_at)
SELECT m.customer_id, v.version, v.snapshot, v.actor_id, v.actor_name, v.created_at
FROM display_layout_versions v JOIN customer_layout_id_map m ON m.original_id = v.template_id;
INSERT INTO display_layout_assignments (institution_program_id, target_type, target_id, template_id, screen)
SELECT a.institution_program_id, a.target_type, a.target_id, m.customer_id, 'CUSTOMER_LIST'
FROM display_layout_assignments a JOIN customer_layout_id_map m ON m.original_id = a.template_id
WHERE a.screen = 'LEAD_LIST';
INSERT INTO display_layout_preferences (institution_program_id, user_id, base_template_id, base_version, presentation, revision, updated_at, screen)
SELECT p.institution_program_id, p.user_id, m.customer_id, p.base_version, p.presentation, p.revision, p.updated_at, 'CUSTOMER_LIST'
FROM display_layout_preferences p LEFT JOIN customer_layout_id_map m ON m.original_id = p.base_template_id
WHERE p.screen = 'LEAD_LIST';
COMMIT;
