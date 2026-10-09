import assert from "node:assert/strict";
import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";
import { listProgramMajors } from "../modules/admissions/major-management.service";
import { getStudentDetail, getStudentFilterOptions, listStudents } from "../modules/students/student-list.service";
import { getAdmissionDetailReport, getStudentDetailReport } from "../modules/reports/report-detail.service";
import { getOverviewReport } from "../modules/reports/report-overview.service";

function assertNoFacultyFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!/faculty|faculties/i.test(key), `Removed field was serialized: ${key}`);
    assertNoFacultyFields(child);
  }
}

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>("SELECT to_regclass('public.faculties') IS NOT NULL AS present");
  const refs = await prisma.$queryRawUnsafe<Array<{ table_name: string; definition: string }>>("SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE confrelid = to_regclass('public.faculties')");
  const views = await prisma.$queryRawUnsafe<Array<{ schema: string; name: string; definition: string }>>("SELECT schemaname AS schema, viewname AS name, definition FROM pg_views WHERE definition ILIKE '%faculties%'");
  if (process.argv.includes("--inspect")) {
    const grants = await prisma.$queryRawUnsafe("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'reporting' AND table_name = 'student_scope_fact'");
    const reports = await prisma.$queryRawUnsafe("SELECT count(*)::int AS count FROM personal_reports WHERE filters::text LIKE '%FACULTY%' OR breakdown_key = 'studentsByFaculty'");
    console.log(JSON.stringify({ grants, reports }));
    console.log(JSON.stringify({ tables, refs, views }));
    return;
  }
  assert.equal(tables[0]?.present, false);
  assert.equal(refs.length, 0);
  assert.equal(views.length, 0);
  const columns = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'faculty_id'");
  assert.equal(columns.length, 0);
  await prisma.$queryRawUnsafe('SELECT * FROM reporting.student_scope_fact LIMIT 1');
  await prisma.majors.findFirst({ select: { id: true, name: true } });
  await prisma.students.findFirst({ select: { id: true, student_classes: { select: { id: true } } } });
  const principal = await prisma.users.findFirst({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
  assert.ok(principal, "Seed a local director account before running this integration test.");
  const user = await getAuthUser(principal.id);
  assert.ok(user);
  const institutionProgramId = user.institutionProgramIds[0];
  assert.ok(institutionProgramId);
  const students = await listStudents(user, { page: 1, limit: 20, sortBy: "enrolledAt", sortOrder: "desc", institutionProgramId });
  const results = await Promise.all([
    getStudentFilterOptions(user, institutionProgramId),
    listProgramMajors(institutionProgramId, { page: 1, limit: 20, sortBy: "name", sortOrder: "asc", search: "Luật" }),
    getAdmissionDetailReport(user, { institutionProgramId }),
    getStudentDetailReport(user, { institutionProgramId }),
    getOverviewReport(institutionProgramId),
  ]);
  assertNoFacultyFields([students, ...results]);
  if (students.data[0]) assertNoFacultyFields(await getStudentDetail(user, students.data[0].id, institutionProgramId));
  console.log("Faculty removal: table, foreign keys, columns and reporting view verified.");
}

void main().finally(() => prisma.$disconnect());
