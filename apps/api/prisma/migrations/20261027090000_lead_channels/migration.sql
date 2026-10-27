-- "Nguồn" becomes a per-program list of values, separate from Nguồn học viên (lead_sources).
CREATE TABLE "lead_channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_program_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_auto_created" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "lead_channels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_channels_institution_program_id_fkey" FOREIGN KEY ("institution_program_id") REFERENCES "institution_programs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "lead_channels_institution_program_id_normalized_name_key" ON "lead_channels"("institution_program_id", "normalized_name");
CREATE INDEX "lead_channels_institution_program_id_created_at_id_idx" ON "lead_channels"("institution_program_id", "created_at", "id");
CREATE INDEX "lead_channels_institution_program_id_is_active_name_idx" ON "lead_channels"("institution_program_id", "is_active", "name");

ALTER TABLE "lead_source_occurrences" ADD COLUMN "channel_id" UUID;
ALTER TABLE "lead_source_occurrences"
  ADD CONSTRAINT "lead_source_occurrences_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "lead_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "lead_source_occurrences_channel_id_lead_id_idx" ON "lead_source_occurrences"("channel_id", "lead_id");

-- Existing source names become regular (not auto-created) values of the occurrence's program.
INSERT INTO "lead_channels" ("institution_program_id", "name", "normalized_name")
SELECT origin.institution_program_id,
       min(btrim(occurrence.source_name)),
       lower(regexp_replace(btrim(occurrence.source_name), '\s+', ' ', 'g'))
FROM "lead_source_occurrences" occurrence
JOIN "lead_origins" origin ON origin.id = occurrence.origin_id
WHERE btrim(occurrence.source_name) <> ''
GROUP BY origin.institution_program_id, lower(regexp_replace(btrim(occurrence.source_name), '\s+', ' ', 'g'))
ON CONFLICT ("institution_program_id", "normalized_name") DO NOTHING;

UPDATE "lead_source_occurrences" occurrence
SET "channel_id" = channel.id
FROM "lead_origins" origin, "lead_channels" channel
WHERE origin.id = occurrence.origin_id
  AND channel.institution_program_id = origin.institution_program_id
  AND channel.normalized_name = lower(regexp_replace(btrim(occurrence.source_name), '\s+', ' ', 'g'));

INSERT INTO permissions (code, name, module, is_active)
VALUES
  ('lead_channel.view', 'Xem danh mục Nguồn', 'marketing', true),
  ('lead_channel.manage', 'Quản lý danh mục Nguồn', 'marketing', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module, is_active = true;

INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code IN ('lead_channel.view', 'lead_channel.manage')
WHERE role.code IN ('DIRECTOR', 'MARKETING_MANAGER')
ON CONFLICT (role_id, permission_id) DO NOTHING;
