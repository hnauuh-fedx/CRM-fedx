-- Expand only: unresolved legacy forms remain NULL for administrator review.
ALTER TABLE marketing_forms ADD COLUMN institution_program_id UUID;
ALTER TABLE marketing_forms ADD CONSTRAINT marketing_forms_institution_program_id_fkey
  FOREIGN KEY (institution_program_id) REFERENCES institution_programs(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
UPDATE marketing_forms AS form
SET institution_program_id = campaign.institution_program_id
FROM campaigns AS campaign
WHERE form.campaign_id = campaign.id AND campaign.institution_program_id IS NOT NULL;
CREATE INDEX idx_marketing_forms_program_created_page
  ON marketing_forms(institution_program_id, created_at, id);
