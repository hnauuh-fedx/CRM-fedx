-- Dedicated control database; no CRM business data or credentials belong here.
CREATE TABLE IF NOT EXISTS releases (
  id uuid PRIMARY KEY,
  commit text NOT NULL UNIQUE,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS environments (
  name text PRIMARY KEY CHECK(name IN ('staging','production')),
  schema_generation text NOT NULL,
  current_release_id uuid REFERENCES releases(id),
  blocked boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  release_id uuid NOT NULL REFERENCES releases(id),
  environment text NOT NULL REFERENCES environments(name),
  operation text NOT NULL CHECK(operation IN ('deploy','rollback')),
  reason text NOT NULL,
  actor_id uuid NOT NULL,
  actor_name text NOT NULL,
  status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','NEEDS_REVIEW')),
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_deployment_per_environment
  ON deployments(environment) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS deployments_page ON deployments(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS deployments_release ON deployments(release_id, environment, status);
CREATE INDEX IF NOT EXISTS releases_page ON releases(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS deployment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deployment_id uuid NOT NULL REFERENCES deployments(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
