CREATE TABLE "automation_reassignment_monitors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL,
  "node_id" VARCHAR(255) NOT NULL,
  "assignment_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "assignee_id" UUID NOT NULL,
  "actor_id" UUID,
  "institution_program_id" UUID,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "warning_due_at" TIMESTAMP(6),
  "reassignment_due_at" TIMESTAMP(6) NOT NULL,
  "warned_at" TIMESTAMP(6),
  "claimed_at" TIMESTAMP(6),
  "processed_at" TIMESTAMP(6),
  "reassignment_count" INTEGER NOT NULL DEFAULT 0,
  "pool_cycle" INTEGER NOT NULL DEFAULT 0,
  "attempted_assignee_ids" JSONB NOT NULL,
  "node_snapshot" JSONB NOT NULL,
  "policy_snapshot" JSONB NOT NULL,
  "next_assignment_id" UUID,
  "completion_reason" VARCHAR(100),
  "last_error" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_reassignment_monitors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_reassignment_monitors_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "lead_assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_next_assignment_id_fkey" FOREIGN KEY ("next_assignment_id") REFERENCES "lead_assignments"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "automation_reassignment_monitors_status_check" CHECK ("status" IN ('pending', 'warned', 'processing', 'reassigned', 'cancelled', 'completed', 'failed')),
  CONSTRAINT "automation_reassignment_monitors_reassignment_count_check" CHECK ("reassignment_count" >= 0),
  CONSTRAINT "automation_reassignment_monitors_pool_cycle_check" CHECK ("pool_cycle" >= 0),
  CONSTRAINT "uq_automation_reassignment_rule_node_assignment" UNIQUE ("rule_id", "node_id", "assignment_id")
);

CREATE INDEX "idx_automation_reassignment_warning_due"
  ON "automation_reassignment_monitors"("status", "warning_due_at", "id");
CREATE INDEX "idx_automation_reassignment_expiry_due"
  ON "automation_reassignment_monitors"("status", "reassignment_due_at", "id");
CREATE INDEX "idx_automation_reassignment_lead_status"
  ON "automation_reassignment_monitors"("lead_id", "status", "id");
CREATE INDEX "idx_automation_reassignment_assignment"
  ON "automation_reassignment_monitors"("assignment_id");
