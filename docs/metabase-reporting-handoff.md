# Metabase Reporting Integration Handoff

## Purpose

This document carries project context between Codex accounts and sessions for the planned **"Tao bao cao thong ke"** feature in Admission CRM.

The selected open-source BI platform is **Metabase Open Source Edition (OSS)**. The intended integration is to run Metabase as a separate service and embed approved dashboards in Admission CRM. Do not copy the Metabase Java/Clojure source tree into this monorepo and do not attempt to rewrite Metabase as React components.

Status as of 2026-08-18: research and architecture review are complete. No Metabase service, reporting schema, embed endpoint, or Metabase frontend integration has been implemented yet.

## Repository Context

Read and follow `AGENTS.md` before making changes. For this feature, also read:

- `.agents/skills/admission-crm-access-control/SKILL.md`
- `.agents/skills/admission-crm-domain-workflows/SKILL.md`
- `.agents/skills/ui-ux-pro-max/SKILL.md` before implementing UI
- `.agents/skills/react-doctor/SKILL.md` before completing React changes

Current stack:

- Frontend: `apps/web`, React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query.
- Backend: `apps/api`, Express 5, TypeScript, Prisma, PostgreSQL, JWT and RBAC.
- Infrastructure: root `docker-compose.yml` currently defines PostgreSQL only.
- Data volume requirement: support at least 50,000 students and plan for more than 500,000 records.

All end-user UI copy must be Vietnamese. Code identifiers, routes, DTO fields and permission keys must be English.

## Existing Reporting Functionality

The project already contains native reporting code:

- API router: `apps/api/src/modules/reports/reports.router.ts`
- Overview report: `apps/api/src/modules/reports/report-overview.service.ts`
- Domain reports: `apps/api/src/modules/reports/report-detail.service.ts`
- Web service: `apps/web/src/services/report.service.ts`
- Report types: `apps/web/src/modules/reports/report.types.ts`
- Report pages: `apps/web/src/modules/reports/pages/`
- Navigation: `apps/web/src/components/layout/navigation.ts`
- Routes: `apps/web/src/routes/app-routes.tsx`
- Database model: `report_configs` in `apps/api/prisma/schema.prisma`

Existing reports cover overview, Marketing, Sale, Admission and Student metrics. Keep these native reports for operational, role-specific KPIs. Metabase should extend the system with configurable dashboards, charts, tables and multi-dimensional analysis rather than replacing all existing report APIs immediately.

The current `report_configs` model only stores a report name, type, filters and active status. It is not yet a report builder and is not linked to Metabase dashboard/question IDs.

## Locked Architecture Decision

Use the official Metabase OSS release as an independently deployed service:

```text
Admission CRM web
    -> Admission CRM API (authentication, permission and scope validation)
        -> short-lived signed Metabase guest embed JWT
            -> Metabase OSS dashboard
                -> read-only reporting schema or reporting database
                    -> PostgreSQL operational data / read replica
```

Required principles:

1. Use an official, version-pinned Metabase Docker image. Do not use `latest` in production.
2. Give Metabase a dedicated PostgreSQL application database for its own users, questions and dashboards. Do not use the default H2 database in production.
3. Connect Metabase to Admission CRM through a separate read-only PostgreSQL account.
4. Grant that account access only to a curated reporting schema or approved views/materialized views.
5. Never expose password hashes, `cccd`, phone, email, private notes, file URLs, audit payloads or other unnecessary personal data to Metabase.
6. Do not let browser code hold the Metabase embedding secret. Admission CRM API must sign short-lived guest tokens.
7. CRM authorization remains `Authentication + Permission + Scope`. An embedded dashboard must never widen access granted by Admission CRM.
8. Do not query heavy analytics directly against the primary operational database in production. Use a read replica, materialized views or aggregate tables as volume grows.
9. Keep existing native reports working during rollout.

## Scope Mapping

Admission CRM currently enforces visibility in the API and Prisma layer. A direct BI database connection bypasses that logic, so scope must be explicitly carried into reporting datasets and embed tokens.

Supported scopes:

- `ALL`
- `DEPARTMENT`
- `ASSIGNED_ONLY`
- `OWNED_ONLY`
- `READ_ONLY`

