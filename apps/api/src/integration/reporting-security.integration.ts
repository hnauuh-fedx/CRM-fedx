import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-jwt-secret-that-is-longer-than-thirty-two-characters";

type AuthUser = import("../modules/auth/auth.types").AuthUser;

const baseUser: AuthUser = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "employee@example.test",
  fullName: "Employee",
  avatarUrl: null,
  roles: ["TELESALE"],
  permissions: ["lead.view_assigned", "report.sale.view_assigned", "report.personal.view", "report.personal.create"],
  departmentIds: ["20000000-0000-4000-8000-000000000001"],
  institutionProgramIds: ["30000000-0000-4000-8000-000000000001"],
  accessScope: "ASSIGNED_ONLY",
};

async function main() {
  const { resolvePersonalReportDateRange, validatePersonalReportInput } = await import("../modules/reports/personal-report.service.js");
  const { resolveReportingScopeKeys } = await import("../modules/reports/reporting-scope.js");

  assert.deepEqual(resolveReportingScopeKeys(baseUser), [`ASSIGNED:${baseUser.id}`]);
  assert.deepEqual(resolveReportingScopeKeys({ ...baseUser, accessScope: "OWNED_ONLY" }), [`OWNED:${baseUser.id}`]);
  assert.deepEqual(resolveReportingScopeKeys({ ...baseUser, accessScope: "DEPARTMENT" }), [`DEPARTMENT:${baseUser.departmentIds[0]}`]);
  assert.deepEqual(resolveReportingScopeKeys({ ...baseUser, accessScope: "ALL", permissions: [...baseUser.permissions, "report.view_all"] }), ["ALL"]);
  assert.equal(validatePersonalReportInput(baseUser, { name: "KPI cá nhân", module: "SALE", metricKeys: ["totalLeads"], chartType: "KPI" }).ok, true);
  assert.equal(validatePersonalReportInput(baseUser, { name: "KPI không hợp lệ", module: "SALE", metricKeys: ["phone"], chartType: "TABLE" }).ok, false);
  assert.equal(validatePersonalReportInput(baseUser, { name: "KPI trái module", module: "MARKETING", metricKeys: ["leadCount"], chartType: "TABLE" }).ok, false);
  const validPivot = {
    name: "Khách hàng theo nguồn và ngày tạo",
    mode: "PIVOT" as const,
    module: "SALE" as const,
    metricKeys: ["totalLeads"],
    chartType: "TABLE" as const,
    datasetKey: "LEADS" as const,
    rowDimensionKey: "SOURCE",
    columnDimensionKey: "CREATED_DATE",
    timePreset: "THIS_MONTH" as const,
    dateGranularity: "DAY" as const,
  };
  assert.equal(validatePersonalReportInput(baseUser, validPivot).ok, true);
  assert.equal(validatePersonalReportInput(baseUser, { ...validPivot, dateGranularity: "QUARTER" }).ok, true);
  assert.equal(validatePersonalReportInput(baseUser, { ...validPivot, conditions: [{ fieldKey: "CREATED_DATE", operator: "DATE_PRESET", value: "THIS_QUARTER" }] }).ok, true);
  assert.equal(validatePersonalReportInput(baseUser, { ...validPivot, conditions: [{ fieldKey: "CREATED_DATE", operator: "DATE_PRESET", value: "LAST_QUARTER" }] }).ok, true);
  assert.deepEqual(resolvePersonalReportDateRange({ timePreset: "THIS_QUARTER" }, "2026-08-27"), { fromDate: "2026-07-01", toDate: "2026-09-30" });
  assert.deepEqual(resolvePersonalReportDateRange({ timePreset: "LAST_QUARTER" }, "2026-08-27"), { fromDate: "2026-04-01", toDate: "2026-06-30" });
  assert.equal(validatePersonalReportInput(baseUser, { ...validPivot, rowDimensionKey: "PHONE" }).ok, false);
  assert.equal(validatePersonalReportInput(baseUser, { ...validPivot, timePreset: "CUSTOM", fromDate: "2025-01-01", toDate: "2026-01-01" }).ok, false);
  assert.equal(validatePersonalReportInput({ ...baseUser, permissions: ["report.personal.view"] }, validPivot).ok, false);
  const validSingle = {
    ...validPivot,
    name: "Khách hàng theo nguồn dạng bảng",
    mode: "SINGLE" as const,
    singleDimensionKey: "SOURCE",
    singleDisplay: "TABLE" as const,
  };
  assert.equal(validatePersonalReportInput(baseUser, validSingle).ok, true);
  assert.equal(validatePersonalReportInput(baseUser, { ...validSingle, singleDisplay: "SCRIPT" as "TABLE" }).ok, false);
  assert.equal(validatePersonalReportInput(baseUser, { ...validSingle, singleDimensionKey: "EMAIL" }).ok, false);
  assert.equal(validatePersonalReportInput(baseUser, { ...validSingle, conditions: [{ fieldKey: "PHONE", operator: "EQUALS", value: "0123456789" }] }).ok, false);
  assert.equal(validatePersonalReportInput(baseUser, { ...validSingle, conditions: [{ fieldKey: "SOURCE", operator: "EQUALS", value: "Facebook" }] }).ok, true);

  console.log("Reporting security checks passed.");
}

void main();
