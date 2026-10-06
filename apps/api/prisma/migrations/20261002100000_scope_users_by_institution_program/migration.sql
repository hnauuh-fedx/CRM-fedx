CREATE TABLE "user_program_access_scopes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "institution_program_id" UUID NOT NULL,
  "scope" VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_program_access_scopes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_program_access_scopes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_program_access_scopes_institution_program_id_fkey"
    FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_program_access_scopes_scope_check"
    CHECK ("scope" IN ('ALL', 'DEPARTMENT', 'ASSIGNED_ONLY', 'OWNED_ONLY', 'READ_ONLY'))
);

CREATE UNIQUE INDEX "user_program_access_scopes_user_id_institution_program_id_key"
  ON "user_program_access_scopes"("user_id", "institution_program_id");

CREATE INDEX "idx_user_program_access_scopes_program_scope"
  ON "user_program_access_scopes"("institution_program_id", "scope");

INSERT INTO "user_program_access_scopes" ("user_id", "institution_program_id", "scope")
SELECT DISTINCT user_scope."user_id", role_program."institution_program_id", user_scope."scope"
FROM "user_access_scopes" user_scope
JOIN "user_roles" user_role ON user_role."user_id" = user_scope."user_id"
JOIN "role_institution_programs" role_program ON role_program."role_id" = user_role."role_id"
ON CONFLICT ("user_id", "institution_program_id") DO NOTHING;
