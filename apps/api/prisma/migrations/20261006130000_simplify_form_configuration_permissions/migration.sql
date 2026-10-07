BEGIN;
CREATE TEMP TABLE form_management_permissions (form_key text PRIMARY KEY, code text, name text, module text);
INSERT INTO form_management_permissions VALUES
('lead', 'custom_field.lead.manage', 'Quản lý cấu hình trường dữ liệu — Form lead', 'sale'),
('sale_activity', 'custom_field.sale_activity.manage', 'Quản lý cấu hình trường dữ liệu — Form hoạt động Sale', 'sale'),
('sale_reminder', 'custom_field.sale_reminder.manage', 'Quản lý cấu hình trường dữ liệu — Form nhắc việc Sale', 'sale'),
('marketing_campaign', 'custom_field.marketing_campaign.manage', 'Quản lý cấu hình trường dữ liệu — Form chiến dịch Marketing', 'marketing'),
('marketing_form', 'custom_field.marketing_form.manage', 'Quản lý cấu hình trường dữ liệu — Form & Survey Marketing', 'marketing'),
('admission_profile', 'custom_field.admission_profile.manage', 'Quản lý cấu hình trường dữ liệu — Form hồ sơ tuyển sinh', 'admission'),
('admission_document', 'custom_field.admission_document.manage', 'Quản lý cấu hình trường dữ liệu — Form tài liệu hồ sơ', 'admission'),
('admission_status', 'custom_field.admission_status.manage', 'Quản lý cấu hình trường dữ liệu — Form trạng thái hồ sơ', 'admission'),
('student', 'custom_field.student.manage', 'Quản lý cấu hình trường dữ liệu — Form sinh viên', 'student');
INSERT INTO permissions (code, name, module, is_active)
SELECT code, name, module, true FROM form_management_permissions
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module, is_active = true;

-- Only complete legacy grants are equivalent to full form management.
-- Partial grants must be explicitly reviewed, not automatically escalated.
INSERT INTO role_permissions (role_id, permission_id)
SELECT legacy_grants.role_id, replacement.id
FROM (
 SELECT grants.role_id, forms.code
 FROM role_permissions grants
 JOIN permissions legacy ON legacy.id = grants.permission_id AND legacy.is_active IS TRUE
 JOIN form_management_permissions forms ON legacy.code IN (
 'custom_field.' || forms.form_key || '.view',
 'custom_field.' || forms.form_key || '.create',
 'custom_field.' || forms.form_key || '.update',
 'custom_field.' || forms.form_key || '.archive',
 'custom_field.' || forms.form_key || '.manage_options',
 'custom_field.' || forms.form_key || '.manage_groups',
 'custom_field.' || forms.form_key || '.view_sensitive',
 'custom_field.' || forms.form_key || '.edit_sensitive'
 )
 GROUP BY grants.role_id, forms.code
 HAVING count(DISTINCT legacy.code) = 8
) legacy_grants
JOIN permissions replacement ON replacement.code = legacy_grants.code
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TEMP TABLE retired_configuration_permissions AS
SELECT id FROM permissions WHERE
 code ~ '^custom_field\.(lead|sale_activity|sale_reminder|marketing_campaign|marketing_form|admission_profile|admission_document|admission_status|admission_major|student)\.(view|create|update|archive|manage_options|manage_groups|view_sensitive|edit_sensitive)$'
 OR code IN ('custom_field.view', 'custom_field.create', 'custom_field.update', 'custom_field.archive', 'custom_field.manage_options', 'custom_field.manage_groups', 'custom_field.view_sensitive', 'custom_field.edit_sensitive', 'custom_field.admission_major.manage');
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM retired_configuration_permissions);
UPDATE permissions SET is_active = false WHERE id IN (SELECT id FROM retired_configuration_permissions);
-- Existing custom fields and values, including major fields, remain intact.
COMMIT;
