const assert = require("node:assert/strict");
require("tsx/cjs");
const { getPersonalReportOptions } = require("../../api/src/modules/reports/report-definitions.ts");
const { chromium } = require(process.argv[2] || "playwright");
const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
const reportIds = ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002"];
const stageId = "30000000-0000-4000-8000-000000000001";
const programs = ids.map((id, i) => ({ id, name: "Chương trình " + (i ? "B" : "A"), code: i ? "B" : "A", institutionName: "Trường kiểm thử" }));
const permissions = ["dashboard.view", "dashboard.view_all", "lead.view_all", "report.personal.view", "report.personal.create", "report.personal.update", "report.personal.share", "report.personal.export"];
const options = getPersonalReportOptions({ permissions });
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.REPORT_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ program }) => { localStorage.setItem("admission-crm.access-token", "test-token"); if (!localStorage.getItem("admission-crm.selected-institution-program-id")) localStorage.setItem("admission-crm.selected-institution-program-id", program); }, { program: ids[0] });
      const page = await context.newPage(); const errors = [], writes = [];
      page.on("pageerror", error => errors.push(error.message));
      const reports = ids.map((program, i) => [{ id: reportIds[i], name: "Báo cáo " + (i ? "B" : "A"), ownerId: ids[0], ownerName: "Người kiểm thử", institutionProgramId: program, module: "SALE", metricKeys: ["totalLeads"], breakdownKey: null, chartType: "TABLE", filters: { mode: "SINGLE", datasetKey: "LEADS", singleDimensionKey: "SOURCE", singleDisplay: "TABLE", dateGranularity: "DAY", conditions: [] }, isShared: false }]);
      const result = report => ({ report, summary: [{ key: "totalLeads", label: "Kết quả " + (report.institutionProgramId === ids[0] ? "A" : "B"), format: "NUMBER", value: 2 }], rows: [], single: null, pivot: null });
      await page.route("**/api/**", async route => {
        const req = route.request(), endpoint = new URL(req.url()).pathname.replace(/^\/api/, "");
        const program = req.headers()["x-institution-program-id"] || ids[0], index = program === ids[0] ? 0 : 1;
        const config = { reportIds: [reportIds[index]], columnCount: index ? 1 : 3, maximumWidgets: 12, maximumKpis: 12, pipelineStages: [{ id: stageId, name: "Giai đoạn L2", position: 2, pipelineId: stageId, pipelineName: "Pipeline kiểm thử" }], kpiWidgets: [{ id: stageId, title: index ? "KPI B" : "KPI A", type: "COUNT", datasetKey: "LEADS", conditions: [] }] };
        let payload = { data: [], unreadCount: 0 };
        if (endpoint === "/auth/me") payload = { user: { id: ids[0], fullName: "Người kiểm thử", email: "user@example.test", roles: [], permissions, departmentIds: [], institutionProgramIds: ids, workingInstitutionProgramId: program, accessScope: "ALL" } };
        else if (endpoint === "/institution-programs/options") payload = { data: programs };
        else if (endpoint === "/reports/personal/options") payload = options;
        else if (endpoint === "/reports/personal/filter-values") payload = { items: [{ value: "test", label: "Giá trị " + (index ? "B" : "A"), count: 2 }] };
        else if (endpoint === "/reports/personal/dashboard/config") payload = config;
        else if (endpoint === "/reports/personal/dashboard") payload = { ...config, kpiConfig: config.kpiWidgets, kpiWidgets: [{ ...config.kpiWidgets[0], description: "Chương trình đang làm việc", value: 2, format: "NUMBER", trend: null }], widgets: [] };
        else if (endpoint === "/reports/personal" && req.method() === "POST") {
          const body = req.postDataJSON(); writes.push({ program, body });
          const report = { ...reports[index][0], name: body.name, filters: { ...body }, id: "40000000-0000-4000-8000-000000000001" };
          reports[index].push(report); payload = report;
        } else if (endpoint === "/reports/personal") payload = { items: reports[index], total: reports[index].length };
        else if (endpoint.endsWith("/result")) payload = result(reports[index].find(report => endpoint.includes(report.id)) || reports[index][0]);
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
      });
      async function switchProgram(index) {
        await page.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "Trường kiểm thử - " + programs[index].name, exact: true }).click();
      }
      const base = process.env.REPORT_TEST_URL || "http://127.0.0.1:5199";
      try {
        await page.goto(base + "/bao-cao/kpi-ca-nhan");
        await page.getByRole("button", { name: "Báo cáo A Của tôi" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Báo cáo B Của tôi" }).count(), 0);
        await page.getByRole("button", { name: "Báo cáo A Của tôi" }).click(); await page.getByText("Kết quả A", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Tạo báo cáo thống kê", exact: true }).click();
        await page.getByLabel("Tên báo cáo", { exact: true }).fill("Báo cáo điều kiện");
        const fieldSelect = () => page.getByText("Trường thông tin", { exact: true }).last().locator("..").getByRole("combobox");
        await fieldSelect().click(); await page.getByRole("option", { name: "Giai đoạn pipeline", exact: true }).click();
        await page.getByLabel("Điều kiện", { exact: true }).click();
        await page.getByRole("option", { name: "Lớn hơn hoặc bằng (≥)", exact: true }).waitFor();
        await page.getByRole("option", { name: "Nhỏ hơn hoặc bằng (≤)", exact: true }).click();
        await page.getByLabel("Giá trị", { exact: true }).click(); await page.getByRole("option", { name: "2. Giai đoạn L2", exact: true }).click();
        await page.getByRole("button", { name: "Thêm bộ lọc", exact: true }).click();
        await page.getByLabel("Điều kiện", { exact: true }).last().click(); await page.getByRole("option", { name: "Có dữ liệu", exact: true }).click();
        assert.equal(await page.getByLabel("Giá trị", { exact: true }).count(), 1);
        await page.getByRole("button", { name: "Thêm bộ lọc", exact: true }).click();
        await fieldSelect().click(); await page.getByRole("option", { name: "Nhân viên phụ trách", exact: true }).click();
        await page.getByLabel("Điều kiện", { exact: true }).last().click(); await page.getByRole("option", { name: "Không có dữ liệu", exact: true }).click();
        await page.getByRole("button", { name: "Lưu báo cáo", exact: true }).click();
        await page.getByText("Đã tạo và lưu báo cáo KPI.", { exact: true }).waitFor();
        assert.equal(writes[0].program, ids[0]);
        assert.deepEqual(writes[0].body.conditions, [{ fieldKey: "PIPELINE_STAGE", operator: "LESS_THAN_OR_EQUAL", value: stageId }, { fieldKey: "SOURCE", operator: "IS_NOT_EMPTY" }, { fieldKey: "ASSIGNEE", operator: "IS_EMPTY" }]);
        await page.getByRole("button", { name: "Tạo báo cáo thống kê", exact: true }).click();
        await switchProgram(1); await page.getByRole("button", { name: "Báo cáo B Của tôi" }).waitFor();
        assert.equal(await page.getByLabel("Tên báo cáo", { exact: true }).count(), 0, "Reset builder on switch");
        assert.equal(await page.getByText("Kết quả A", { exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Báo cáo A Của tôi" }).count(), 0);
        await page.getByRole("button", { name: "Báo cáo B Của tôi" }).click(); await page.getByText("Kết quả B", { exact: true }).waitFor();
        await page.goto(base + "/bao-cao/dashboard"); await page.getByText("KPI B", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Quản lý dashboard", exact: true }).click();
        await page.getByRole("button", { name: "Lưu dashboard", exact: true }).waitFor();
        await switchProgram(0); await page.getByText("KPI A", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Lưu dashboard", exact: true }).count(), 0, "Reset dashboard draft on switch");
        assert.equal(await page.getByText("KPI B", { exact: true }).count(), 0);
        assert.deepEqual(errors, []);
      } catch (error) { console.error({ url: page.url(), errors, body: (await page.locator("body").innerText()).slice(0,5000) }); throw error; } finally { await context.close(); }
    }
    console.log("PASS: desktop/mobile program switching, report/result isolation, dashboard draft reset, stage comparison values, valueless presence filters and save payload.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
