# Admission CRM

Monorepo skeleton for the admission CRM web application and API.

## Structure

- `apps/web`: frontend CRM application
- `apps/api`: backend API
- `packages/shared`: shared types, constants, and validators
- `database`: database schema, migrations, and seeds
- `uploads`: local upload folders
- `docs`: project documentation

## Local Development

Configure `apps/api/.env`, then run both the frontend and API from the project root:

```powershell
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`

Development login accounts currently use password `123456`:

- `director@tvu.edu.vn`
- `sale.manager@tvu.edu.vn`
- `marketing@tvu.edu.vn`
- `telesale@tvu.edu.vn`
- `telesale.2@tvu.edu.vn`

After applying the schema migrations below, seed an idempotent demo dataset covering the implemented Marketing, Sale, Admission, Student, Dashboard, Report, Audit and Notification screens:

```powershell
npm run seed:demo-data --workspace apps/api
```

The Director account can inspect all implemented sections, execute Lead / Sale actions, and configure pipelines and stages. Each new pipeline copies the current stages from `Pipeline tuyển sinh` before later customization. The Sale and Telesale accounts provide scoped lead assignment, activity and reminder test cases.

Verify that the demo database populates all implemented list/dashboard APIs:

```powershell
npm run test:integration:demo-data --workspace apps/api
```

After initializing development data, grant the director dashboard, reporting, and Lead CRUD permissions with:

```powershell
npm run seed:director-access --workspace apps/api
```

Configure Sale role permissions, the `SALE` department, and the available demo telesale account membership with:

```powershell
npm run seed:sale-access --workspace apps/api
```

Apply the reminder notification tracking columns for an existing database:

```powershell
cd apps/api
npx prisma db execute --file ../../database/migrations/20260527_add_reminder_notification_tracking.sql --config prisma.config.ts
```

Apply the multi-institution program catalog and business-record links:

```powershell
cd apps/api
npx prisma db execute --file ../../database/migrations/20260527_add_multi_institution_programs.sql --config prisma.config.ts
```

Apply the program-specific major catalog used by director management:

```powershell
cd apps/api
npx prisma db execute --file ../../database/migrations/20260527_add_program_majors.sql --config prisma.config.ts
```

While the API server is running, pending reminders create one due notification at their scheduled time and one overdue notification if still incomplete after 24 hours. Signed-in users can read personal notifications from the top bar.

Verify Lead create, update, pipeline, note, file-link, manual activity, reminder, due/overdue notification and reassignment flows against the configured PostgreSQL database with temporary test records:

```powershell
npm run test:integration:leads --workspace apps/api
```

Verify the director Lead create, edit, and soft-delete permissions against the configured PostgreSQL database with temporary test records:

```powershell
npm run test:integration:director-leads --workspace apps/api
```

Verify pipeline configuration permission, stage maintenance, and audit logging against the configured PostgreSQL database with temporary test records:

```powershell
npm run test:integration:pipelines --workspace apps/api
```
