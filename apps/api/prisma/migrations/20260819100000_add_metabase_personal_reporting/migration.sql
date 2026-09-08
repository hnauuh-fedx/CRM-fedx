CREATE TABLE "personal_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "institution_program_id" UUID,
  "name" VARCHAR(255) NOT NULL,
  "module" VARCHAR(30) NOT NULL,
  "metric_keys" JSONB NOT NULL,
  "breakdown_key" VARCHAR(80),
  "chart_type" VARCHAR(30) NOT NULL DEFAULT 'BAR',
  "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "is_shared" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "personal_reports_module_check" CHECK ("module" IN ('MARKETING', 'SALE', 'ADMISSION', 'STUDENT')),
  CONSTRAINT "personal_reports_chart_type_check" CHECK ("chart_type" IN ('BAR', 'TABLE', 'KPI'))
);

CREATE INDEX "idx_personal_reports_owner_active" ON "personal_reports"("owner_id", "archived_at", "updated_at");
CREATE INDEX "idx_personal_reports_shared_active" ON "personal_reports"("is_shared", "archived_at", "updated_at");
CREATE INDEX "idx_personal_reports_program_module" ON "personal_reports"("institution_program_id", "module");

INSERT INTO "permissions" ("id", "code", "name", "module", "description", "is_active", "created_at")
VALUES
  (gen_random_uuid(), 'report.personal.view', 'Xem báo cáo KPI cá nhân', 'report', 'Xem báo cáo KPI do nhân viên tạo hoặc được chia sẻ.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.personal.create', 'Tạo báo cáo KPI cá nhân', 'report', 'Tạo và lưu cấu hình KPI cá nhân từ danh mục được phép.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.personal.update', 'Cập nhật báo cáo KPI cá nhân', 'report', 'Cập nhật hoặc lưu trữ báo cáo KPI do chính mình tạo.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.personal.share', 'Chia sẻ báo cáo KPI cá nhân', 'report', 'Chia sẻ cấu hình báo cáo; dữ liệu được tính lại theo người xem.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.personal.export', 'Xuất báo cáo KPI cá nhân', 'report', 'Xuất dữ liệu KPI đã áp dụng quyền và phạm vi sang CSV hoặc Excel.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.sale.view_assigned', 'Xem báo cáo Sale được phân công', 'report', 'Xem báo cáo Sale trong phạm vi lead được phân công.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.admission.view', 'Xem báo cáo Tuyển sinh theo phạm vi', 'report', 'Xem báo cáo Tuyển sinh trong phạm vi được cấp.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'report.student.view', 'Xem báo cáo Sinh viên theo phạm vi', 'report', 'Xem báo cáo Sinh viên trong phạm vi được cấp.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "is_active" = true;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'report.personal.view', 'report.personal.create', 'report.personal.update',
  'report.personal.share', 'report.personal.export'
)
WHERE role."code" IN (
  'DIRECTOR', 'MARKETING_MANAGER', 'MARKETING_STAFF', 'SALE_MANAGER',
  'TELESALE', 'ADMISSION_OFFICER', 'STUDENT_SERVICE'
)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON
  (role."code" = 'TELESALE' AND permission."code" = 'report.sale.view_assigned') OR
  (role."code" = 'ADMISSION_OFFICER' AND permission."code" = 'report.admission.view') OR
  (role."code" = 'STUDENT_SERVICE' AND permission."code" = 'report.student.view')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

CREATE SCHEMA IF NOT EXISTS "reporting";

CREATE OR REPLACE VIEW "reporting"."sale_pipeline_scope_fact" AS
WITH current_assignment AS (
  SELECT DISTINCT ON (assignment."lead_id")
    assignment."lead_id",
    assignment."assigned_to",
    assignment."department_id"
  FROM "lead_assignments" assignment
  WHERE assignment."is_main_owner" IS TRUE
  ORDER BY assignment."lead_id", assignment."assigned_at" DESC NULLS LAST, assignment."id" DESC
), safe_leads AS (
  SELECT
    lead."id" AS "lead_id",
    lead."institution_program_id",
    lead."owner_id",
    COALESCE(lead."assigned_to", assignment."assigned_to") AS "assigned_to",
    assignment."department_id",
    lead."created_at"::date AS "lead_date",
    COALESCE(source."name", 'Chưa xác định') AS "source_name",
    COALESCE(stage."name", 'Chưa có giai đoạn') AS "pipeline_stage_name",
    COALESCE(lead."status", 'new') AS "lead_status",
    (profile."id" IS NOT NULL) AS "has_application",
    (student."id" IS NOT NULL) AS "has_student",
    COALESCE(profile."monthly_revenue", 0) AS "monthly_revenue"
  FROM "leads" lead
  LEFT JOIN current_assignment assignment ON assignment."lead_id" = lead."id"
  LEFT JOIN "lead_sources" source ON source."id" = lead."source_id"
  LEFT JOIN "pipeline_stages" stage ON stage."id" = lead."pipeline_stage_id"
  LEFT JOIN "admission_profiles" profile ON profile."lead_id" = lead."id"
  LEFT JOIN "students" student ON student."lead_id" = lead."id"
  WHERE lead."deleted_at" IS NULL
)
SELECT 'ALL'::text AS "scope_key", safe_leads.* FROM safe_leads
UNION ALL
SELECT 'OWNED:' || "owner_id"::text AS "scope_key", safe_leads.* FROM safe_leads WHERE "owner_id" IS NOT NULL
UNION ALL
SELECT 'ASSIGNED:' || "assigned_to"::text AS "scope_key", safe_leads.* FROM safe_leads WHERE "assigned_to" IS NOT NULL
UNION ALL
SELECT 'DEPARTMENT:' || "department_id"::text AS "scope_key", safe_leads.* FROM safe_leads WHERE "department_id" IS NOT NULL;

COMMENT ON VIEW "reporting"."sale_pipeline_scope_fact" IS
  'Metabase-safe Sale PoC dataset. Contains no phone, email, CCCD, notes, files, credentials, or audit payloads.';
