import assert from "node:assert/strict";

import { prisma } from "../database/prisma";
import { getDirectorDashboard } from "../modules/dashboard/director-dashboard.service";
import { getPersonalReportFilterValues } from "../modules/reports/personal-report.service";
import { personalReportDatasetDefinitions } from "../modules/reports/report-definitions";
import { getSaleDetailReport } from "../modules/reports/report-detail.service";
import type { AuthUser } from "../modules/auth/auth.types";

type AggregateRow = { leads: number; first_date: Date | null; last_date: Date | null };

async function main() {
  try {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'reporting'
        AND table_name IN ('sale_pipeline_scope_fact', 'admission_candidate_scope_fact', 'student_scope_fact')
    `;
    const names = new Set(columns.filter((column) => column.table_name === "sale_pipeline_scope_fact").map((column) => column.column_name));
    for (const required of ["scope_key", "lead_id", "institution_program_id", "lead_date", "source_name", "assignee_name", "pipeline_stage_name", "pipeline_stage_position", "lead_status"]) {
      assert.ok(names.has(required), `Missing reporting column: ${required}`);
    }
    assert.ok(personalReportDatasetDefinitions.LEADS.singleDimensions.some((field) => field.key === "ASSIGNEE"), "Assignee must be available as a report output.");
    for (const forbidden of ["cccd", "phone", "email", "password_hash", "private_notes", "file_url", "audit_payload"]) {
      assert.equal(columns.some((column) => column.column_name === forbidden), false, `Forbidden reporting column exposed: ${forbidden}`);
    }
    const admissionNames = new Set(columns.filter((column) => column.table_name === "admission_candidate_scope_fact").map((column) => column.column_name));
    for (const required of ["scope_key", "application_id", "received_date", "admission_status_name", "major_name", "fee_status", "tuition_status"]) assert.ok(admissionNames.has(required), `Missing admission reporting column: ${required}`);
    const studentNames = new Set(columns.filter((column) => column.table_name === "student_scope_fact").map((column) => column.column_name));
    for (const required of ["scope_key", "student_id", "enrolled_date", "student_status", "faculty_name", "major_name", "class_name"]) assert.ok(studentNames.has(required), `Missing student reporting column: ${required}`);

    const [aggregate] = await prisma.$queryRaw<AggregateRow[]>`
      SELECT COUNT(DISTINCT lead_id)::int AS leads,
             MIN(lead_date) AS first_date,
             MAX(lead_date) AS last_date
      FROM reporting.sale_pipeline_scope_fact
      WHERE scope_key = 'ALL'
    `;
    assert.ok(aggregate);
    assert.ok(aggregate.leads >= 0);
    const [applicationCounts] = await prisma.$queryRaw<Array<{ view_count: number; source_count: number }>>`
      SELECT
        (SELECT COUNT(DISTINCT lead_id)::int
         FROM reporting.sale_pipeline_scope_fact
         WHERE scope_key = 'ALL' AND has_application IS TRUE) AS view_count,
        (SELECT COUNT(*)::int
         FROM leads lead
         JOIN pipeline_stages stage ON stage.id = lead.pipeline_stage_id
         WHERE lead.deleted_at IS NULL AND stage.name ILIKE '%(L3)%') AS source_count
    `;
    assert.equal(applicationCounts.view_count, applicationCounts.source_count, "Application KPI must count active leads currently at L3.");
    const oneDimension = await prisma.$queryRaw<Array<{ label: string; total: number }>>`
      SELECT source_name AS label, COUNT(DISTINCT lead_id)::int AS total
      FROM reporting.sale_pipeline_scope_fact
      WHERE scope_key = 'ALL'
      GROUP BY source_name
      ORDER BY source_name
    `;
    assert.equal(oneDimension.reduce((sum, item) => sum + item.total, 0), aggregate.leads);
    const byAssignee = await prisma.$queryRaw<Array<{ label: string; total: number }>>`
      SELECT assignee_name AS label, COUNT(DISTINCT lead_id)::int AS total
      FROM reporting.sale_pipeline_scope_fact
      WHERE scope_key = 'ALL'
      GROUP BY assignee_name
      ORDER BY assignee_name
    `;
    assert.equal(byAssignee.reduce((sum, item) => sum + item.total, 0), aggregate.leads);
    const program = await prisma.institution_programs.findFirst({ select: { id: true } });
    if (program) {
      const viewer: AuthUser = {
        id: "00000000-0000-4000-8000-000000000001",
        email: "report-test@example.test",
        fullName: "Reporting test",
        avatarUrl: null,
        roles: ["DIRECTOR"],
        permissions: ["report.view_all", "report.personal.view"],
        departmentIds: [],
        institutionProgramIds: [program.id],
        accessScope: "ALL",
      };
      const leadSources = await getPersonalReportFilterValues(viewer, "LEADS", "SOURCE", program.id);
      const leadAssignees = await getPersonalReportFilterValues(viewer, "LEADS", "ASSIGNEE", program.id);
      const leadStages = await getPersonalReportFilterValues(viewer, "LEADS", "PIPELINE_STAGE", program.id);
      const admissionStatuses = await getPersonalReportFilterValues(viewer, "ADMISSION_CANDIDATES", "ADMISSION_STATUS", program.id);
      const studentStatuses = await getPersonalReportFilterValues(viewer, "STUDENTS", "STATUS", program.id);
      assert.ok(Array.isArray(leadSources));
      assert.ok(Array.isArray(leadAssignees));
      assert.ok(Array.isArray(leadStages));
      assert.ok(Array.isArray(admissionStatuses));
      assert.ok(Array.isArray(studentStatuses));
      assert.equal(await getPersonalReportFilterValues(viewer, "LEADS", "PHONE", program.id), null);

      const [configuredStages, directorDashboard, saleReport] = await Promise.all([
        prisma.pipeline_stages.findMany({ select: { id: true, position: true }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
        getDirectorDashboard(program.id),
        getSaleDetailReport(viewer, { institutionProgramId: program.id }),
      ]);
      const positionById = new Map(configuredStages.map((stage) => [stage.id, stage.position]));
      assertPipelineStageOrder(directorDashboard.leadsByStage, positionById, "director dashboard");
      assertPipelineStageOrder(saleReport.pipelineBreakdown, positionById, "sale detail report");

      const stageColumns = await prisma.$queryRaw<Array<{ label: string; position: number | null }>>`
        SELECT pipeline_stage_name AS label, MIN(pipeline_stage_position)::int AS position
        FROM reporting.sale_pipeline_scope_fact
        WHERE scope_key = 'ALL' AND institution_program_id = ${program.id}::uuid
        GROUP BY pipeline_stage_name
        ORDER BY MIN(pipeline_stage_position) ASC NULLS LAST, pipeline_stage_name ASC
      `;
      assertPipelineStageOrder(stageColumns.map((stage) => ({ id: null, name: stage.label, total: 0, position: stage.position })), positionById, "personal report columns");
      assert.deepEqual(leadStages.map((stage) => stage.value), stageColumns.map((stage) => stage.label), "Pipeline filter values must follow configured stage order.");
    }
    console.log(`Reporting datasets passed: ${aggregate.leads} safe leads across ${oneDimension.length} source groups.`);
  } finally {
    await prisma.$disconnect();
  }
}

function assertPipelineStageOrder(
  items: Array<{ id: string | null; name: string; total: number; position?: number | null }>,
  positionById: Map<string, number | null>,
  context: string,
) {
  let previous = Number.NEGATIVE_INFINITY;
  let reachedUnconfigured = false;
  for (const item of items) {
    const position = item.position ?? (item.id ? positionById.get(item.id) : null);
    if (position == null) {
      reachedUnconfigured = true;
      continue;
    }
    assert.equal(reachedUnconfigured, false, `${context}: configured stage appears after an unconfigured stage.`);
    assert.ok(position >= previous, `${context}: ${item.name} is outside configured pipeline order.`);
    previous = position;
  }
}

void main();
