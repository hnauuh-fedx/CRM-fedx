$scanFiles = @(
 'apps/web/src/components/shared/business-records-page.tsx',
 'apps/web/src/modules/admissions/pages/admission-documents-page.tsx',
 'apps/web/src/modules/admissions/pages/admission-fees-page.tsx',
 'apps/web/src/modules/admissions/pages/admission-statuses-page.tsx',
 'apps/web/src/modules/admissions/pages/admissions-list-page.tsx',
 'apps/web/src/modules/automations/pages/automation-monitoring-page.tsx',
 'apps/web/src/modules/dashboard/pages/director-dashboard-page.tsx',
 'apps/web/src/modules/leads/components/dynamic-field-renderer.tsx',
 'apps/web/src/modules/leads/lead-custom-field.helpers.ts',
 'apps/web/src/modules/leads/pages/leads-list-page.tsx',
 'apps/web/src/modules/marketing/pages/meta-connection-page.tsx',
 'apps/web/src/modules/sale/pages/lead-assignments-page.tsx',
 'apps/web/src/modules/marketing/marketing-form-fill.tsx',
 'apps/web/src/components/shared/server-data-table.tsx',
 'apps/web/src/components/shared/table-pagination.tsx',
 'apps/web/src/modules/leads/components/lead-list-columns.tsx',
 'apps/web/src/modules/leads/components/create-lead-dialog.tsx'
)
& npx react-doctor@0.9.18 @scanFiles --no-cache --verbose --json --json-out artifacts/react-doctor-after.json
