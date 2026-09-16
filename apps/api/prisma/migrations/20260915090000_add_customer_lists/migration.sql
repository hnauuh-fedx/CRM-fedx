CREATE TABLE "customer_lists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "filter_config" JSONB,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(6),
  CONSTRAINT "customer_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_lists_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "customer_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "customer_list_members" (
  "customer_list_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "added_by" UUID NOT NULL,
  "added_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_list_members_pkey" PRIMARY KEY ("customer_list_id", "lead_id"),
  CONSTRAINT "customer_list_members_customer_list_id_fkey" FOREIGN KEY ("customer_list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "customer_list_members_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "customer_list_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_customer_lists_program_active" ON "customer_lists"("institution_program_id", "deleted_at", "updated_at", "id");
CREATE INDEX "idx_customer_lists_creator_active" ON "customer_lists"("created_by", "deleted_at", "updated_at", "id");
CREATE INDEX "idx_customer_list_members_lead" ON "customer_list_members"("lead_id", "customer_list_id");

INSERT INTO "permissions" ("id", "code", "name", "module", "description", "is_active", "created_at") VALUES
  (gen_random_uuid(), 'customer_list.view_all', 'Xem mọi danh sách khách hàng', 'marketing', 'Xem danh sách khách hàng trong chương trình được phân quyền.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'customer_list.manage', 'Quản lý danh sách khách hàng', 'marketing', 'Tạo danh sách và thêm lead trong phạm vi được phân quyền.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "is_active" = true;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'customer_list.view_all'
WHERE role."code" = 'DIRECTOR'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN ('customer_list.manage', 'lead.view_department')
WHERE role."code" = 'MARKETING_MANAGER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
