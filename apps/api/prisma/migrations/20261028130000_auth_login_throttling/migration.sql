CREATE TABLE auth_login_buckets (
  key varchar(80) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_auth_login_buckets_expiry ON auth_login_buckets(expires_at);
