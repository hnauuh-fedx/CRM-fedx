-- "Doanh số tháng" becomes a date field; existing amounts are discarded (requested by the business owner).
-- The reporting fact view only exposed the amount; keep its column (no code reads it) so grants and dependents stay intact.
DO $$
DECLARE
  definition text;
BEGIN
  IF to_regclass('reporting.sale_pipeline_scope_fact') IS NOT NULL THEN
    definition := pg_get_viewdef('reporting.sale_pipeline_scope_fact'::regclass, true);
    definition := replace(definition, 'COALESCE(profile.monthly_revenue, 0::numeric) AS monthly_revenue', 'NULL::numeric AS monthly_revenue');
    IF position('profile.monthly_revenue' in definition) > 0 THEN
      RAISE EXCEPTION 'reporting.sale_pipeline_scope_fact still reads admission_profiles.monthly_revenue';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW reporting.sale_pipeline_scope_fact AS ' || definition;
  END IF;
END $$;

ALTER TABLE "admission_profiles" ALTER COLUMN "monthly_revenue" DROP DEFAULT;
ALTER TABLE "admission_profiles" ALTER COLUMN "monthly_revenue" TYPE DATE USING NULL;
