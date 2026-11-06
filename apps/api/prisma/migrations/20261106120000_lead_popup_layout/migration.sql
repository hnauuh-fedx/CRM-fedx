BEGIN;
ALTER TABLE display_layout_templates DROP CONSTRAINT display_layout_templates_screen_check;
ALTER TABLE display_layout_templates ADD CONSTRAINT display_layout_templates_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM', 'LEAD_POPUP'));
ALTER TABLE display_layout_assignments DROP CONSTRAINT display_layout_assignments_screen_check;
ALTER TABLE display_layout_assignments ADD CONSTRAINT display_layout_assignments_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM', 'LEAD_POPUP'));
ALTER TABLE display_layout_preferences DROP CONSTRAINT display_layout_preferences_screen_check;
ALTER TABLE display_layout_preferences ADD CONSTRAINT display_layout_preferences_screen_check CHECK (screen IN ('LEAD_LIST', 'CUSTOMER_LIST', 'LEAD_DETAIL', 'LEAD_FORM', 'LEAD_POPUP'));
COMMIT;
