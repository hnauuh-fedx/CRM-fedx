-- Replace the L3-only admission reporting dataset with the Sale dataset whose
-- members are leads currently at L2 or a later stage in the same pipeline.
UPDATE "personal_reports"
SET
  "module" = 'SALE',
  "metric_keys" = jsonb_build_array('totalLeads'),
  "breakdown_key" = NULL,
  "filters" = "filters"::jsonb || jsonb_build_object('datasetKey', 'QUALIFIED_LEADS')
WHERE "filters"->>'datasetKey' = 'ADMISSION_CANDIDATES';

UPDATE "personal_reports"
SET "filters" = "filters"::jsonb ||
  CASE "filters"->>'mode'
    WHEN 'SINGLE' THEN jsonb_build_object('singleDimensionKey', 'SOURCE')
    WHEN 'PIVOT' THEN jsonb_build_object('rowDimensionKey', 'SOURCE', 'columnDimensionKey', 'CREATED_DATE')
    ELSE '{}'::jsonb
  END
WHERE "filters"->>'datasetKey' = 'QUALIFIED_LEADS';

UPDATE "personal_reports"
SET "filters" = jsonb_set(
  "filters"::jsonb,
  '{conditions}',
  COALESCE((
    SELECT jsonb_agg(condition || jsonb_build_object('fieldKey', 'CREATED_DATE'))
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof("filters"::jsonb->'conditions') = 'array' THEN "filters"::jsonb->'conditions'
        ELSE '[]'::jsonb
      END
    ) condition
    WHERE condition->>'fieldKey' = 'RECEIVED_DATE'
  ), '[]'::jsonb),
  true
)
WHERE "filters"->>'datasetKey' = 'QUALIFIED_LEADS';

UPDATE "personal_dashboard_settings"
SET "kpi_widgets" = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN widget->>'datasetKey' = 'ADMISSION_CANDIDATES' THEN
        widget || jsonb_build_object(
          'datasetKey', 'QUALIFIED_LEADS',
          'conditions', COALESCE((
            SELECT jsonb_agg(condition || jsonb_build_object('fieldKey', 'CREATED_DATE'))
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(widget->'conditions') = 'array' THEN widget->'conditions'
                ELSE '[]'::jsonb
              END
            ) condition
            WHERE condition->>'fieldKey' = 'RECEIVED_DATE'
          ), '[]'::jsonb)
        )
      ELSE widget
    END
  )
  FROM jsonb_array_elements("kpi_widgets"::jsonb) widget
), '[]'::jsonb)
WHERE jsonb_typeof("kpi_widgets"::jsonb) = 'array';

DROP VIEW IF EXISTS "reporting"."admission_candidate_scope_fact";
