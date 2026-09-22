-- Keep the legacy column for rollback compatibility, but remove its implicit behavior and unused indexes.
ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;
DROP INDEX IF EXISTS "idx_leads_status";
DROP INDEX IF EXISTS "idx_leads_status_created_page";

UPDATE "automation_rules"
SET "trigger_type" = 'lead_pipeline_stage_changed'
WHERE "trigger_type" = 'lead_status_changed';

UPDATE "automation_rules"
SET "graph_data" = jsonb_set(
  "graph_data"::jsonb,
  '{nodes}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN node->>'type' = 'condition' AND node->'data'->>'field' = 'status'
          THEN jsonb_set(node, '{data,field}', '"pipeline_stage_id"'::jsonb, false)
        ELSE node
      END
    )
    FROM jsonb_array_elements("graph_data"::jsonb->'nodes') node
  ), '[]'::jsonb),
  false
)
WHERE jsonb_typeof("graph_data"::jsonb->'nodes') = 'array';

-- Preserve saved Lead reports while moving their dimensions and conditions to pipeline stages.
UPDATE "personal_reports"
SET "filters" = "filters"::jsonb || jsonb_build_object('rowDimensionKey', 'PIPELINE_STAGE')
WHERE "filters"->>'datasetKey' = 'LEADS' AND "filters"->>'rowDimensionKey' = 'STATUS';

UPDATE "personal_reports"
SET "filters" = "filters"::jsonb || jsonb_build_object('columnDimensionKey', 'PIPELINE_STAGE')
WHERE "filters"->>'datasetKey' = 'LEADS' AND "filters"->>'columnDimensionKey' = 'STATUS';

UPDATE "personal_reports"
SET "filters" = "filters"::jsonb || jsonb_build_object('singleDimensionKey', 'PIPELINE_STAGE')
WHERE "filters"->>'datasetKey' = 'LEADS' AND "filters"->>'singleDimensionKey' = 'STATUS';

UPDATE "personal_reports"
SET "filters" = jsonb_set(
  "filters"::jsonb,
  '{conditions}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN condition->>'fieldKey' = 'STATUS'
          THEN condition || jsonb_build_object('fieldKey', 'PIPELINE_STAGE')
        ELSE condition
      END
    )
    FROM jsonb_array_elements("filters"::jsonb->'conditions') condition
  ), '[]'::jsonb),
  false
)
WHERE "filters"->>'datasetKey' = 'LEADS'
  AND jsonb_typeof("filters"::jsonb->'conditions') = 'array';

UPDATE "personal_dashboard_settings"
SET "kpi_widgets" = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN widget->>'datasetKey' = 'LEADS' AND jsonb_typeof(widget->'conditions') = 'array'
        THEN jsonb_set(
          widget,
          '{conditions}',
          COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN condition->>'fieldKey' = 'STATUS'
                  THEN condition || jsonb_build_object('fieldKey', 'PIPELINE_STAGE')
                ELSE condition
              END
            )
            FROM jsonb_array_elements(widget->'conditions') condition
          ), '[]'::jsonb),
          false
        )
      ELSE widget
    END
  )
  FROM jsonb_array_elements("kpi_widgets"::jsonb) widget
), '[]'::jsonb)
WHERE jsonb_typeof("kpi_widgets"::jsonb) = 'array';

-- PostgreSQL cannot remove a view column with CREATE OR REPLACE, so recreate the scoped view.
DROP VIEW "reporting"."sale_pipeline_scope_fact";

CREATE VIEW "reporting"."sale_pipeline_scope_fact" AS
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
    COALESCE(stage."name", 'Chưa chọn tiến trình') AS "pipeline_stage_name",
    (stage."name" ILIKE '%(L3)%') AS "has_application",
    (student."id" IS NOT NULL) AS "has_student",
    COALESCE(profile."monthly_revenue", 0) AS "monthly_revenue",
    COALESCE(assignee."full_name", 'Chưa phân công') AS "assignee_name",
    stage."position" AS "pipeline_stage_position"
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
  'Safe scoped Sale dataset. Pipeline stage is the single workflow source of truth and is ordered by its configured position.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_reporting_reader') THEN
    GRANT SELECT ON "reporting"."sale_pipeline_scope_fact" TO crm_reporting_reader;
  END IF;
END
$$;
