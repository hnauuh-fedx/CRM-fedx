INSERT INTO permissions (id, code, name, module)
VALUES
  (gen_random_uuid(), 'custom_field.view', 'Xem cấu hình trường dữ liệu', 'custom_field'),
  (gen_random_uuid(), 'custom_field.create', 'Tạo trường dữ liệu', 'custom_field'),
  (gen_random_uuid(), 'custom_field.update', 'Cập nhật trường dữ liệu', 'custom_field'),
  (gen_random_uuid(), 'custom_field.archive', 'Lưu trữ trường dữ liệu', 'custom_field'),
  (gen_random_uuid(), 'custom_field.manage_options', 'Quản lý lựa chọn trường dữ liệu', 'custom_field'),
  (gen_random_uuid(), 'custom_field.manage_groups', 'Quản lý nhóm trường dữ liệu', 'custom_field')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module;

INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code IN (
  'custom_field.view',
  'custom_field.create',
  'custom_field.update',
  'custom_field.archive',
  'custom_field.manage_options',
  'custom_field.manage_groups'
)
WHERE role.code = 'SALE_MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;
