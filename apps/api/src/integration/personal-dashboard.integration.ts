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
  let conversionLeadId: string | null = null;
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
      conversionLeadId = conversionLead.id;
      await prisma.lead_status_histories.create({
        data: { lead_id: conversionLead.id, from_stage_id: sourceStage.id, to_stage_id: targetStage.id, changed_by: owner.id },
      });
      conversionWidgetId = randomUUID();
      kpiWidgets.push({
        id: conversionWidgetId,
        type: "CONVERSION",
        datasetKey: "LEADS",
        sourceStageId: sourceStage.id,
        targetStageId: targetStage.id,
        conditions: [{ fieldKey: "SOURCE", operator: "EQUALS", value: conversionSource.name }],
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
      assert.equal(conversionWidget?.format, "PERCENT");
      assert.equal(conversionWidget?.value, 100, "Phải tính from_stage_id là tiến trình nguồn đã đạt.");
    }
    console.log("Personal dashboard integration passed: ownership, scope, configurable KPI and widget execution.");
  } finally {
    await prisma.personal_dashboard_widgets.deleteMany({ where: { user_id: owner.id } });
    await prisma.personal_dashboard_settings.deleteMany({ where: { user_id: owner.id } });
    await prisma.audit_logs.deleteMany({ where: { user_id: owner.id } });
    await prisma.personal_reports.deleteMany({ where: { id: { in: [ownReport.id, privateReport.id] } } });
    if (conversionLeadId) await prisma.leads.deleteMany({ where: { id: conversionLeadId } });
    if (conversionSourceId) await prisma.lead_sources.deleteMany({ where: { id: conversionSourceId } });
    await prisma.users.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
}

void main();
