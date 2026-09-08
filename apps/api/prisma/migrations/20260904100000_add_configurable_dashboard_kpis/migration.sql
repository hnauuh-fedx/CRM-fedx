CREATE TABLE "personal_dashboard_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "institution_program_id" UUID NOT NULL,
  "column_count" INTEGER NOT NULL DEFAULT 4,
  "kpi_widgets" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_dashboard_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_dashboard_settings_column_count_check" CHECK ("column_count" BETWEEN 1 AND 5),
  CONSTRAINT "personal_dashboard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "personal_dashboard_settings_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_personal_dashboard_settings_user_program"
  ON "personal_dashboard_settings"("user_id", "institution_program_id");
