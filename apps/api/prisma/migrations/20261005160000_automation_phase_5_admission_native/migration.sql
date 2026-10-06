ALTER TABLE "admission_profiles"
ADD COLUMN "expires_at" DATE;

CREATE INDEX "idx_admission_profiles_expires_page"
ON "admission_profiles"("expires_at", "id");
