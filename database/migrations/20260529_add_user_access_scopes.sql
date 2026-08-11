CREATE TABLE IF NOT EXISTS user_access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope varchar(50) NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT user_access_scopes_user_id_unique UNIQUE (user_id),
  CONSTRAINT user_access_scopes_scope_check CHECK (scope IN ('ALL', 'DEPARTMENT', 'ASSIGNED_ONLY', 'OWNED_ONLY', 'READ_ONLY'))
);

CREATE INDEX IF NOT EXISTS idx_user_access_scopes_scope ON user_access_scopes(scope);
