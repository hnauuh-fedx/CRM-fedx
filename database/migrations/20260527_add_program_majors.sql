ALTER TABLE majors
  ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);

UPDATE majors AS major
SET institution_program_id = linked.institution_program_id
FROM (
  SELECT major_id, MIN(institution_program_id::text)::UUID AS institution_program_id
  FROM admission_profiles
  WHERE major_id IS NOT NULL
    AND institution_program_id IS NOT NULL
  GROUP BY major_id
  HAVING COUNT(DISTINCT institution_program_id) = 1
) AS linked
WHERE major.id = linked.major_id
  AND major.institution_program_id IS NULL;

ALTER TABLE majors DROP CONSTRAINT IF EXISTS majors_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS majors_institution_program_id_code_key
  ON majors (institution_program_id, code);

CREATE INDEX IF NOT EXISTS idx_majors_program_created_page
  ON majors (institution_program_id, created_at, id);
