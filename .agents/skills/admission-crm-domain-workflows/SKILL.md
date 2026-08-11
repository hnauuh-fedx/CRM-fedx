---
name: admission-crm-domain-workflows
description: >-
  Applies Admission CRM data-model, lead assignment, pipeline, marketing,
  admission, student, file, notification, audit, API listing, and
  business-form rules. Use when Codex creates, edits, debugs, or reviews CRM
  domain modules, PostgreSQL or Prisma changes, business mutations, list APIs,
  uploads, conversion flows, or major forms in this repository.
---
# Admission CRM Domain Workflows

Apply these rules together with repository `AGENTS.md`. For any protected business behavior, also load `../admission-crm-access-control/SKILL.md`.

## Schema Source Of Truth

Inspect the existing PostgreSQL schema and Prisma definitions before adding models or migrations. Do not duplicate a matching table or make a giant customer table containing multiple domains.

Core domain tables:

```txt
users
roles
permissions
user_roles
role_permissions
departments
user_departments

leads
lead_assignments
lead_activities
lead_notes
lead_status_histories
reminders

campaigns
lead_sources
utm_trackings
marketing_forms

student_profiles
addresses
relatives

faculties
majors
admission_statuses
admission_profiles
admission_documents

students
student_classes
student_services

files
file_relations

notifications
automation_jobs
sla_rules

audit_logs
system_settings
tags
entity_tags
custom_fields
custom_field_values

pipelines
pipeline_stages
```

Store extended person, admission, address, relative, file, and custom-field data in the corresponding domain tables rather than expanding `leads`.

## Leads, Assignment, And Pipeline

`leads` is the CRM Sale core entity. It may relate to profile, source, campaign tracking, assignment, pipeline, notes, activities, reminders, files, admission, and eventual student conversion.

For lead assignment or reassignment, perform one business operation that:

- Records `lead_assignments`.
- Creates `lead_activities`.
- Creates `audit_logs`.
- Creates `notifications`.

Never hardcode pipeline stages in frontend or backend. Read stages from `pipelines` and `pipeline_stages`.

For a lead stage change:

- Update `leads.pipeline_stage_id`.
- Insert `lead_status_histories`.
- Insert `lead_activities`.
- Insert `audit_logs`.

Add timeline activities for lead creation or assignment, stage changes, notes, reminders, file upload, admission updates, and student creation. Use `lead_activities` for the business timeline and `audit_logs` for system traceability.

## Domain Boundaries

### Marketing

Use `campaigns`, `lead_sources`, `marketing_forms`, and `utm_trackings`. Lead screens may display source or campaign values, but campaign management logic must remain in the marketing module.

### Admission

Use `admission_profiles`, `admission_documents`, `admission_statuses`, `majors`, and `faculties`.

Convert a lead to a student only when an admission profile exists. The conversion operation must:

- Verify the admission profile.
- Create the student record.
- Update admission status.
- Create a lead activity.
- Create an audit entry.

### Student

Treat only confirmed enrolled records as students. Use `students`, `student_classes`, and `student_services` after admission confirmation.

## Files, Notifications, And Audits

- Store file associations through `files`, `file_relations`, and `admission_documents`; do not add file columns to lead, admission, or student records.
- File metadata must include `file_name`, `file_url`, `mime_type`, `file_size`, `uploaded_by`, and `created_at`.
- Create notifications for assignment, due reminders, admission approval, missing documents, student creation, and SLA violation.
- Do not use browser alerts as the primary notification mechanism.
- Write audit logs for relevant create, update, delete, assign, and approve actions.

Audit data must include:

```txt
user_id
entity_type
entity_id
action
old_data
new_data
ip_address
created_at
```

## APIs And Large Lists

Group API routes by domain:

```txt
/auth/login
/users
/roles
/permissions
/departments
/leads
/leads/:id
/leads/:id/assign
/leads/:id/activities
/leads/:id/notes
/leads/:id/reminders
/campaigns
/lead-sources
/utm-trackings
/admissions
/admissions/:id/documents
/admissions/:id/approve
/students
/students/:id/services
/reports
/audit-logs
/notifications
```

Protected endpoints require authentication, permission, and scope checks. Lists for leads, students, admission profiles, campaigns, audit logs, and notifications require server-side pagination, search, filtering, and sorting.

Use paged query conventions such as:

```txt
?page=1&limit=20&search=&status=&source=&assigned_to=
```

Use TanStack Table in large frontend lists and show Vietnamese loading, empty, and error states.

## Major Forms

Use React Hook Form and Zod. Present validation messages in Vietnamese.

Lead creation:

```txt
required: full_name, phone, source_id
optional: email, gender, date_of_birth, cccd, note
```

Admission creation:

```txt
required: lead_id, major_id, admission_status_id
```