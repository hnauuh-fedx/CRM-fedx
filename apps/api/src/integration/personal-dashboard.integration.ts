import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import {
  getPersonalDashboard,
  getPersonalDashboardConfig,
  updatePersonalDashboardConfig,
  type DashboardKpiWidgetInput,
} from "../modules/reports/personal-dashboard.service";

async function main() {
  const program = await prisma.institution_programs.findFirst({ select: { id: true } });
  assert.ok(program, "Cần có chương trình tuyển sinh để kiểm thử dashboard.");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await prisma.users.create({ data: { email: `dashboard-owner-${suffix}@example.test`, password_hash: "not-used", full_name: "Dashboard test owner" } });
  const other = await prisma.users.create({ data: { email: `dashboard-other-${suffix}@example.test`, password_hash: "not-used", full_name: "Dashboard test other" } });
  const reportData = {
    institution_program_id: program.id,
    module: "SALE",
    metric_keys: ["totalLeads"],
    chart_type: "TABLE",
    filters: { mode: "SINGLE", datasetKey: "LEADS", singleDimensionKey: "SOURCE", singleDisplay: "TABLE", conditions: [], dateGranularity: "DAY" },
  } as const;
  const ownReport = await prisma.personal_reports.create({ data: { ...reportData, owner_id: owner.id, name: "Dashboard integration report" } });
  const privateReport = await prisma.personal_reports.create({ data: { ...reportData, owner_id: other.id, name: "Private integration report" } });
  const authUser: AuthUser = {
    id: owner.id,
    email: owner.email,
    fullName: owner.full_name,
    avatarUrl: null,
    roles: ["DIRECTOR"],
    permissions: ["report.personal.view", "report.view_all", "lead.view_all"],
    departmentIds: [],
    institutionProgramIds: [program.id],
    accessScope: "ALL",
  };
  let conversionLeadIds: string[] = [];
  let conversionSourceId: string | null = null;

  try {
    assert.equal(await updatePersonalDashboardConfig(authUser, program.id, [privateReport.id]), null, "Không được ghim báo cáo riêng tư của người khác.");
    const stages = await prisma.pipeline_stages.findMany({ select: { id: true, pipeline_id: true, position: true }, orderBy: [{ pipeline_id: "asc" }, { position: "asc" }] });
    const sourceStage = stages.find((stage) => stages.some((candidate) => candidate.pipeline_id === stage.pipeline_id && (candidate.position ?? 0) > (stage.position ?? 0)));
    const targetStage = stages.find((stage) => stage.pipeline_id === sourceStage?.pipeline_id && (stage.position ?? 0) > (sourceStage?.position ?? 0));
    const kpiWidgets: DashboardKpiWidgetInput[] = [
      { id: randomUUID(), type: "COUNT" as const, datasetKey: "LEADS" as const, conditions: [] },
      { id: randomUUID(), type: "TREND" as const, datasetKey: "LEADS" as const, comparisonPeriod: "WEEK" as const, conditions: [] },
    ];
    let conversionWidgetId: string | null = null;
    let stageThresholdWidgetId: string | null = null;
    if (sourceStage && targetStage) {
      const conversionSource = await prisma.lead_sources.create({
        data: { name: `Dashboard conversion source ${suffix}`, institution_program_id: program.id, type: "integration-test" },
      });
      conversionSourceId = conversionSource.id;
      const conversionLead = await prisma.leads.create({
        data: {
          lead_code: `DASH-CONV-${suffix}`,
          full_name: "Dashboard conversion test lead",
          phone: `T${Date.now()}`,
          source_id: conversionSource.id,
          institution_program_id: program.id,
          pipeline_stage_id: targetStage.id,
          owner_id: owner.id,
        },
      });
      conversionLeadIds.push(conversionLead.id);
      const sourceLead = await prisma.leads.create({
        data: {
          lead_code: `DASH-SOURCE-${suffix}`,
          full_name: "Dashboard source-stage test lead",
          phone: `S${Date.now()}`,
          source_id: conversionSource.id,
          institution_program_id: program.id,
          pipeline_stage_id: sourceStage.id,
          owner_id: owner.id,
        },
      });
      conversionLeadIds.push(sourceLead.id);
      conversionWidgetId = randomUUID();
      stageThresholdWidgetId = randomUUID();
      kpiWidgets.push({
        id: conversionWidgetId,
        type: "CONVERSION",
        datasetKey: "LEADS",
        sourceStageId: sourceStage.id,
        targetStageId: targetStage.id,
        conditions: [{ fieldKey: "SOURCE", operator: "EQUALS", value: conversionSource.name }],
      });
      kpiWidgets.push({
        id: stageThresholdWidgetId,
        type: "COUNT",
        datasetKey: "LEADS",
        conditions: [
          { fieldKey: "SOURCE", operator: "EQUALS", value: conversionSource.name },
          { fieldKey: "PIPELINE_STAGE", operator: "GREATER_THAN_OR_EQUAL", value: sourceStage.id },
        ],
      });
    }
    assert.equal(await updatePersonalDashboardConfig(authUser, program.id, [ownReport.id], { columnCount: 6, kpiWidgets }), null, "KhÃ´ng Ä‘Æ°á»£c lÆ°u quÃ¡ 5 cá»™t.");
    const saved = await updatePersonalDashboardConfig(authUser, program.id, [ownReport.id], { columnCount: 2, kpiWidgets });
    assert.deepEqual(saved?.reportIds, [ownReport.id]);
    assert.equal(saved?.columnCount, 2);
    assert.equal(saved?.kpiWidgets.length, kpiWidgets.length);
    const config = await getPersonalDashboardConfig(authUser, program.id);
    assert.deepEqual(config?.reportIds, [ownReport.id]);
    const dashboard = await getPersonalDashboard(authUser, program.id);
    assert.equal(dashboard?.widgets.length, 1);
    assert.equal(dashboard?.widgets[0]?.reportId, ownReport.id);
    assert.equal(dashboard?.widgets[0]?.result.report?.ownerId, owner.id);
    assert.equal(dashboard?.columnCount, 2);
    assert.equal(dashboard?.kpiWidgets.length, kpiWidgets.length);
    assert.equal(dashboard?.kpiWidgets[1]?.trend?.previousLabel, "tuần trước");
    if (sourceStage && targetStage && conversionWidgetId) {
      const conversionWidget = dashboard?.kpiWidgets.find((widget) => widget.id === conversionWidgetId);
      assert.equal(conversionWidget?.format, "NUMBER");
      assert.equal(conversionWidget?.value, 1, "Giá trị chính phải là số lead hiện tại đạt từ stage đích trở đi.");
      const conversionDetails = (conversionWidget && "conversion" in conversionWidget ? conversionWidget.conversion : undefined) as {
        sourceTotal: number;
        targetTotal: number;
        percentage: number;
      } | undefined;
      assert.equal(conversionDetails?.sourceTotal, 2);
      assert.equal(conversionDetails?.targetTotal, 1);
      assert.equal(conversionDetails?.percentage, 50, "Tỷ lệ phải lấy số đạt đích chia cho số đạt từ stage nguồn trở đi.");
      const stageThresholdWidget = dashboard?.kpiWidgets.find((widget) => widget.id === stageThresholdWidgetId);
      assert.equal(stageThresholdWidget?.value, 2, "Lead ở giai đoạn nguồn và cao hơn phải được tính trong bộ lọc từ giai đoạn nguồn trở đi.");
    }
    console.log("Personal dashboard integration passed: ownership, scope, configurable KPI and widget execution.");
  } finally {
    await prisma.personal_dashboard_widgets.deleteMany({ where: { user_id: owner.id } });
    await prisma.personal_dashboard_settings.deleteMany({ where: { user_id: owner.id } });
    await prisma.audit_logs.deleteMany({ where: { user_id: owner.id } });
    await prisma.personal_reports.deleteMany({ where: { id: { in: [ownReport.id, privateReport.id] } } });
    if (conversionLeadIds.length > 0) await prisma.leads.deleteMany({ where: { id: { in: conversionLeadIds } } });
    if (conversionSourceId) await prisma.lead_sources.deleteMany({ where: { id: conversionSourceId } });
    await prisma.users.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
}

void main();
