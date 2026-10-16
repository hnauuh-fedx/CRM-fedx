// Run against local Vite; API fixtures isolate this check from business data.
const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");
const programId = "10000000-0000-4000-8000-000000000001";
const stageId = "10000000-0000-4000-8000-000000000002";
const program = { id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Trường kiểm thử" };

async function verify() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LEAD_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      try {
        await context.addInitScript(() => localStorage.setItem("admission-crm.access-token", "lead-filter-test-token"));
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const requests = [];
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/**", async route => {
          const url = new URL(route.request().url());
          const endpoint = url.pathname.replace(/^\/api/, "");
          let payload = { data: [], unreadCount: 0 };
          if (endpoint === "/auth/me") payload = { user: { id: programId, fullName: "Người kiểm thử", email: "test@example.test", roles: [], permissions: ["lead.view_all"], departmentIds: [], institutionProgramIds: [programId], accessScope: "ALL" } };
          else if (endpoint === "/institution-programs/options") payload = { data: [program] };
          else if (endpoint === "/leads/options") payload = { sources: [], institutionPrograms: [program], assignees: [], majors: [], stages: [{ id: stageId, name: "Liên hệ (L1)", color: "#2563eb", count: 39 }], totalLeads: 45, failedLeads: 6 };
          else if (endpoint === "/leads") {
            const filters = Object.fromEntries(url.searchParams);
            requests.push(filters);
            payload = {
              data: [{
                id: stageId, fullName: filters.status === "FAIL" ? "Lead Fail kiểm thử" : "Lead kiểm thử", dateOfBirth: null,
                pipelineStage: { id: stageId, name: filters.status === "FAIL" ? "Đã tiếp nhận (L0)" : "Liên hệ (L1)", color: "#0ea5e9" },
                lifecycleStatus: filters.status === "FAIL"
                  ? { value: "FAIL", label: "Fail | L0", failedStageId: stageId }
                  : { value: "ACTIVE", label: "Active", failedStageId: null },
                note: "18:34:35 12/10/2026 - <p>Ghi chú cũ không cần hiển thị</p>\n08:35:52 13/10/2026 - <p>Ghi chú kiểm thử</p><p>Dòng ghi chú thứ hai &amp; hỗ trợ&nbsp;HV</p><script>window.noteExecuted = true</script><img src=\"https://invalid.example/note.png\" onerror=\"window.noteExecuted = true\">\n19:35:52 12/10/2026 - Ghi chú cũ được ghi sau",
              }],
              pagination: { page: Number(filters.page), limit: 20, total: filters.status === "FAIL" ? 6 : 45, totalPages: filters.status === "FAIL" ? 1 : 3 },
              filters, sort: { sortBy: "createdAt", sortOrder: "desc" },
            };
          }
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
        });
        await page.goto(`${process.env.LEAD_TEST_URL || "http://localhost:5173"}/sale/leads`);
        await page.getByRole("heading", { name: "Danh sách lead", exact: true }).waitFor();
        const fail = page.getByRole("button", { name: "Lọc lead ở trạng thái Fail", exact: true });
        const all = page.getByRole("button", { name: /^Tất cả/ });
        const stage = page.getByRole("button", { name: /^Liên hệ \(L1\)/ });
        await fail.waitFor();
        assert.equal(await page.getByRole("columnheader", { name: "Nhóm nguồn", exact: true }).count(), 0);
        await page.getByRole("columnheader", { name: "Tiến trình / trạng thái" }).waitFor();
        const activeBadge = page.getByRole("cell").getByText("Liên hệ (L1)", { exact: true });
        assert.equal(await activeBadge.evaluate(element => getComputedStyle(element).backgroundColor), "rgb(14, 165, 233)");
        assert.equal(await activeBadge.evaluate(element => getComputedStyle(element).color), "rgb(0, 0, 0)");
        assert.equal(await fail.innerText(), "Fail\n6");
        assert.equal(await page.getByRole("button", { name: "Active", exact: true }).count(), 0);
        const failBounds = await fail.boundingBox();
        const stageBounds = await stage.boundingBox();
        assert.ok(failBounds.y >= stageBounds.y + stageBounds.height);
        assert.ok(failBounds.x >= 0 && failBounds.x + failBounds.width <= viewport.width + 1);
        await page.getByRole("button", { name: "Trang sau", exact: true }).click();
        await page.getByText("Trang 2 / 3", { exact: true }).waitFor();
        await Promise.all([
          page.waitForResponse(response => new URL(response.url()).searchParams.get("pipelineStageId") === stageId),
          stage.click(),
        ]);
        assert.equal(requests.at(-1).page, "1");
        await fail.focus();
        await page.keyboard.press("Enter");
        await page.getByText("Lead Fail kiểm thử", { exact: true }).waitFor();
        const workflowCell = page.getByRole("row").filter({ has: page.getByText("Lead Fail kiểm thử", { exact: true }) }).getByRole("cell").filter({ hasText: "Fail | L0" });
        assert.equal(await workflowCell.count(), 1);
        assert.ok((await workflowCell.innerText()).includes("Ghi chú kiểm thử\nDòng ghi chú thứ hai & hỗ trợ HV"));
        assert.ok(!(await workflowCell.innerText()).includes("Đã tiếp nhận"));
        assert.ok(!(await workflowCell.innerText()).includes("Ghi chú cũ"));
        assert.ok(!(await workflowCell.innerText()).includes("<p>"));
        assert.ok(!(await workflowCell.innerText()).includes("window.noteExecuted"));
        assert.equal(await workflowCell.locator("img, script").count(), 0);
        assert.equal(await page.evaluate(() => window.noteExecuted), undefined);
        const statusBounds = await workflowCell.getByText("Fail | L0", { exact: true }).boundingBox();
        const noteBounds = await workflowCell.locator("p").boundingBox();
        assert.ok(noteBounds.y >= statusBounds.y + statusBounds.height);
        assert.equal(requests.at(-1).status, "FAIL");
        assert.equal(requests.at(-1).pipelineStageId, "");
        assert.equal(requests.at(-1).page, "1");
        assert.equal(await fail.getAttribute("aria-pressed"), "true");
        assert.equal(await all.getAttribute("aria-pressed"), "false");
        assert.equal(await stage.getAttribute("aria-pressed"), "false");
        await Promise.all([
          page.waitForResponse(response => new URL(response.url()).searchParams.get("search") === "Candidate"),
          page.getByPlaceholder("Họ tên, SĐT, email hoặc mã lead").fill("Candidate"),
        ]);
        assert.equal(requests.at(-1).status, "FAIL");
        await stage.click();
        await page.getByText("Lead kiểm thử", { exact: true }).waitFor();
        await page.getByRole("cell").getByText("Liên hệ (L1)", { exact: true }).waitFor();
        assert.equal(requests.at(-1).pipelineStageId, stageId);
        assert.equal(requests.at(-1).status, "");
        assert.equal(requests.at(-1).search, "Candidate");
        await fail.click();
        await page.getByText("Lead Fail kiểm thử", { exact: true }).waitFor();
        await all.click();
        await page.getByText("Lead kiểm thử", { exact: true }).waitFor();
        assert.equal(requests.at(-1).status, "");
        assert.equal(requests.at(-1).pipelineStageId, "");
        await fail.click();
        await page.getByText("Lead Fail kiểm thử", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Xóa lọc", exact: true }).click();
        await page.getByText("Lead kiểm thử", { exact: true }).waitFor();
        assert.equal(await page.getByPlaceholder("Họ tên, SĐT, email hoặc mã lead").inputValue(), "");
        assert.equal(await all.getAttribute("aria-pressed"), "true");
        assert.equal(await fail.getAttribute("aria-pressed"), "false");
        assert.equal(await page.getByRole("button", { name: "Xóa lọc", exact: true }).isDisabled(), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log("Lead list passed: desktop/mobile, stage colors/contrast, latest chronological Bizfly note as plain text, inert HTML, Fail | L0, filters and pagination.");
  } finally { await browser.close(); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
