---
name: admission-crm-access-control
description: >-
  Applies Admission CRM authentication, authorization, role, permission,
  scope, navigation visibility, role-dashboard, and reporting visibility
  rules. Use when Codex creates, modifies, debugs, or reviews protected APIs,
  RBAC logic, user/role management, sidebar or action visibility, dashboard
  access, or scoped business queries in this repository.
---
# Admission CRM Access Control

Apply these rules together with the repository `AGENTS.md` for any protected feature or role-aware UI.

## Authorization Contract

Enforce all three dimensions for protected business behavior:

```txt
Authentication + Permission + Scope
```

- A user may have multiple roles and departments.
- A role may have multiple permissions.
- Require explicit permissions for sensitive actions even with broad scope.
- Apply scope constraints to every list and detail query.
- Hide unavailable actions in the UI and enforce the same access on the API.
- Never grant access solely from hardcoded role names.

## Supported Roles And Scopes

Do not introduce other default roles or scopes without explicit instruction.

| Role | Default scope | Visibility |
| --- | --- | --- |
| `DIRECTOR` | `ALL` | Business overview, reports, audit visibility |
| `ADMIN` | Permission-defined | System configuration only by default |
| `MARKETING_MANAGER` | `DEPARTMENT` | Department marketing data |
| `MARKETING_STAFF` | `OWNED_ONLY` | Own campaigns, forms, generated leads |
| `SALE_MANAGER` | `DEPARTMENT` | Department leads, assignments, KPIs |
| `TELESALE` | `ASSIGNED_ONLY` | Assigned leads and related work |
| `ADMISSION_OFFICER` | `DEPARTMENT` | Admission applications and documents |
| `STUDENT_SERVICE` | `DEPARTMENT` | Enrolled students and services |
| `VIEWER` | `READ_ONLY` | Dashboard and report reading |

Supported scopes:

```txt
ALL
DEPARTMENT
ASSIGNED_ONLY
OWNED_ONLY
READ_ONLY
```

`ADMIN` does not automatically see all business data. `DIRECTOR` visibility does not automatically permit system configuration changes. Never return all leads to `TELESALE`.

## Permission Matrix

### Director

```txt
dashboard.view_all
report.view_all
lead.view_all
campaign.view_all
admission.view_all
student.view_all
audit.view
```

### Admin

```txt
user.manage
role.manage
permission.manage
department.manage
pipeline.manage
system.manage
audit.view
```

### Marketing Manager

Scope: `DEPARTMENT`.

```txt
campaign.view
campaign.create
campaign.update
campaign.delete
lead_source.manage
utm.view
marketing_form.manage
report.marketing.view
```

### Marketing Staff

Scope: `OWNED_ONLY`.

```txt
campaign.view_own
campaign.create
campaign.update_own
utm.view_own
marketing_form.create
marketing_form.update_own
report.marketing.view_own
```

### Sale Manager

Scope: `DEPARTMENT`.

```txt
lead.view_department
lead.assign
lead.reassign
lead.update_department
lead_activity.view_department
lead_note.view_department
pipeline.view
report.sale.view_department
```

### Telesale

Scope: `ASSIGNED_ONLY`.

```txt
lead.view_assigned
lead.update_assigned
lead_note.create
lead_activity.create
reminder.create
file.upload
```

Do not grant these permissions by default:

```txt
lead.delete
lead.export_all
lead.view_all
user.manage
role.manage
permission.manage
```

### Admission Officer

Scope: `DEPARTMENT`.

```txt
admission.view
admission.update
admission.approve
admission_document.view
admission_document.upload
admission_status.update
student.create_from_admission
```

### Student Service

Scope: `DEPARTMENT`.

```txt
student.view
student.update
student_service.view
student_service.create
student_service.update
```

### Viewer

Scope: `READ_ONLY`.

```txt
dashboard.view
report.view
```

Do not permit create, update, delete, assign, approve, or sensitive exports without separately assigned permission.

## Vietnamese Navigation

Generate navigation from permissions and applicable scope.

| Role | Default visible menu labels |
| --- | --- |
| `DIRECTOR` | Tổng quan, CRM Marketing, CRM Sale, CRM Tuyển sinh, CRM Sinh viên, Báo cáo, Nhật ký hệ thống |
| `ADMIN` | Hệ thống, Người dùng, Vai trò, Quyền hạn, Phòng ban, Pipeline, Cài đặt, Nhật ký hệ thống, Hàng đợi |
| `MARKETING_MANAGER` | Dashboard Marketing, Chiến dịch, Nguồn lead, Theo dõi UTM, Biểu mẫu, Báo cáo Marketing |
| `MARKETING_STAFF` | Chiến dịch của tôi, Biểu mẫu của tôi, Lead của tôi, Phân tích Marketing |
| `SALE_MANAGER` | Dashboard Sale, Danh sách lead, Phân công, Pipeline, KPI đội nhóm, Hoạt động, Nhắc việc |
| `TELESALE` | Dashboard của tôi, Lead của tôi, Pipeline của tôi, Nhắc việc, Hoạt động |
| `ADMISSION_OFFICER` | Dashboard Tuyển sinh, Hồ sơ, Tài liệu, Trạng thái hồ sơ, Phí / học phí |
| `STUDENT_SERVICE` | Dashboard Sinh viên, Sinh viên, Dịch vụ sinh viên, Lịch sử hỗ trợ |
| `VIEWER` | Dashboard, Báo cáo |

## Role Dashboards

Do not implement one generic dashboard for all roles. Display Vietnamese widget labels for the permitted dashboard.

- Director: total leads, applications, enrolled students, conversion rate, source and department breakdowns, staff KPI, admission funnel, and fee or revenue summary.
- Marketing: leads by campaign and source, UTM effectiveness, cost per lead, campaign conversion, and top campaigns.
- Sale: assigned and unprocessed leads, prospective leads, reminders, pipeline summary, activities, and conversion by telesale.
- Admission: pending applications, submitted and missing documents, fee and tuition status, enrolment count, and applications by major.
- Student: total and new students, service requests, status, class, and faculty breakdowns.
- Admin: users, active users, roles, departments, audit activity, queue status, and system settings.