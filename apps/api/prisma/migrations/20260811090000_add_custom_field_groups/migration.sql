CREATE TABLE custom_field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  group_key VARCHAR(150) NOT NULL,
  group_label VARCHAR(255) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMP(6),
  created_by_id UUID,
  updated_by_id UUID,
  created_at TIMESTAMP(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_groups_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT custom_field_groups_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_custom_field_groups_entity_key UNIQUE (entity_type, group_key)
);

CREATE INDEX idx_custom_field_groups_entity_order
  ON custom_field_groups(entity_type, archived_at, display_order, id);

INSERT INTO custom_field_groups (id, entity_type, group_key, group_label, description, is_system, display_order)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'LEAD', 'basic', 'Thông tin cơ bản', 'Thông tin nhận diện và liên hệ của lead.', true, 10),
  ('10000000-0000-4000-8000-000000000002', 'LEAD', 'education', 'Học vấn và tốt nghiệp', 'Thông tin trường THPT, văn bằng và kết quả tốt nghiệp.', true, 20),
  ('10000000-0000-4000-8000-000000000003', 'LEAD', 'current-address', 'Địa chỉ và công việc hiện nay', 'Nơi cư trú hiện tại và thông tin công tác.', true, 30),
  ('10000000-0000-4000-8000-000000000004', 'LEAD', 'relatives', 'Người thân đại diện', 'Hai người liên hệ đại diện của lead.', true, 40),
  ('10000000-0000-4000-8000-000000000005', 'LEAD', 'admission', 'Thông tin tuyển sinh', 'Thông tin ngành, hồ sơ và kết quả xét tuyển.', true, 50),
  ('10000000-0000-4000-8000-000000000006', 'LEAD', 'classification', 'Chăm sóc và phân loại', 'Thông tin phục vụ telesale, marketing và phân loại lead.', true, 60),
  ('10000000-0000-4000-8000-000000000007', 'LEAD', 'additional', 'Thông tin bổ sung', 'Chương trình áp dụng và các trường dữ liệu tự cấu hình.', true, 70),
  ('20000000-0000-4000-8000-000000000001', 'ADMISSION_PROFILE', 'additional', 'Thông tin bổ sung', 'Các trường dữ liệu tự cấu hình của hồ sơ tuyển sinh.', true, 10),
  ('30000000-0000-4000-8000-000000000001', 'STUDENT', 'additional', 'Thông tin bổ sung', 'Các trường dữ liệu tự cấu hình của sinh viên.', true, 10)
ON CONFLICT (entity_type, group_key) DO NOTHING;

ALTER TABLE custom_fields ADD COLUMN group_id UUID;

UPDATE custom_fields AS field
SET group_id = field_group.id
FROM custom_field_groups AS field_group
WHERE field_group.entity_type = field.entity_type
  AND field_group.group_key = 'additional'
  AND field.group_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM custom_fields WHERE group_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill custom_fields.group_id: unsupported or missing entity_type.';
  END IF;
END $$;

ALTER TABLE custom_fields ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE custom_fields
  ADD CONSTRAINT custom_fields_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES custom_field_groups(id) ON DELETE RESTRICT;
CREATE INDEX idx_custom_fields_group_order ON custom_fields(group_id, display_order, id);

INSERT INTO permissions (id, code, name, module)
VALUES (gen_random_uuid(), 'custom_field.manage_groups', 'Quản lý nhóm trường dữ liệu', 'custom_field')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module;

INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = 'custom_field.manage_groups'
WHERE role.code = 'DIRECTOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;
