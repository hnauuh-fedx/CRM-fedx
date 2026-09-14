CREATE TABLE "zalo_user_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "zalo_user_id" VARCHAR(100) NOT NULL,
  "display_name" VARCHAR(255),
  "last_synced_at" TIMESTAMP(6),
  "last_sync_error" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zalo_user_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zalo_user_profiles_connection_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "zalo_connections"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "uq_zalo_user_profiles_connection_user"
  ON "zalo_user_profiles"("connection_id", "zalo_user_id");

CREATE INDEX "idx_zalo_user_profiles_connection_name"
  ON "zalo_user_profiles"("connection_id", "display_name");
