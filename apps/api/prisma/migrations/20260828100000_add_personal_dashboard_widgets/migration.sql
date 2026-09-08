CREATE TABLE "personal_dashboard_widgets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "institution_program_id" UUID NOT NULL,
  "personal_report_id" UUID NOT NULL,
  "display_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_dashboard_widgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_dashboard_widgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "personal_dashboard_widgets_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "personal_dashboard_widgets_personal_report_id_fkey" FOREIGN KEY ("personal_report_id") REFERENCES "personal_reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_personal_dashboard_widget_report"
  ON "personal_dashboard_widgets"("user_id", "institution_program_id", "personal_report_id");

CREATE INDEX "idx_personal_dashboard_widget_order"
  ON "personal_dashboard_widgets"("user_id", "institution_program_id", "display_order");