Each reporting dataset should expose only the non-sensitive scope dimensions it needs, such as:

- `institution_program_id`
- `department_id`
- `owner_id`
- `assigned_to`
- `created_at`, `enrolled_at` or another report date

The embed-token endpoint must derive locked Metabase parameters from the authenticated `AuthUser`, including:

- `institutionProgramIds`
- `departmentIds`
- `accessScope`
- relevant report permissions
- current user ID for owned or assigned-only reports

Never accept these scope values from the browser without validating them against `request.authUser`.

Metabase OSS guest embedding does not apply normal Metabase user row/column security. Use signed locked parameters for every guest dashboard, plus database-level least privilege and curated views. Public embedding is forbidden.

## Proposed Reporting Data Layer

Start with a new reporting schema, for example `reporting`. Candidate views:

- `reporting.lead_funnel`
- `reporting.sale_performance`
- `reporting.marketing_attribution`
- `reporting.admission_conversion`
- `reporting.student_enrollment`

Design each view around stable business definitions. Avoid letting every dashboard recreate joins and conversion formulas independently.

Special considerations:

- Lead scope depends on `leads`, `lead_assignments`, departments, owner and assignee relationships.
- Pipeline names must come from `pipelines` and `pipeline_stages`; never hardcode stages.
- Marketing attribution uses campaigns, lead sources, UTM tracking, leads, admission profiles and students.
- Custom fields use an EAV-style model. Only flatten approved fields into reporting views; do not expose every custom-field value by default.
- Soft-deleted leads (`deleted_at IS NOT NULL`) should be excluded unless a specific audited report requires them.
- Define one timezone policy for daily/monthly aggregation before writing materialized views.

For 50,000 records, normal indexed reporting views may be sufficient. Before 500,000+ records or high concurrent dashboard usage, add materialized views/aggregate tables, refresh jobs, query timeouts and a read replica.

## Expected CRM Integration Points

The exact file list must be confirmed after re-reading the current branch, but the likely integration surface is:

### Infrastructure

- Root `docker-compose.yml`: add a local Metabase service and a dedicated Metabase application database for development.
- Add documented environment variable names to the appropriate example/config documentation. Never commit secrets.
- Pin the Metabase image version.

### Database

- Add reviewed SQL migrations for the `reporting` schema, views/materialized views and a least-privilege reporting role.
- Keep Prisma as the source of truth for application-owned tables. Reporting-only SQL views may require explicit SQL migrations and documentation if Prisma does not manage them cleanly.

### Backend

- Keep code inside `apps/api/src/modules/reports/` unless an established integration boundary clearly fits better.
- Add a protected endpoint such as `POST /api/reports/metabase/embed-token` or `GET /api/reports/metabase/dashboards/:key/embed`.
- Validate dashboard keys against a server-side allowlist or persisted approved configuration. Never accept arbitrary Metabase resource IDs from an untrusted client.
- Require authentication, report permission and scope.
- Sign short-lived JWTs with a server-only environment secret.
- Write audit logs when administrators create, update, publish or disable report configurations.
- Do not log embed tokens or secrets.

### Frontend

- Add a report page under `apps/web/src/modules/reports/` that embeds an approved Metabase dashboard.
- Preserve the current Vietnamese navigation and permission-driven route protection.
- Show Vietnamese loading, error, expired-session and unavailable-dashboard states.
- Keep the iframe/container responsive and accessible.
- Do not expose secrets or construct trusted scope filters solely in browser code.

### Report Configuration

Decide whether to extend `report_configs` or add a dedicated integration model. A minimal approved mapping may need:

- internal report key
- Vietnamese display name
- Metabase dashboard ID
- required permission
- report domain
- allowed filter keys
- active/published status
- institution program ownership if applicable

Do not alter the database schema until this mapping and migration strategy are approved.

## Target User Experience

The desired result is similar to the reporting experience expected from BizCRM:

- dashboards with cards, charts and tables
- filters by date, institution program, department, employee, source, campaign, pipeline stage, major and status where applicable
- Marketing, Sale, Admission and Student report collections
- drill-down only when it does not reveal records outside the current user's scope
- administrators or approved analysts create reports in Metabase
- ordinary CRM users view only published, permission-approved dashboards inside Admission CRM

