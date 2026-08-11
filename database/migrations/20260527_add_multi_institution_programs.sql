CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS program_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  program_type_id UUID NOT NULL REFERENCES program_types(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT institution_programs_institution_type_name_key
    UNIQUE (institution_id, program_type_id, name)
);

CREATE INDEX IF NOT EXISTS idx_institution_programs_institution_status
  ON institution_programs (institution_id, status, name);
CREATE INDEX IF NOT EXISTS idx_institution_programs_type_status
  ON institution_programs (program_type_id, status, name);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS major_id UUID REFERENCES majors(id);
ALTER TABLE admission_profiles ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS major_id UUID REFERENCES majors(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS institution_program_id UUID REFERENCES institution_programs(id);

CREATE INDEX IF NOT EXISTS idx_leads_program_created_page
  ON leads (institution_program_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_leads_major_created_page
  ON leads (major_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_admission_profiles_program_created_page
  ON admission_profiles (institution_program_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_students_program_enrolled_page
  ON students (institution_program_id, enrolled_at, id);
CREATE INDEX IF NOT EXISTS idx_students_major_enrolled_page
  ON students (major_id, enrolled_at, id);
CREATE INDEX IF NOT EXISTS idx_campaigns_program_created_page
  ON campaigns (institution_program_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_program_created_page
  ON lead_sources (institution_program_id, created_at, id);

CREATE TABLE IF NOT EXISTS kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_program_id UUID NOT NULL REFERENCES institution_programs(id),
  target_type VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_value DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kpi_targets_program_type_period_key
    UNIQUE (institution_program_id, target_type, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_kpi_targets_program_period
  ON kpi_targets (institution_program_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS report_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_program_id UUID REFERENCES institution_programs(id),
  name VARCHAR(255) NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  filters JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_configs_program_type
  ON report_configs (institution_program_id, report_type);
