INSERT INTO custom_field_groups (id, entity_type, group_key, group_label, description, is_system, display_order)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'SALE_ACTIVITY', 'basic', 'Thông tin hoạt động', 'Thông tin chính dùng để ghi nhận hoạt động chăm sóc lead.', true, 10),
  ('40000000-0000-4000-8000-000000000002', 'SALE_ACTIVITY', 'additional', 'Thông tin bổ sung', 'Các trường dữ liệu tự cấu hình cho form hoạt động sale.', true, 20),
  ('50000000-0000-4000-8000-000000000001', 'SALE_REMINDER', 'basic', 'Thông tin nhắc việc', 'Thông tin chính dùng để tạo và theo dõi nhắc việc sale.', true, 10),
  ('50000000-0000-4000-8000-000000000002', 'SALE_REMINDER', 'additional', 'Thông tin bổ sung', 'Các trường dữ liệu tự cấu hình cho form nhắc việc sale.', true, 20)
ON CONFLICT (entity_type, group_key) DO NOTHING;