For the OSS phase, report authoring can happen in the separate Metabase administration UI. Embedded CRM pages are primarily for viewing and filtering approved dashboards. Full in-app self-service query building is not part of the initial OSS milestone.

## Suggested Delivery Phases

### Phase 0 - Re-audit and approval

- Re-read `AGENTS.md`, the relevant skills, current schema, reporting code and deployment files.
- Check the current git status and preserve unrelated user changes.
- Confirm the exact Metabase OSS version and embedding APIs from official documentation.
- Produce an implementation plan and exact file list.
- Stop for user approval before adding infrastructure, dependencies or database migrations.

### Phase 1 - Local proof of concept

- Run pinned Metabase OSS locally with a dedicated PostgreSQL application database.
- Create one safe reporting view without PII.
- Create one Sale or overview dashboard.
- Add one protected backend guest-token endpoint.
- Embed the dashboard on one protected CRM report route.
- Prove that changing browser parameters cannot escape the authenticated program/department/user scope.

### Phase 2 - Production hardening

- Introduce read-only DB credentials, TLS/reverse proxy, CSP/frame configuration, health checks and backups.
- Add approved dashboard mapping/configuration.
- Add audit logging, token expiration handling and negative authorization tests.
- Add query limits, statement timeouts, monitoring and cache/materialized views where necessary.

### Phase 3 - Report catalog

- Add Marketing, Sale, Admission and Student datasets/dashboards.
- Add controlled report publishing and lifecycle management.
- Add exports or scheduled delivery only after reviewing data sensitivity and permissions.

## Acceptance Criteria For The First Working Milestone

- Metabase OSS runs locally from a pinned official image and persists metadata in PostgreSQL, not H2.
- Admission CRM still builds and existing native reports remain functional.
- A user without the required report permission cannot obtain an embed token or open the report route.
- A permitted user sees only institution programs granted to their roles.
- Department, owned-only and assigned-only users cannot retrieve broader report data by changing URL/filter values.
- Metabase database credentials are read-only and cannot access sensitive columns or application auth tables.
- No Metabase secret or database password is present in frontend bundles, git-tracked source or logs.
- Focused backend authorization tests and frontend build/type checks pass.
- Changed files and verification commands are documented at completion.

## Known Risks And Decisions Still Needed

- Confirm whether the first milestone needs only Director reports or also department/individual Sale reports.
- Decide the first dashboard and exact KPI definitions before creating views.
- Decide whether `report_configs` should be extended or replaced by a dedicated Metabase mapping model.
- Decide freshness requirements: real-time, one minute, five minutes or daily.
- Review Metabase AGPL and embedding terms with the project owner before production distribution or branding changes.
- Confirm production hosting, domain, HTTPS/reverse proxy and backup strategy.
- Confirm whether analysts may access the separate Metabase authoring UI.

## Instructions For The Next Codex Session

The next Codex account must treat this document as project context, not as proof that implementation already exists. It must inspect the current branch because files may have changed after this handoff was written.

Before editing, it must report:

1. What reporting and RBAC behavior currently exists.
2. Whether the proposed integration still fits the current schema and deployment setup.
3. The exact Metabase components to use and the exact project files expected to change.
4. Security risks and how each risk will be tested.
5. A phased implementation plan, starting with a single safe proof of concept.

It must not deploy, push, delete files, install dependencies, modify schema/migrations or add infrastructure until the user approves the proposed scope.

## Official References

- Metabase embedding introduction: <https://www.metabase.com/docs/latest/embedding/introduction>
- Metabase guest embedding: <https://www.metabase.com/docs/latest/embedding/guest-embedding>
- Securing Metabase embeds: <https://www.metabase.com/docs/latest/embedding/securing-embeds>
- Metabase Docker installation: <https://www.metabase.com/docs/latest/installation-and-operation/running-metabase-on-docker>
- Metabase application database: <https://www.metabase.com/docs/latest/installation-and-operation/configuring-application-database>
- Metabase licenses: <https://www.metabase.com/license/>

Verify current documentation and release versions before implementation; do not rely only on this dated handoff.
