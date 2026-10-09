import assert from "node:assert/strict";

import { prisma } from "../database/prisma";
import { Prisma } from "../generated/prisma/client";
import {
  getDirectorDashboard,
  getDirectorLeadPipelineMatrix,
  getDirectorLeadSourceBreakdown,
} from "../modules/dashboard/director-dashboard.service";
import { datasetBaseCondition, datasetFrom, getPersonalReportFilterValues, recordIdExpression } from "../modules/reports/personal-report.service";
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
        AND table_name IN ('sale_pipeline_scope_fact', 'student_scope_fact')
    `;
    const names = new Set(columns.filter((column) => column.table_name === "sale_pipeline_scope_fact").map((column) => column.column_name));
    for (const required of ["scope_key", "lead_id", "institution_program_id", "lead_date", "source_name", "assignee_name", "pipeline_stage_name", "pipeline_stage_position"]) {
      assert.ok(names.has(required), `Missing reporting column: ${required}`);
    }
    assert.ok(personalReportDatasetDefinitions.LEADS.singleDimensions.some((field) => field.key === "ASSIGNEE"), "Assignee must be available as a report output.");
    for (const forbidden of ["cccd", "phone", "email", "password_hash", "private_notes", "file_url", "audit_payload"]) {
      assert.equal(columns.some((column) => column.column_name === forbidden), false, `Forbidden reporting column exposed: ${forbidden}`);
    }
    const studentNames = new Set(columns.filter((column) => column.table_name === "student_scope_fact").map((column) => column.column_name));
    for (const required of ["scope_key", "student_id", "enrolled_date", "student_status", "major_name", "class_name"]) assert.ok(studentNames.has(required), `Missing student reporting column: ${required}`);

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
      const qualifiedLeadStages = await getPersonalReportFilterValues(viewer, "QUALIFIED_LEADS", "PIPELINE_STAGE", program.id);
      const qualifiedLeadSources = await getPersonalReportFilterValues(viewer, "QUALIFIED_LEADS", "SOURCE", program.id);
      const studentStatuses = await getPersonalReportFilterValues(viewer, "STUDENTS", "STATUS", program.id);
      assert.ok(Array.isArray(leadSources));
      assert.ok(Array.isArray(leadAssignees));
      assert.ok(Array.isArray(leadStages));
      assert.ok(Array.isArray(qualifiedLeadStages));
      assert.ok(Array.isArray(qualifiedLeadSources));
      assert.ok(Array.isArray(studentStatuses));
      assert.equal(await getPersonalReportFilterValues(viewer, "LEADS", "PHONE", program.id), null);
      const [qualifiedDatasetCount] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT ${recordIdExpression("QUALIFIED_LEADS")})::int AS total
        FROM ${datasetFrom("QUALIFIED_LEADS")}
        WHERE fact.scope_key = 'ALL'
          AND fact.institution_program_id = ${program.id}::uuid
          AND ${datasetBaseCondition("QUALIFIED_LEADS")}
      `);
      const [qualifiedLeadCount] = await prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM leads lead
        JOIN pipeline_stages current_stage ON current_stage.id = lead.pipeline_stage_id
        WHERE lead.deleted_at IS NULL
          AND lead.institution_program_id = ${program.id}::uuid
          AND EXISTS (
            SELECT 1
            FROM pipeline_stages l2_stage
            WHERE l2_stage.pipeline_id = current_stage.pipeline_id
              AND l2_stage.name ILIKE '%(L2)%'
              AND current_stage.position >= l2_stage.position
          )
      `;
      assert.equal(
        qualifiedDatasetCount?.total ?? 0,
        qualifiedLeadCount?.total ?? 0,
        "Kho data đúng đối tượng phải chỉ tính lead ở L2 trở về sau trong cùng pipeline.",
      );

      const [configuredStages, directorDashboard, directorMatrix, directorSourceBreakdown, saleReport] = await Promise.all([
        prisma.pipeline_stages.findMany({ select: { id: true, position: true }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
        getDirectorDashboard(program.id),
        getDirectorLeadPipelineMatrix(program.id),
        getDirectorLeadSourceBreakdown(program.id),
        getSaleDetailReport(viewer, { institutionProgramId: program.id }),
      ]);
      const [directorMilestones] = await prisma.$queryRaw<Array<{
        total_data: number;
        qualified_leads: number;
        registered_leads: number;
        total_students: number;
      }>>`
        SELECT
          COUNT(*)::int AS total_data,
          COUNT(*) FILTER (WHERE ${stageAtOrAfterMarkerSql("(L2)")})::int AS qualified_leads,
          COUNT(*) FILTER (WHERE ${stageAtOrAfterMarkerSql("(L4)")})::int AS registered_leads,
          COUNT(*) FILTER (WHERE ${stageAtOrAfterMarkerSql("(L5)")})::int AS total_students
        FROM leads lead
        WHERE lead.deleted_at IS NULL
          AND lead.institution_program_id = ${program.id}::uuid
      `;
      assert.equal(directorDashboard.summary.totalData, directorMilestones.total_data);
      assert.equal(directorDashboard.summary.qualifiedLeads, directorMilestones.qualified_leads);
      assert.equal(directorDashboard.summary.registeredLeads, directorMilestones.registered_leads);
      assert.equal(directorDashboard.summary.totalStudents, directorMilestones.total_students);
      assert.equal(directorDashboard.leadPipelineMatrix.columns[0]?.id, null, "Cột chưa chọn tiến trình phải đứng đầu.");
      assert.equal(directorDashboard.leadPipelineMatrix.columns[0]?.name, "Chưa chọn tiến trình");
      assert.equal(directorDashboard.leadPipelineMatrix.total, directorDashboard.summary.totalData);
      assert.equal(directorMatrix.total, directorDashboard.summary.totalData, "API lọc riêng của bảng pipeline phải giữ đúng tổng data.");
      assert.deepEqual(directorSourceBreakdown, directorDashboard.leadSourceBreakdown, "API lọc riêng của bảng nguồn phải giữ đúng dữ liệu khi chưa lọc.");
      const assignedLead = await prisma.leads.findFirst({
        where: { institution_program_id: program.id, deleted_at: null, assigned_to: { not: null } },
        select: { assigned_to: true },
      });
      if (assignedLead?.assigned_to) {
        const [filteredBreakdown, expectedAssigneeTotal] = await Promise.all([
          getDirectorLeadSourceBreakdown(program.id, { assigneeId: assignedLead.assigned_to }),
          prisma.leads.count({
            where: { institution_program_id: program.id, deleted_at: null, assigned_to: assignedLead.assigned_to },
          }),
        ]);
        assert.equal(filteredBreakdown.total, expectedAssigneeTotal, "Bộ lọc nhân viên của bảng nguồn phải trả đúng tổng data.");
      }
      const stagedLead = await prisma.leads.findFirst({
        where: { institution_program_id: program.id, deleted_at: null, pipeline_stage_id: { not: null } },
        select: { pipeline_stage_id: true },
      });
      if (stagedLead?.pipeline_stage_id) {
        const [filteredBreakdown, expectedStageTotal] = await Promise.all([
          getDirectorLeadSourceBreakdown(program.id, { pipelineStageId: stagedLead.pipeline_stage_id }),
          prisma.leads.count({
            where: { institution_program_id: program.id, deleted_at: null, pipeline_stage_id: stagedLead.pipeline_stage_id },
          }),
        ]);
        assert.equal(filteredBreakdown.total, expectedStageTotal, "Bộ lọc tiến trình của bảng nguồn phải trả đúng tổng data.");
      }
      const sourceLead = await prisma.leads.findFirst({
        where: { institution_program_id: program.id, deleted_at: null, source_id: { not: null } },
        select: { source_id: true },
      });
      if (sourceLead?.source_id) {
        const [filteredMatrix, expectedSourceTotal] = await Promise.all([
          getDirectorLeadPipelineMatrix(program.id, { sourceId: sourceLead.source_id }),
          prisma.leads.count({
            where: { institution_program_id: program.id, deleted_at: null, source_id: sourceLead.source_id },
          }),
        ]);
        assert.equal(filteredMatrix.total, expectedSourceTotal, "Bộ lọc nguồn của bảng pipeline phải trả đúng tổng data.");
      }
      assert.equal(
        directorDashboard.leadPipelineMatrix.rows.reduce((sum, row) => sum + row.total, 0),
        directorDashboard.summary.totalData,
        "Tổng theo nhân viên phải bằng tổng data của dashboard.",
      );
      assert.equal(
        directorDashboard.leadPipelineMatrix.columns.reduce((sum, column) => sum + column.total, 0),
        directorDashboard.summary.totalData,
        "Tổng theo pipeline phải bằng tổng data của dashboard.",
      );
      assert.equal(
        directorDashboard.leadSourceBreakdown.total,
        directorDashboard.summary.totalData,
        "Tổng bảng theo nguồn phải bằng tổng data của dashboard.",
      );
      assert.equal(
        directorDashboard.leadSourceBreakdown.rows.reduce((sum, row) => sum + row.total, 0),
        directorDashboard.summary.totalData,
        "Tổng các nguồn phải bằng tổng data của dashboard.",
      );
      for (const row of directorDashboard.leadSourceBreakdown.rows) {
        assert.equal(
          row.percentage,
          directorDashboard.summary.totalData === 0
            ? 0
            : Number(((row.total / directorDashboard.summary.totalData) * 100).toFixed(1)),
          `Tỷ lệ nguồn ${row.name} không khớp với tổng data.`,
        );
      }
      for (const row of directorDashboard.leadPipelineMatrix.rows) {
        assert.equal(
          Object.values(row.values).reduce((sum, value) => sum + value, 0),
          row.total,
          `Tổng dòng ${row.name} không khớp với các ô pipeline.`,
        );
      }
      assert.equal(
        directorDashboard.summary.registeredConversionRate,
        directorMilestones.qualified_leads === 0 ? 0 : Number(((directorMilestones.registered_leads / directorMilestones.qualified_leads) * 100).toFixed(1)),
      );
      assert.equal(
        directorDashboard.summary.studentConversionRate,
        directorMilestones.qualified_leads === 0 ? 0 : Number(((directorMilestones.total_students / directorMilestones.qualified_leads) * 100).toFixed(1)),
      );
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

function stageAtOrAfterMarkerSql(marker: "(L2)" | "(L4)" | "(L5)") {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM pipeline_stages current_stage
    JOIN pipeline_stages threshold_stage
      ON threshold_stage.pipeline_id = current_stage.pipeline_id
     AND threshold_stage.name ILIKE ${`%${marker}%`}
    WHERE current_stage.id = lead.pipeline_stage_id
      AND current_stage.position >= threshold_stage.position
  )`;
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
