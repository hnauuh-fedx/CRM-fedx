ALTER TABLE "institution_programs"
  ADD COLUMN "institution_name" VARCHAR(255);

UPDATE "institution_programs" AS program
SET "institution_name" = institution."name"
FROM "institutions" AS institution
WHERE program."institution_id" = institution."id";

ALTER TABLE "institution_programs"
  ALTER COLUMN "institution_name" SET NOT NULL;

ALTER TABLE "institution_programs"
  DROP CONSTRAINT IF EXISTS "institution_programs_institution_id_fkey",
  DROP CONSTRAINT IF EXISTS "institution_programs_program_type_id_fkey",
  DROP CONSTRAINT IF EXISTS "institution_programs_institution_type_name_key";

DROP INDEX IF EXISTS "idx_institution_programs_institution_status";
DROP INDEX IF EXISTS "idx_institution_programs_type_status";

ALTER TABLE "institution_programs"
  DROP COLUMN "institution_id",
  DROP COLUMN "program_type_id";

DROP TABLE "institutions";

CREATE INDEX "idx_institution_programs_institution_status"
  ON "institution_programs" ("institution_name", "status", "name");
