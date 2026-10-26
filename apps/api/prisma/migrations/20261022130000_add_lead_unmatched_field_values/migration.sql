-- Raw webhook values that did not match a CRM option/type; displayed with "*" until a user resolves them.
CREATE TABLE "lead_unmatched_field_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL,
  "field_key" VARCHAR(200) NOT NULL,
  "field_label" VARCHAR(255) NOT NULL,
  "raw_value" TEXT NOT NULL,
  "webhook_id" UUID,
  "request_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_unmatched_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_lead_unmatched_field_values_lead_field"
  ON "lead_unmatched_field_values"("lead_id", "field_key");

ALTER TABLE "lead_unmatched_field_values"
  ADD CONSTRAINT "lead_unmatched_field_values_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
