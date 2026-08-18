CREATE TABLE role_institution_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  institution_program_id UUID NOT NULL REFERENCES institution_programs(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(6) DEFAULT now(),
  CONSTRAINT role_institution_programs_role_program_unique UNIQUE (role_id, institution_program_id)
);

CREATE INDEX idx_role_institution_programs_program_role
  ON role_institution_programs(institution_program_id, role_id);

CREATE INDEX idx_role_institution_programs_role_id
  ON role_institution_programs(role_id);

-- Preserve current visibility when this constraint is introduced. Future role
-- changes must explicitly keep at least one program through the management API.
INSERT INTO role_institution_programs (role_id, institution_program_id)
SELECT role.id, program.id
FROM roles AS role
CROSS JOIN institution_programs AS program
WHERE program.status = 'active'
ON CONFLICT (role_id, institution_program_id) DO NOTHING;
