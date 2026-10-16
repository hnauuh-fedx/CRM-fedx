-- Bizfly exports may contain several phone numbers per contact ("0918979962|0963726127").
ALTER TABLE "leads" ADD COLUMN "secondary_phones" VARCHAR(30)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(30)[];

-- Supports duplicate checks and phone search against secondary numbers.
CREATE INDEX "idx_leads_secondary_phones" ON "leads" USING GIN ("secondary_phones");
