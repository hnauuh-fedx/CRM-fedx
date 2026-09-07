-- Run as a PostgreSQL administrator after applying application migrations.
-- Set the login password outside source control, for example:
--   CREATE ROLE crm_reporting_metabase LOGIN PASSWORD '<secret>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_reporting_reader') THEN
    CREATE ROLE crm_reporting_reader NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO crm_reporting_reader', current_database());
END
$$;
GRANT USAGE ON SCHEMA reporting TO crm_reporting_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO crm_reporting_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO crm_reporting_reader;

-- Grant this group role to the separately-created Metabase login:
-- GRANT crm_reporting_reader TO crm_reporting_metabase;
