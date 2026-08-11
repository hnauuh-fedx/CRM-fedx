# Admission CRM - Repository Rules

Read and follow this file before creating, editing, reviewing, or testing project code. Load the task-specific skills listed below when their trigger matches the work.

## Scope

Build only these Admission CRM areas unless explicitly requested:

- CRM Marketing
- CRM Sale / Telesale
- CRM Admission
- CRM Student
- Management / Admin
- Reporting / Dashboard

Design list APIs, filtering, and database access for at least 50,000 students and future expansion beyond 500,000 records.

## Stack And Placement

Preserve the current setup; do not migrate frameworks or add infrastructure without explicit instruction.

- Frontend: `apps/web`, React, Vite, TypeScript, Tailwind CSS, `shadcn/ui`, TanStack Query, TanStack Table, React Hook Form, and Zod where relevant.
- Backend: `apps/api`, existing Node.js TypeScript structure, PostgreSQL, Prisma, JWT, and RBAC. Use Redis/BullMQ only for queue or automation work.
- Shared contracts: `packages/shared`.
- Database source of truth: inspect the current PostgreSQL/Prisma schema before adding a model or migration.
- Persistent files: use S3, Cloudinary, or MinIO. Local storage is only for development mocks.

Keep business logic within its domain module. Do not merge marketing, sale, admission, student, or administration responsibilities into generic modules.

## Language And UI

- Use English identifiers, file names, DTO/API fields, routes, and permission keys.
- Write all end-user UI copy in Vietnamese by default, including labels, validation, table states, dialogs, tooltips, and accessibility labels.
- Use the established design system and preserve keyboard access, focus visibility, semantic markup, and responsive usability.

## Security And Scale

- Every protected endpoint and feature must enforce authentication, permission, and scope. Never authorize business actions from a hardcoded role check alone.
- Restrict list and detail queries to the user's visible scope.
- Never expose password hashes or unauthorized sensitive data such as `cccd`, phone, email, or audit data; serialize responses explicitly.
- Use server-side pagination, search, filter, and sorting for large business lists. Never fetch all records into the client.
- Write audit/activity records for relevant business mutations; do not expose ordinary UI actions that delete audit logs.

## Skill Routing

Read these skill instructions before work in the matching area:

- `.agents/skills/admission-crm-access-control/SKILL.md`: authentication, authorization, role or permission changes, scope queries, navigation visibility, role dashboards, or reporting visibility.
- `.agents/skills/admission-crm-domain-workflows/SKILL.md`: leads, assignments, pipeline stages, campaigns, admissions, students, files, notifications, audit events, business APIs, or major forms.
- `.agents/skills/ui-ux-pro-max/SKILL.md`: implementing or reviewing CRM UI layout and interaction design.
- `.agents/skills/react-doctor/SKILL.md`: finishing or reviewing React code changes when its checks are applicable.

## Implementation Rules

- Inspect relevant code and schema before editing.
- Modify only the module and behavior required by the request.
- Reuse existing types, validators, constants, components, and tables rather than duplicating them.
- Validate inputs for major forms and protected API writes.
- Keep local development integrations local unless deployment or external services are explicitly requested.
- Unless explicitly redirected, prioritize auth, layout, scoped lead management, and pipeline workflows before advanced analytics.

## Completion

- Add or update focused tests or validation appropriate to the changed risk.
- Run applicable build, typecheck, lint, or tests before completion.
- For UI changes, verify Vietnamese copy and usable responsive interactions.
- Report changed files and verification performed.
