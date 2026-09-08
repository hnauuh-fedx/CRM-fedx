CREATE OR REPLACE VIEW "reporting"."sale_pipeline_scope_fact" AS
WITH current_assignment AS (
  SELECT DISTINCT ON (assignment."lead_id")
    assignment."lead_id", assignment."assigned_to", assignment."department_id"
  FROM "lead_assignments" assignment
  WHERE assignment."is_main_owner" IS TRUE
  ORDER BY assignment."lead_id", assignment."assigned_at" DESC NULLS LAST, assignment."id" DESC
), safe_leads AS (
  SELECT
    lead."id" AS "lead_id",
    lead."institution_program_id",
    lead."owner_id",
    COALESCE(lead."assigned_to", assignment."assigned_to") AS "assigned_to",
    assignment."department_id",
    lead."created_at"::date AS "lead_date",
    COALESCE(source."name", 'Chưa xác định') AS "source_name",
    COALESCE(stage."name", 'Chưa có giai đoạn') AS "pipeline_stage_name",
    COALESCE(lead."status", 'new') AS "lead_status",
    (stage."name" ILIKE '%(L3)%') AS "has_application",
    (student."id" IS NOT NULL) AS "has_student",
    COALESCE(profile."monthly_revenue", 0) AS "monthly_revenue",
    COALESCE(assignee."full_name", 'Chưa phân công') AS "assignee_name"
  FROM "leads" lead
  LEFT JOIN current_assignment assignment ON assignment."lead_id" = lead."id"
  LEFT JOIN "users" assignee ON assignee."id" = COALESCE(lead."assigned_to", assignment."assigned_to")
  LEFT JOIN "lead_sources" source ON source."id" = lead."source_id"
  LEFT JOIN "pipeline_stages" stage ON stage."id" = lead."pipeline_stage_id"
  LEFT JOIN "admission_profiles" profile ON profile."lead_id" = lead."id"
  LEFT JOIN "students" student ON student."lead_id" = lead."id"
  WHERE lead."deleted_at" IS NULL
)
SELECT 'ALL'::text AS "scope_key", safe_leads.* FROM safe_leads
UNION ALL SELECT 'OWNED:' || "owner_id"::text, safe_leads.* FROM safe_leads WHERE "owner_id" IS NOT NULL
UNION ALL SELECT 'ASSIGNED:' || "assigned_to"::text, safe_leads.* FROM safe_leads WHERE "assigned_to" IS NOT NULL
UNION ALL SELECT 'DEPARTMENT:' || "department_id"::text, safe_leads.* FROM safe_leads WHERE "department_id" IS NOT NULL;

COMMENT ON VIEW "reporting"."sale_pipeline_scope_fact" IS
  'Safe scoped Sale dataset. Includes non-sensitive assignee display name; has_application means the lead is currently at pipeline stage L3.';
