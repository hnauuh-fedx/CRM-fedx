const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");
const programId = "10000000-0000-4000-8000-000000000001";
const leadId = "10000000-0000-4000-8000-000000000002";
const stageId = "10000000-0000-4000-8000-000000000003";

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const allowed of [true, false]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      try {
        await context.addInitScript(() => localStorage.setItem("admission-crm.access-token", "test-token"));
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") console.log(message.text()); });
        const program = { id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Trường kiểm thử" };
        const stage = { id: stageId, name: "Liên hệ (L1)", color: null, pipelineId: programId, pipelineName: "Tuyển sinh" };
        const lead = { id: leadId, fullName: "Ứng viên kiểm thử", leadCode: "TEST-001", recordType: "candidate", phone: null,
          lifecycleStatus: { value: "ACTIVE", label: "Active", failedStageId: null }, pipelineStage: stage,
          institutionProgram: program, source: null, createdAt: "2026-10-13T01:00:00Z", assignee: null,
          sourceOccurrences: [], assignments: [], stageHistory: [], notes: [], activities: [], recentChanges: [], files: [] };
        const requests = [];
        await page.route("**/api/**", async (route) => {
          const url = new URL(route.request().url());
          const endpoint = url.pathname.replace(/^\/api/, "");
          let payload = { data: [], unreadCount: 0 };
          if (endpoint === "/auth/me") payload = { user: { id: programId, fullName: "Kiểm thử", roles: [],
            permissions: ["lead.view_all", "student.view_all", ...(allowed ? ["student.convert_from_lead", "student.revert_to_candidate"] : ["lead.update_all", "lead_note.create", "file.upload"])],
            departmentIds: [], institutionProgramIds: [programId], accessScope: "ALL" } };
          else if (endpoint === "/institution-programs/options") payload = { data: [program] };
          else if (endpoint === "/leads/options") payload = { sources: [], institutionPrograms: [program], assignees: [], majors: [], stages: [{ ...stage, count: 1 }], totalLeads: 1, failedLeads: 0 };
          else if (endpoint === "/leads/action-options") payload = { sources: [], institutionPrograms: [program], majors: [], admissionStatuses: [], stages: [stage], telesales: [], departments: [] };
          else if (endpoint === "/leads") {
            const audience = url.searchParams.get("audience");
            requests.push(audience);
            const visible = audience === "all" || (audience === "students") === (lead.recordType === "student");
            payload = { data: visible ? [lead] : [], pagination: { page: 1, limit: 20, total: visible ? 1 : 0, totalPages: 1 }, filters: {}, sort: { sortBy: "createdAt", sortOrder: "desc" } };
          } else if (endpoint === `/leads/${leadId}`) payload = { data: lead };
          else if (endpoint === `/leads/${leadId}/custom-fields`) payload = { fields: [], canEdit: false };
          else if (endpoint === `/leads/${leadId}/membership`) {
            lead.recordType = route.request().postDataJSON().target;
            payload = { id: leadId, recordType: lead.recordType };
          }
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
        });
        await page.goto("http://localhost:5173/sale/leads");
        await page.getByRole("cell", { name: lead.fullName, exact: true }).click();
        await page.getByRole("dialog").waitFor({ timeout: 5000 }).catch(async (error) => {
          console.log("Page errors:", errors, "URL:", page.url(), "Body:", await page.locator("body").innerText()); throw error;
        });
        const popup = page.getByRole("dialog");
        if (!allowed) {
          assert.equal(await popup.getByRole("button", { name: "Chuyển sang học viên", exact: true }).count(), 0);
          lead.recordType = "student";
          await page.goto(`http://localhost:5173/sale/students/${leadId}`);
          await page.getByRole("heading", { name: lead.fullName, exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "Chuyển trở lại ứng viên", exact: true }).count(), 0);
          assert.equal(await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).count(), 0);
          assert.deepEqual(errors, []);
          continue;
        }
        await popup.getByRole("button", { name: "Chuyển sang học viên", exact: true }).click({ timeout: 10000 }).catch(async (error) => {
          console.log(await popup.innerText()); throw error;
        });
        await page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Chuyển sang học viên" }) })
          .getByRole("button", { name: "Chuyển sang học viên", exact: true }).click();
        await popup.getByRole("button", { name: "Chuyển trở lại ứng viên", exact: true }).waitFor();
        assert.equal(lead.pipelineStage.id, stageId);
        await page.goto("http://localhost:5173/marketing/danh-sach-khach-hang");
        await page.getByRole("cell", { name: lead.fullName, exact: true }).waitFor();
        assert.ok(requests.includes("all"));
        await page.goto("http://localhost:5173/sale/students");
        await page.getByRole("cell", { name: lead.fullName, exact: true }).waitFor();
        assert.ok(requests.includes("students"));
        await page.goto(`http://localhost:5173/sale/students/${leadId}`);
        await page.getByRole("button", { name: "Chuyển trở lại ứng viên", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Chuyển trở lại ứng viên", exact: true }).click();
        await page.getByRole("button", { name: "Chuyển sang học viên", exact: true }).waitFor();
        assert.equal(lead.pipelineStage.id, stageId);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
      }
    }
    console.log("Desktop/mobile: popup conversion, student list/detail, reverse conversion and Marketing retention passed.");
  } finally { await browser.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
