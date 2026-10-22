-- Diagnostic schema diff only. Unrelated drift was not applied automatically.
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
ALTER TABLE "personal_dashboard_settings" ALTER COLUMN "kpi_widgets" DROP DEFAULT;

-- AlterTable
ALTER TABLE "personal_reports" ALTER COLUMN "filters" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "automation_suppressions" RENAME CONSTRAINT "automation_suppressions_program_id_fkey" TO "automation_suppressions_institution_program_id_fkey";

-- RenameForeignKey
ALTER TABLE "automation_webhook_endpoints" RENAME CONSTRAINT "automation_webhook_endpoints_program_id_fkey" TO "automation_webhook_endpoints_institution_program_id_fkey";

-- RenameIndex
ALTER INDEX "display_layout_templates_institution_program_id_updated_at_id_i" RENAME TO "display_layout_templates_institution_program_id_updated_at__idx";

-- RenameIndex
ALTER INDEX "role_institution_programs_role_program_unique" RENAME TO "role_institution_programs_role_id_institution_program_id_key";
