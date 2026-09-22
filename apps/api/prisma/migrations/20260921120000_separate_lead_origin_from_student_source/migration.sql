CREATE TABLE "lead_origins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_program_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "normalized_name" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_origins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_origins_institution_program_id_normalized_name_key"
    ON "lead_origins"("institution_program_id", "normalized_name");
CREATE INDEX "lead_origins_institution_program_id_name_idx"
    ON "lead_origins"("institution_program_id", "name");

ALTER TABLE "lead_origins" ADD CONSTRAINT "lead_origins_institution_program_id_fkey"
    FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "leads" ADD COLUMN "origin_id" UUID;
CREATE INDEX "idx_leads_origin_id" ON "leads"("origin_id");
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_id_fkey"
    FOREIGN KEY ("origin_id") REFERENCES "lead_origins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
