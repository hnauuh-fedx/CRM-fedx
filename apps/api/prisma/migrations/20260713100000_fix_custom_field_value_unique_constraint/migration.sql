-- Prisma upsert requires a named UNIQUE constraint, not a partial index.
DROP INDEX IF EXISTS uq_custom_field_values_field_entity;
ALTER TABLE custom_field_values DROP CONSTRAINT IF EXISTS uq_custom_field_values_field_entity;
ALTER TABLE custom_field_values
  ADD CONSTRAINT uq_custom_field_values_field_entity
  UNIQUE (custom_field_id, entity_type, entity_id);
