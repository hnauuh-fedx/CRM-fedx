-- A lead keeps one main assignee (assigned_to) and at most one secondary assignee.
ALTER TABLE "leads" ADD COLUMN "secondary_assigned_to" UUID;

ALTER TABLE "leads" ADD CONSTRAINT "leads_secondary_assigned_to_fkey"
  FOREIGN KEY ("secondary_assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_leads_secondary_assigned_to" ON "leads"("secondary_assigned_to");
