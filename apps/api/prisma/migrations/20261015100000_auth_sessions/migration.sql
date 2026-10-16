CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "remember_device" BOOLEAN NOT NULL,
  "refresh_version" INTEGER NOT NULL DEFAULT 0,
  "refresh_token_hash" VARCHAR(64) NOT NULL,
  "rotated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" VARCHAR(50),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_sessions_expiry_check" CHECK (
    ("remember_device" AND "expires_at" IS NULL) OR
    (NOT "remember_device" AND "expires_at" IS NOT NULL)
  ),
  CONSTRAINT "auth_sessions_version_check" CHECK ("refresh_version" >= 0)
);
CREATE INDEX "idx_auth_sessions_user_revoked" ON "auth_sessions"("user_id", "revoked_at");
CREATE INDEX "idx_auth_sessions_expires" ON "auth_sessions"("expires_at");
