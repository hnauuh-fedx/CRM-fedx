-- Diagnostic schema diff only. Not executed and not a deployment migration.
-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_next_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_program_id_fkey";

-- DropForeignKey
ALTER TABLE "automation_reassignment_monitors" DROP CONSTRAINT "automation_reassignment_monitors_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "zalo_connections" DROP CONSTRAINT "zalo_connections_created_by_fkey";

-- DropForeignKey
ALTER TABLE "zalo_connections" DROP CONSTRAINT "zalo_connections_program_fkey";

-- DropForeignKey
ALTER TABLE "zalo_connections" DROP CONSTRAINT "zalo_connections_source_fkey";

-- DropForeignKey
ALTER TABLE "zalo_lead_extractions" DROP CONSTRAINT "zalo_extractions_connection_fkey";

-- DropForeignKey
ALTER TABLE "zalo_lead_extractions" DROP CONSTRAINT "zalo_extractions_lead_fkey";

-- DropForeignKey
ALTER TABLE "zalo_lead_extractions" DROP CONSTRAINT "zalo_extractions_message_fkey";

-- DropForeignKey
ALTER TABLE "zalo_messages" DROP CONSTRAINT "zalo_messages_connection_fkey";

-- DropForeignKey
ALTER TABLE "zalo_messages" DROP CONSTRAINT "zalo_messages_lead_fkey";

-- DropForeignKey
ALTER TABLE "zalo_user_profiles" DROP CONSTRAINT "zalo_user_profiles_connection_fkey";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "secondary_assigned_to" UUID,
ADD COLUMN     "secondary_phones" VARCHAR(30)[] DEFAULT ARRAY[]::VARCHAR(30)[];

-- AlterTable
ALTER TABLE "personal_dashboard_settings" ALTER COLUMN "kpi_widgets" DROP DEFAULT;

-- AlterTable
ALTER TABLE "personal_reports" ALTER COLUMN "filters" DROP DEFAULT;

-- CreateTable
CREATE TABLE "user_program_roles" (
    "user_id" UUID NOT NULL,
    "institution_program_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_program_roles_pkey" PRIMARY KEY ("user_id","institution_program_id")
);

-- CreateIndex
CREATE INDEX "idx_user_program_roles_program_role" ON "user_program_roles"("institution_program_id", "role_id");

-- CreateIndex
CREATE INDEX "idx_user_program_roles_role" ON "user_program_roles"("role_id");

-- CreateIndex
CREATE INDEX "idx_leads_secondary_assigned_to" ON "leads"("secondary_assigned_to");

-- CreateIndex
CREATE INDEX "idx_leads_secondary_phones" ON "leads" USING GIN ("secondary_phones");

-- RenameForeignKey
ALTER TABLE "automation_suppressions" RENAME CONSTRAINT "automation_suppressions_program_id_fkey" TO "automation_suppressions_institution_program_id_fkey";

-- RenameForeignKey
ALTER TABLE "automation_webhook_endpoints" RENAME CONSTRAINT "automation_webhook_endpoints_program_id_fkey" TO "automation_webhook_endpoints_institution_program_id_fkey";

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_secondary_assigned_to_fkey" FOREIGN KEY ("secondary_assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_program_roles" ADD CONSTRAINT "user_program_roles_catalog_fk" FOREIGN KEY ("role_id", "institution_program_id") REFERENCES "role_institution_programs"("role_id", "institution_program_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_program_roles" ADD CONSTRAINT "user_program_roles_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_program_roles" ADD CONSTRAINT "user_program_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_program_roles" ADD CONSTRAINT "user_program_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "display_layout_templates_institution_program_id_updated_at_id_i" RENAME TO "display_layout_templates_institution_program_id_updated_at__idx";

-- RenameIndex
ALTER INDEX "role_institution_programs_role_program_unique" RENAME TO "role_institution_programs_role_id_institution_program_id_key";
