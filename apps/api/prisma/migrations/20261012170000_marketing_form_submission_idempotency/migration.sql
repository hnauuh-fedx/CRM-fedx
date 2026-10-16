ALTER TABLE "marketing_form_submissions"
  ADD COLUMN "idempotency_key" VARCHAR(128),
  ADD COLUMN "request_hash" VARCHAR(64);
CREATE UNIQUE INDEX "uq_marketing_form_submission_idempotency"
  ON "marketing_form_submissions" ("marketing_form_id", "idempotency_key");
