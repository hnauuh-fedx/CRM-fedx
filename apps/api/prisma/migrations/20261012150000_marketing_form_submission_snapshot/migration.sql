-- Nullable by design: old submissions have no historical configuration snapshot.
ALTER TABLE "marketing_form_submissions" ADD COLUMN "configuration_snapshot" JSONB;
