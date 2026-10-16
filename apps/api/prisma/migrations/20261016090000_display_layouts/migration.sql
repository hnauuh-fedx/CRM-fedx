CREATE TABLE display_layout_templates (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), institution_program_id UUID NOT NULL,
 management_department_id UUID, draft JSONB NOT NULL, published JSONB,
 revision INTEGER NOT NULL DEFAULT 1, published_version INTEGER NOT NULL DEFAULT 0,
 created_by UUID NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX display_layout_templates_institution_program_id_updated_at_id_idx ON display_layout_templates(institution_program_id, updated_at, id);
CREATE TABLE display_layout_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), template_id UUID NOT NULL,
 version INTEGER NOT NULL, snapshot JSONB NOT NULL, actor_id UUID NOT NULL, actor_name VARCHAR(255) NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX display_layout_versions_template_id_version_key ON display_layout_versions(template_id, version);
CREATE TABLE display_layout_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), institution_program_id UUID NOT NULL,
 target_type VARCHAR(20) NOT NULL, target_id VARCHAR(36) NOT NULL, template_id UUID NOT NULL
);
CREATE UNIQUE INDEX display_layout_assignments_institution_program_id_target_type_t_key ON display_layout_assignments(institution_program_id, target_type, target_id);
CREATE INDEX display_layout_assignments_template_id_idx ON display_layout_assignments(template_id);
CREATE TABLE display_layout_program_state (institution_program_id UUID PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
