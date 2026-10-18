// Run against local Vite: node tests/lead-filter-builder.browser.cjs <path-to-playwright>. API is mocked.
const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");
const programId = "10000000-0000-4000-8000-000000000001";
const stageId = "10000000-0000-4000-8000-000000000002";
const fieldId = "10000000-0000-4000-8000-000000000003";
const program = { id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Trường kiểm thử" };
const customField = {
  id: fieldId, code: "school_type", name: "Hệ đào tạo", description: null,
  group: { id: "g", key: "g", label: "Nhóm", description: null, isSystem: false, displayOrder: 0 },
  dataType: "SELECT", isRequired: false, isSensitive: false, displayOrder: 0,
  options: [{ code: "full_time", label: "Chính quy", isActive: true, displayOrder: 0 }],
  validationRules: null, value: null, canView: true, canEdit: false,
};

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
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/api/**", async (route) => {
          const url = new URL(route.request().url());
          const endpoint = url.pathname.replace(/^\/api/, "");
          let payload = { data: [], unreadCount: 0 };
          if (endpoint === "/auth/me") payload = { user: { id: programId, fullName: "Người kiểm thử", email: "test@example.test", roles: [], permissions: ["lead.view_all"], departmentIds: [], institutionProgramIds: [programId], accessScope: "ALL" } };
          else if (endpoint === "/institution-programs/options") payload = { data: [program] };
          else if (endpoint === "/leads/options") payload = { sources: [], institutionPrograms: [program], assignees: [], majors: [], stages: [{ id: stageId, name: "Liên hệ (L1)", color: "#2563eb", count: 1 }], totalLeads: 1, failedLeads: 0, customFields: [customField] };
          else if (endpoint === "/leads") {
            requests.push(Object.fromEntries(url.searchParams));
            payload = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, filters: {}, sort: { sortBy: "createdAt", sortOrder: "desc" } };
          }
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
        });
        const lastFilters = () => JSON.parse(requests.at(-1).filters ?? "[]");
        const choose = async (comboboxName, optionName) => {
          await page.getByRole("combobox", { name: comboboxName }).click();
          await page.getByRole("option", { name: optionName, exact: true }).click();
        };

        await page.goto(`${process.env.LEAD_TEST_URL || "http://localhost:5173"}/sale/leads`);
        await page.getByRole("heading", { name: "Danh sách lead", exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Xóa lọc", exact: true }).isDisabled(), true);

        await page.getByRole("button", { name: "Bộ lọc", exact: true }).click();
        await page.getByText("Lọc danh sách theo:").waitFor();
        const popover = page.locator("[data-slot=popover-content]");
        const bounds = await popover.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, "popover nằm trong màn hình");
        assert.equal(await page.getByRole("button", { name: "Áp dụng", exact: true }).isDisabled(), true);

        // Dòng 1: Tiến trình | Là | Liên hệ (L1) — dropdown lồng trong popover không được đóng popover.
        await choose("Trường lọc của điều kiện 1", "Tiến trình");
        await choose("Điều kiện của dòng 1", "Là");
        await choose("Giá trị lọc cho Tiến trình", "Liên hệ (L1)");

        // Menu 3 chấm → thêm điều kiện "Hoặc": Ngày tạo | Tháng này (không cần ô giá trị).
        await page.getByRole("button", { name: "Thêm điều kiện so sánh với điều kiện 1" }).click();
        await page.getByRole("menuitem", { name: 'Thêm điều kiện "Hoặc"' }).click();
        await choose("Trường lọc của điều kiện 2", "Ngày tạo");
        await choose("Điều kiện của dòng 2", "Tháng này");
        assert.equal(await page.getByRole("button", { name: "Giá trị lọc cho Ngày tạo" }).count(), 0);

        // "+ Thêm điều kiện lọc": trường tùy chỉnh dạng dropdown, "Có giá trị" ẩn ô giá trị.
        await page.getByRole("button", { name: "Thêm điều kiện lọc" }).click();
        await choose("Trường lọc của điều kiện 3", "Hệ đào tạo");
        await choose("Điều kiện của dòng 3", "Không có giá trị");
        assert.equal(await page.getByRole("combobox", { name: "Giá trị lọc cho Hệ đào tạo" }).count(), 0);
        assert.equal(await page.getByRole("combobox", { name: "Phép nối của điều kiện 2" }).innerText(), "Hoặc:");
        assert.equal(await page.getByRole("combobox", { name: "Phép nối của điều kiện 3" }).innerText(), "Và:");

        await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).searchParams.has("filters")),
          page.getByRole("button", { name: "Áp dụng", exact: true }).click(),
        ]);
        assert.deepEqual(lastFilters(), [
          { field: "pipelineStageId", operator: "EQUALS", value: stageId },
          { combinator: "OR", field: "createdAt", operator: "IS_THIS_MONTH" },
          { combinator: "AND", field: `cf:${fieldId}`, operator: "HAS_NO_VALUE" },
        ]);
        assert.equal(requests.at(-1).page, "1");
        assert.ok(new URL(page.url()).searchParams.has("filters"), "bộ lọc được lưu trên URL");
        await page.getByRole("button", { name: "Bộ lọc, đang áp dụng 3 điều kiện" }).waitFor();

        // Tải lại trang: bộ lọc vẫn được áp dụng.
        requests.length = 0;
        await page.reload();
        await page.getByRole("button", { name: "Bộ lọc, đang áp dụng 3 điều kiện" }).waitFor();
        assert.equal(lastFilters().length, 3);

        // Xoá dòng 1 → các dòng sau dồn lên, dòng đầu mới không còn phép nối.
        await page.getByRole("button", { name: "Bộ lọc, đang áp dụng 3 điều kiện" }).click();
        await page.getByRole("button", { name: "Xóa điều kiện 1" }).click();
        assert.equal(await page.getByRole("combobox", { name: "Phép nối của điều kiện 1" }).count(), 0);
        await page.getByRole("combobox", { name: "Trường lọc của điều kiện 1" }).filter({ hasText: "Ngày tạo" }).waitFor();
        await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/leads")),
          page.getByRole("button", { name: "Áp dụng", exact: true }).click(),
        ]);
        assert.deepEqual(lastFilters(), [
          { field: "createdAt", operator: "IS_THIS_MONTH" },
          { combinator: "AND", field: `cf:${fieldId}`, operator: "HAS_NO_VALUE" },
        ]);

        // Xóa lọc: bỏ toàn bộ điều kiện khỏi request và URL.
        await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/leads") && !new URL(response.url()).searchParams.has("filters")),
          page.getByRole("button", { name: "Xóa lọc", exact: true }).click(),
        ]);
        assert.equal(new URL(page.url()).searchParams.has("filters"), false);
        await page.getByRole("button", { name: "Bộ lọc", exact: true }).waitFor();
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log("Lead filter builder passed: desktop/mobile, nested dropdowns, Và/Hoặc rows, value editors by type, apply-only, URL persistence, row removal, clear.");
  } finally { await browser.close(); }
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
