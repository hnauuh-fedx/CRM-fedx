-- Register permissions only. Grant them explicitly through role management.
INSERT INTO permissions (code, name, module, description)
VALUES
  ('student.convert_from_lead', 'Chuyển ứng viên sang học viên', 'student', 'Xác nhận học viên từ lead trong phạm vi dữ liệu được cấp.'),
  ('student.revert_to_candidate', 'Chuyển học viên trở lại ứng viên', 'student', 'Giữ hồ sơ và lịch sử khi đưa học viên trở lại danh sách Lead.')
ON CONFLICT (code) DO NOTHING;
