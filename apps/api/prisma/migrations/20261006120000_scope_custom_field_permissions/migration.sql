BEGIN;
UPDATE permissions SET module = 'system' WHERE code IN ('admission_major.manage', 'institution_program.manage');
CREATE TEMP TABLE scoped_custom_field_permissions (code text, name text, module text, legacy_code text) ON COMMIT DROP;
INSERT INTO scoped_custom_field_permissions VALUES
('custom_field.lead.view', 'Form lead: Xem cấu hình trường dữ liệu', 'sale', 'custom_field.view'),
('custom_field.lead.create', 'Form lead: Tạo trường dữ liệu', 'sale', 'custom_field.create'),
('custom_field.lead.update', 'Form lead: Cập nhật trường dữ liệu', 'sale', 'custom_field.update'),
('custom_field.lead.archive', 'Form lead: Lưu trữ trường dữ liệu', 'sale', 'custom_field.archive'),
('custom_field.lead.manage_options', 'Form lead: Quản lý lựa chọn trường dữ liệu', 'sale', 'custom_field.manage_options'),
('custom_field.lead.manage_groups', 'Form lead: Quản lý nhóm trường dữ liệu', 'sale', 'custom_field.manage_groups'),
('custom_field.lead.view_sensitive', 'Form lead: Xem cấu hình trường nhạy cảm', 'sale', 'custom_field.view_sensitive'),
('custom_field.lead.edit_sensitive', 'Form lead: Chỉnh sửa cấu hình trường nhạy cảm', 'sale', 'custom_field.edit_sensitive'),
('custom_field.sale_activity.view', 'Form hoạt động Sale: Xem cấu hình trường dữ liệu', 'sale', 'custom_field.view'),
('custom_field.sale_activity.create', 'Form hoạt động Sale: Tạo trường dữ liệu', 'sale', 'custom_field.create'),
('custom_field.sale_activity.update', 'Form hoạt động Sale: Cập nhật trường dữ liệu', 'sale', 'custom_field.update'),
('custom_field.sale_activity.archive', 'Form hoạt động Sale: Lưu trữ trường dữ liệu', 'sale', 'custom_field.archive'),
('custom_field.sale_activity.manage_options', 'Form hoạt động Sale: Quản lý lựa chọn trường dữ liệu', 'sale', 'custom_field.manage_options'),
('custom_field.sale_activity.manage_groups', 'Form hoạt động Sale: Quản lý nhóm trường dữ liệu', 'sale', 'custom_field.manage_groups'),
('custom_field.sale_activity.view_sensitive', 'Form hoạt động Sale: Xem cấu hình trường nhạy cảm', 'sale', 'custom_field.view_sensitive'),
('custom_field.sale_activity.edit_sensitive', 'Form hoạt động Sale: Chỉnh sửa cấu hình trường nhạy cảm', 'sale', 'custom_field.edit_sensitive'),
('custom_field.sale_reminder.view', 'Form nhắc việc Sale: Xem cấu hình trường dữ liệu', 'sale', 'custom_field.view'),
('custom_field.sale_reminder.create', 'Form nhắc việc Sale: Tạo trường dữ liệu', 'sale', 'custom_field.create'),
('custom_field.sale_reminder.update', 'Form nhắc việc Sale: Cập nhật trường dữ liệu', 'sale', 'custom_field.update'),
('custom_field.sale_reminder.archive', 'Form nhắc việc Sale: Lưu trữ trường dữ liệu', 'sale', 'custom_field.archive'),
('custom_field.sale_reminder.manage_options', 'Form nhắc việc Sale: Quản lý lựa chọn trường dữ liệu', 'sale', 'custom_field.manage_options'),
('custom_field.sale_reminder.manage_groups', 'Form nhắc việc Sale: Quản lý nhóm trường dữ liệu', 'sale', 'custom_field.manage_groups'),
('custom_field.sale_reminder.view_sensitive', 'Form nhắc việc Sale: Xem cấu hình trường nhạy cảm', 'sale', 'custom_field.view_sensitive'),
('custom_field.sale_reminder.edit_sensitive', 'Form nhắc việc Sale: Chỉnh sửa cấu hình trường nhạy cảm', 'sale', 'custom_field.edit_sensitive'),
('custom_field.marketing_campaign.view', 'Form chiến dịch Marketing: Xem cấu hình trường dữ liệu', 'marketing', 'custom_field.view'),
('custom_field.marketing_campaign.create', 'Form chiến dịch Marketing: Tạo trường dữ liệu', 'marketing', 'custom_field.create'),
('custom_field.marketing_campaign.update', 'Form chiến dịch Marketing: Cập nhật trường dữ liệu', 'marketing', 'custom_field.update'),
('custom_field.marketing_campaign.archive', 'Form chiến dịch Marketing: Lưu trữ trường dữ liệu', 'marketing', 'custom_field.archive'),
('custom_field.marketing_campaign.manage_options', 'Form chiến dịch Marketing: Quản lý lựa chọn trường dữ liệu', 'marketing', 'custom_field.manage_options'),
('custom_field.marketing_campaign.manage_groups', 'Form chiến dịch Marketing: Quản lý nhóm trường dữ liệu', 'marketing', 'custom_field.manage_groups'),
('custom_field.marketing_campaign.view_sensitive', 'Form chiến dịch Marketing: Xem cấu hình trường nhạy cảm', 'marketing', 'custom_field.view_sensitive'),
('custom_field.marketing_campaign.edit_sensitive', 'Form chiến dịch Marketing: Chỉnh sửa cấu hình trường nhạy cảm', 'marketing', 'custom_field.edit_sensitive'),
('custom_field.marketing_form.view', 'Form & Survey Marketing: Xem cấu hình trường dữ liệu', 'marketing', 'custom_field.view'),
('custom_field.marketing_form.create', 'Form & Survey Marketing: Tạo trường dữ liệu', 'marketing', 'custom_field.create'),
('custom_field.marketing_form.update', 'Form & Survey Marketing: Cập nhật trường dữ liệu', 'marketing', 'custom_field.update'),
('custom_field.marketing_form.archive', 'Form & Survey Marketing: Lưu trữ trường dữ liệu', 'marketing', 'custom_field.archive'),
('custom_field.marketing_form.manage_options', 'Form & Survey Marketing: Quản lý lựa chọn trường dữ liệu', 'marketing', 'custom_field.manage_options'),
('custom_field.marketing_form.manage_groups', 'Form & Survey Marketing: Quản lý nhóm trường dữ liệu', 'marketing', 'custom_field.manage_groups'),
('custom_field.marketing_form.view_sensitive', 'Form & Survey Marketing: Xem cấu hình trường nhạy cảm', 'marketing', 'custom_field.view_sensitive'),
('custom_field.marketing_form.edit_sensitive', 'Form & Survey Marketing: Chỉnh sửa cấu hình trường nhạy cảm', 'marketing', 'custom_field.edit_sensitive'),
('custom_field.admission_profile.view', 'Form hồ sơ tuyển sinh: Xem cấu hình trường dữ liệu', 'admission', 'custom_field.view'),
('custom_field.admission_profile.create', 'Form hồ sơ tuyển sinh: Tạo trường dữ liệu', 'admission', 'custom_field.create'),
('custom_field.admission_profile.update', 'Form hồ sơ tuyển sinh: Cập nhật trường dữ liệu', 'admission', 'custom_field.update'),
('custom_field.admission_profile.archive', 'Form hồ sơ tuyển sinh: Lưu trữ trường dữ liệu', 'admission', 'custom_field.archive'),
('custom_field.admission_profile.manage_options', 'Form hồ sơ tuyển sinh: Quản lý lựa chọn trường dữ liệu', 'admission', 'custom_field.manage_options'),
('custom_field.admission_profile.manage_groups', 'Form hồ sơ tuyển sinh: Quản lý nhóm trường dữ liệu', 'admission', 'custom_field.manage_groups'),
('custom_field.admission_profile.view_sensitive', 'Form hồ sơ tuyển sinh: Xem cấu hình trường nhạy cảm', 'admission', 'custom_field.view_sensitive'),
('custom_field.admission_profile.edit_sensitive', 'Form hồ sơ tuyển sinh: Chỉnh sửa cấu hình trường nhạy cảm', 'admission', 'custom_field.edit_sensitive'),
('custom_field.admission_document.view', 'Form tài liệu hồ sơ: Xem cấu hình trường dữ liệu', 'admission', 'custom_field.view'),
('custom_field.admission_document.create', 'Form tài liệu hồ sơ: Tạo trường dữ liệu', 'admission', 'custom_field.create'),
('custom_field.admission_document.update', 'Form tài liệu hồ sơ: Cập nhật trường dữ liệu', 'admission', 'custom_field.update'),
('custom_field.admission_document.archive', 'Form tài liệu hồ sơ: Lưu trữ trường dữ liệu', 'admission', 'custom_field.archive'),
('custom_field.admission_document.manage_options', 'Form tài liệu hồ sơ: Quản lý lựa chọn trường dữ liệu', 'admission', 'custom_field.manage_options'),
('custom_field.admission_document.manage_groups', 'Form tài liệu hồ sơ: Quản lý nhóm trường dữ liệu', 'admission', 'custom_field.manage_groups'),
('custom_field.admission_document.view_sensitive', 'Form tài liệu hồ sơ: Xem cấu hình trường nhạy cảm', 'admission', 'custom_field.view_sensitive'),
('custom_field.admission_document.edit_sensitive', 'Form tài liệu hồ sơ: Chỉnh sửa cấu hình trường nhạy cảm', 'admission', 'custom_field.edit_sensitive'),
('custom_field.admission_status.view', 'Form trạng thái hồ sơ: Xem cấu hình trường dữ liệu', 'admission', 'custom_field.view'),
('custom_field.admission_status.create', 'Form trạng thái hồ sơ: Tạo trường dữ liệu', 'admission', 'custom_field.create'),
('custom_field.admission_status.update', 'Form trạng thái hồ sơ: Cập nhật trường dữ liệu', 'admission', 'custom_field.update'),
('custom_field.admission_status.archive', 'Form trạng thái hồ sơ: Lưu trữ trường dữ liệu', 'admission', 'custom_field.archive'),
('custom_field.admission_status.manage_options', 'Form trạng thái hồ sơ: Quản lý lựa chọn trường dữ liệu', 'admission', 'custom_field.manage_options'),
('custom_field.admission_status.manage_groups', 'Form trạng thái hồ sơ: Quản lý nhóm trường dữ liệu', 'admission', 'custom_field.manage_groups'),
('custom_field.admission_status.view_sensitive', 'Form trạng thái hồ sơ: Xem cấu hình trường nhạy cảm', 'admission', 'custom_field.view_sensitive'),
('custom_field.admission_status.edit_sensitive', 'Form trạng thái hồ sơ: Chỉnh sửa cấu hình trường nhạy cảm', 'admission', 'custom_field.edit_sensitive'),
('custom_field.admission_major.view', 'Form ngành: Xem cấu hình trường dữ liệu', 'system', 'custom_field.view'),
('custom_field.admission_major.create', 'Form ngành: Tạo trường dữ liệu', 'system', 'custom_field.create'),
('custom_field.admission_major.update', 'Form ngành: Cập nhật trường dữ liệu', 'system', 'custom_field.update'),
('custom_field.admission_major.archive', 'Form ngành: Lưu trữ trường dữ liệu', 'system', 'custom_field.archive'),
('custom_field.admission_major.manage_options', 'Form ngành: Quản lý lựa chọn trường dữ liệu', 'system', 'custom_field.manage_options'),
('custom_field.admission_major.manage_groups', 'Form ngành: Quản lý nhóm trường dữ liệu', 'system', 'custom_field.manage_groups'),
('custom_field.admission_major.view_sensitive', 'Form ngành: Xem cấu hình trường nhạy cảm', 'system', 'custom_field.view_sensitive'),
('custom_field.admission_major.edit_sensitive', 'Form ngành: Chỉnh sửa cấu hình trường nhạy cảm', 'system', 'custom_field.edit_sensitive'),
('custom_field.student.view', 'Form sinh viên: Xem cấu hình trường dữ liệu', 'student', 'custom_field.view'),
('custom_field.student.create', 'Form sinh viên: Tạo trường dữ liệu', 'student', 'custom_field.create'),
('custom_field.student.update', 'Form sinh viên: Cập nhật trường dữ liệu', 'student', 'custom_field.update'),
('custom_field.student.archive', 'Form sinh viên: Lưu trữ trường dữ liệu', 'student', 'custom_field.archive'),
('custom_field.student.manage_options', 'Form sinh viên: Quản lý lựa chọn trường dữ liệu', 'student', 'custom_field.manage_options'),
('custom_field.student.manage_groups', 'Form sinh viên: Quản lý nhóm trường dữ liệu', 'student', 'custom_field.manage_groups'),
('custom_field.student.view_sensitive', 'Form sinh viên: Xem cấu hình trường nhạy cảm', 'student', 'custom_field.view_sensitive'),
('custom_field.student.edit_sensitive', 'Form sinh viên: Chỉnh sửa cấu hình trường nhạy cảm', 'student', 'custom_field.edit_sensitive');
INSERT INTO permissions (code, name, module, is_active)
SELECT code, name, module, true FROM scoped_custom_field_permissions
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module;
-- Translate only active legacy grants, action for action. No new action is granted.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT grant_row.role_id, replacement.id
FROM role_permissions grant_row
JOIN permissions legacy ON legacy.id = grant_row.permission_id AND legacy.is_active IS TRUE
JOIN scoped_custom_field_permissions mapping ON mapping.legacy_code = legacy.code
JOIN permissions replacement ON replacement.code = mapping.code
ON CONFLICT (role_id, permission_id) DO NOTHING;
DELETE FROM role_permissions WHERE permission_id IN (
 SELECT id FROM permissions WHERE code IN (SELECT DISTINCT legacy_code FROM scoped_custom_field_permissions)
);
UPDATE permissions SET is_active = false WHERE code IN (SELECT DISTINCT legacy_code FROM scoped_custom_field_permissions);
COMMIT;

