CREATE OR REPLACE VIEW "reporting"."admission_candidate_scope_fact" AS
WITH current_assignment AS (
  SELECT DISTINCT ON (assignment."lead_id") assignment."lead_id", assignment."assigned_to", assignment."department_id"
  FROM "lead_assignments" assignment
  WHERE assignment."is_main_owner" IS TRUE
  ORDER BY assignment."lead_id", assignment."assigned_at" DESC NULLS LAST, assignment."id" DESC
), safe_applications AS (
  SELECT profile."id" AS "application_id", profile."institution_program_id", lead."owner_id",
    COALESCE(lead."assigned_to", assignment."assigned_to") AS "assigned_to", assignment."department_id",
    COALESCE(profile."application_received_date", profile."created_at"::date) AS "received_date",
    COALESCE(status."name", 'Chưa xác định') AS "admission_status_name",
    COALESCE(major."name", 'Chưa có ngành') AS "major_name",
    COALESCE(profile."fee_status", 'Chưa xác định') AS "fee_status",
    COALESCE(profile."tuition_status", 'Chưa xác định') AS "tuition_status"
  FROM "admission_profiles" profile
  JOIN "leads" lead ON lead."id" = profile."lead_id" AND lead."deleted_at" IS NULL
  LEFT JOIN current_assignment assignment ON assignment."lead_id" = lead."id"
  LEFT JOIN "admission_statuses" status ON status."id" = profile."admission_status_id"
  LEFT JOIN "majors" major ON major."id" = profile."major_id"
)
SELECT 'ALL'::text AS "scope_key", safe_applications.* FROM safe_applications
UNION ALL SELECT 'OWNED:' || "owner_id"::text, safe_applications.* FROM safe_applications WHERE "owner_id" IS NOT NULL
UNION ALL SELECT 'ASSIGNED:' || "assigned_to"::text, safe_applications.* FROM safe_applications WHERE "assigned_to" IS NOT NULL
UNION ALL SELECT 'DEPARTMENT:' || "department_id"::text, safe_applications.* FROM safe_applications WHERE "department_id" IS NOT NULL;

COMMENT ON VIEW "reporting"."admission_candidate_scope_fact" IS
  'Safe scoped reporting dataset for admission candidates. Contains no identity, contact, document, note, file, credential, or audit fields.';

CREATE OR REPLACE VIEW "reporting"."student_scope_fact" AS
WITH current_assignment AS (
  SELECT DISTINCT ON (assignment."lead_id") assignment."lead_id", assignment."assigned_to", assignment."department_id"
  FROM "lead_assignments" assignment
  WHERE assignment."is_main_owner" IS TRUE
  ORDER BY assignment."lead_id", assignment."assigned_at" DESC NULLS LAST, assignment."id" DESC
), safe_students AS (
  SELECT student."id" AS "student_id", student."institution_program_id", lead."owner_id",
    COALESCE(lead."assigned_to", assignment."assigned_to") AS "assigned_to", assignment."department_id",
    COALESCE(student."enrolled_at", student."created_at")::date AS "enrolled_date",
    COALESCE(student."status", 'Chưa xác định') AS "student_status",
    COALESCE(faculty."name", 'Chưa có khoa') AS "faculty_name",
    COALESCE(major."name", 'Chưa có ngành') AS "major_name",
    COALESCE(class."name", 'Chưa xếp lớp') AS "class_name"
  FROM "students" student
  JOIN "leads" lead ON lead."id" = student."lead_id" AND lead."deleted_at" IS NULL
  LEFT JOIN current_assignment assignment ON assignment."lead_id" = lead."id"
  LEFT JOIN "faculties" faculty ON faculty."id" = student."faculty_id"
  LEFT JOIN "majors" major ON major."id" = student."major_id"
  LEFT JOIN "student_classes" class ON class."id" = student."class_id"
)
SELECT 'ALL'::text AS "scope_key", safe_students.* FROM safe_students
UNION ALL SELECT 'OWNED:' || "owner_id"::text, safe_students.* FROM safe_students WHERE "owner_id" IS NOT NULL
UNION ALL SELECT 'ASSIGNED:' || "assigned_to"::text, safe_students.* FROM safe_students WHERE "assigned_to" IS NOT NULL
UNION ALL SELECT 'DEPARTMENT:' || "department_id"::text, safe_students.* FROM safe_students WHERE "department_id" IS NOT NULL;

COMMENT ON VIEW "reporting"."student_scope_fact" IS
  'Safe scoped reporting dataset for students. Contains no student code, identity, contact, document, note, file, credential, or audit fields.';
