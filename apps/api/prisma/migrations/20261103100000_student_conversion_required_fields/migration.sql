-- Custom Lead fields that must hold a value before a lead can be converted to a student.
ALTER TABLE custom_fields ADD COLUMN is_required_for_student boolean NOT NULL DEFAULT false;
