BEGIN;
CREATE TABLE IF NOT EXISTS user_program_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_program_id uuid NOT NULL REFERENCES institution_programs(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, institution_program_id),
  CONSTRAINT user_program_roles_catalog_fk FOREIGN KEY (role_id, institution_program_id)
    REFERENCES role_institution_programs(role_id, institution_program_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_user_program_roles_program_role ON user_program_roles(institution_program_id, role_id);
CREATE INDEX IF NOT EXISTS idx_user_program_roles_role ON user_program_roles(role_id);

-- Preserve unambiguous legacy assignments. Multiple roles require an explicit choice;
-- do not silently discard permissions or pick a more privileged role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'migration.user_program_roles.20261012') THEN
    IF EXISTS (
      SELECT ur.user_id, rp.institution_program_id FROM user_roles ur
      JOIN role_institution_programs rp ON rp.role_id = ur.role_id
      WHERE ur.user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_program_roles upr WHERE upr.user_id = ur.user_id
          AND upr.institution_program_id = rp.institution_program_id)
      GROUP BY ur.user_id, rp.institution_program_id HAVING count(DISTINCT ur.role_id) > 1
    ) THEN
      RAISE EXCEPTION 'Multiple legacy roles for a user/program. Select one role using the migration runner; see database/migrations/20261012_user_program_roles.md';
    END IF;
    INSERT INTO user_program_roles(user_id, institution_program_id, role_id)
    SELECT DISTINCT ur.user_id, rp.institution_program_id, ur.role_id
    FROM user_roles ur JOIN role_institution_programs rp ON rp.role_id = ur.role_id
    WHERE ur.user_id IS NOT NULL
    ON CONFLICT (user_id, institution_program_id) DO NOTHING;
    INSERT INTO system_settings(key, value, type) VALUES ('migration.user_program_roles.20261012', 'complete', 'migration');
  END IF;
END $$;
COMMIT;
