BEGIN;

-- Preserve explicitly assigned reporting permissions when removing the view column.
CREATE TEMP TABLE faculty_removal_view_grants ON COMMIT DROP AS
SELECT grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'reporting' AND table_name = 'student_scope_fact';

DROP VIEW "reporting"."student_scope_fact";

ALTER TABLE "majors" DROP CONSTRAINT "majors_faculty_id_fkey";
ALTER TABLE "student_classes" DROP CONSTRAINT "student_classes_faculty_id_fkey";
ALTER TABLE "students" DROP CONSTRAINT "students_faculty_id_fkey";
ALTER TABLE "majors" DROP COLUMN "faculty_id";
ALTER TABLE "student_classes" DROP COLUMN "faculty_id";
ALTER TABLE "students" DROP COLUMN "faculty_id";
DROP TABLE "faculties";

CREATE VIEW "reporting"."student_scope_fact" AS
WITH current_assignment AS (
  SELECT DISTINCT ON (assignment."lead_id") assignment."lead_id", assignment."assigned_to", assignment."department_id"
  FROM "lead_assignments" assignment
  WHERE assignment."is_main_owner" IS TRUE
  ORDER BY assignment."lead_id", assignment."assigned_at" DESC NULLS LAST, assignment."id" DESC
), safe_students AS (
  SELECT student."id" AS "student_id", student."institution_program_id", lead."owner_id",
    COALESCE(lead."assigned_to", assignment."assigned_to") AS "assigned_to", assignment."department_id",
    COALESCE(student."enrolled_at", student."created_at")::date AS "enrolled_date",
    COALESCE(student."status", 'Chưa xác định') AS "student_status",    COALESCE(major."name", 'Chưa có ngành') AS "major_name",
    COALESCE(class."name", 'Chưa xếp lớp') AS "class_name"
  FROM "students" student
  JOIN "leads" lead ON lead."id" = student."lead_id" AND lead."deleted_at" IS NULL
  LEFT JOIN current_assignment assignment ON assignment."lead_id" = lead."id"  LEFT JOIN "majors" major ON major."id" = student."major_id"
  LEFT JOIN "student_classes" class ON class."id" = student."class_id"
)
SELECT 'ALL'::text AS "scope_key", safe_students.* FROM safe_students
UNION ALL SELECT 'OWNED:' || "owner_id"::text, safe_students.* FROM safe_students WHERE "owner_id" IS NOT NULL
UNION ALL SELECT 'ASSIGNED:' || "assigned_to"::text, safe_students.* FROM safe_students WHERE "assigned_to" IS NOT NULL
UNION ALL SELECT 'DEPARTMENT:' || "department_id"::text, safe_students.* FROM safe_students WHERE "department_id" IS NOT NULL;

COMMENT ON VIEW "reporting"."student_scope_fact" IS
  'Safe scoped reporting dataset for students. Contains no student code, identity, contact, document, note, file, credential, or audit fields.';

DO $$
DECLARE saved_grant RECORD;
BEGIN
  FOR saved_grant IN SELECT * FROM faculty_removal_view_grants LOOP
    EXECUTE format('GRANT %s ON reporting.student_scope_fact TO %s%s',
      saved_grant.privilege_type,
      CASE WHEN saved_grant.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(saved_grant.grantee) END,
      CASE WHEN saved_grant.is_grantable = 'YES' THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END $$;

COMMIT;
