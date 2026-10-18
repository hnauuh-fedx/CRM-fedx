const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");
const programA = "10000000-0000-4000-8000-000000000001";
const programB = "10000000-0000-4000-8000-000000000002";
const roleA = "20000000-0000-4000-8000-000000000001";
const roleB = "20000000-0000-4000-8000-000000000002";
const programs = [
  { id: programA, code: "A", name: "Chương trình A", institutionName: "Trường kiểm thử", roles: [{ id: roleA, code: "SALE_A", name: "Telesale A", description: null, scopeCode: "ASSIGNED_ONLY" }] },
  { id: programB, code: "B", name: "Chương trình B", institutionName: "Trường kiểm thử", roles: [{ id: roleB, code: "MANAGER_B", name: "Quản lý B", description: null, scopeCode: "DEPARTMENT" }] },
];
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ACCESS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => localStorage.setItem("admission-crm.access-token", "test-token"));
      const page = await context.newPage();
      const writes = [], pageErrors = [];
      let items = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.route("**/api/**", async route => {
        const req = route.request(), endpoint = new URL(req.url()).pathname.replace(/^\/api/, "");
        let payload = { data: [], unreadCount: 0 }, status = 200;
        if (endpoint === "/auth/me") payload = { user: { id: programA, fullName: "Quản trị kiểm thử", email: "actor@example.test", roles: ["ADMIN"], permissions: ["user.manage"], departmentIds: [], institutionProgramIds: [programA, programB], accessScope: "DEPARTMENT" } };
        else if (endpoint === "/institution-programs/options") payload = { data: programs };
        else if (endpoint === "/users/options") payload = { programs, roles: programs[0].roles, departments: [], scopes: ["DEPARTMENT", "ASSIGNED_ONLY"] };
        else if (endpoint.startsWith("/users") && ["POST", "PATCH"].includes(req.method())) {
          const body = req.postDataJSON(); writes.push({ method: req.method(), body });
          items = [{ id: programB, ...body, phone: null, avatarUrl: null, lastLoginAt: null, createdAt: null, departments: [], roles: [],
            programAssignments: body.programAssignments.map(grant => ({ ...grant, programName: programs.find(p => p.id === grant.institutionProgramId).name, institutionName: "Trường kiểm thử", roleName: programs.find(p => p.id === grant.institutionProgramId).roles[0].name })) }];
          payload = { id: programB }; status = req.method() === "POST" ? 201 : 200;
        } else if (endpoint === "/users") payload = { data: items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      });
      try {
        await page.goto(process.env.ACCESS_TEST_URL || "http://127.0.0.1:5198/quan-ly/nguoi-dung");
        await page.getByRole("heading", { name: "Quản lý người dùng", exact: true }).waitFor();
        await page.getByRole("button", { name: "Thêm người dùng", exact: true }).first().click();
        const dialog = page.getByRole("dialog"); await dialog.waitFor();
        const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
        await dialog.getByLabel("Họ và tên *", { exact: true }).fill("Người dùng kiểm thử");
        await dialog.getByLabel("Email *", { exact: true }).fill("user@example.test");
        await dialog.getByLabel("Mật khẩu ban đầu *", { exact: true }).fill("TestPassword123");
        await dialog.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
        await dialog.getByText("Vui lòng chọn ít nhất một chương trình.", { exact: true }).waitFor();
        const checkA = dialog.locator("#user-program-" + programA), checkB = dialog.locator("#user-program-" + programB);
        await checkA.focus(); await page.keyboard.press("Space");
        const selectA = dialog.locator("#user-program-role-" + programA);
        await selectA.waitFor(); assert.equal(await dialog.locator("#user-program-role-" + programB).count(), 0);
        await dialog.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
        await dialog.getByText("Vui lòng chọn một vai trò thuộc chương trình này.", { exact: true }).waitFor(); assert.equal(writes.length, 0);
        await selectA.click(); await page.getByRole("option", { name: "Telesale A", exact: true }).waitFor();
        assert.equal(await page.getByRole("option", { name: "Quản lý B", exact: true }).count(), 0);
        await page.getByRole("option", { name: "Telesale A", exact: true }).click();
        assert.ok((await dialog.locator("#user-scope").innerText()).includes("Lead được giao"));
        await dialog.locator("#user-scope").click();
        assert.equal(await page.getByRole("option", { name: "Theo phòng ban", exact: true }).count(), 0, "Cannot choose an expanded scope for an assigned role");
        await page.keyboard.press("Escape");
        await checkB.click(); const selectB = dialog.locator("#user-program-role-" + programB); await selectB.click();
        assert.equal(await page.getByRole("option", { name: "Telesale A", exact: true }).count(), 0);
        await page.getByRole("option", { name: "Quản lý B", exact: true }).click();
        await checkB.click(); assert.equal(await selectB.count(), 0);
        await dialog.getByRole("button", { name: "Thêm người dùng", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(writes[0].body.programAssignments, [{ institutionProgramId: programA, roleId: roleA }]); assert.equal("roleIds" in writes[0].body, false);
        await page.getByRole("button", { name: "Sửa người dùng Người dùng kiểm thử", exact: true }).click();
        await dialog.waitFor(); await selectA.waitFor(); assert.ok((await selectA.innerText()).includes("Telesale A"));
        await checkB.click(); await selectB.click(); await page.getByRole("option", { name: "Quản lý B", exact: true }).click();
        await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
        assert.equal(writes[1].body.programAssignments.length, 2);
        await page.getByRole("button", { name: "Sửa người dùng Người dùng kiểm thử", exact: true }).click(); await dialog.waitFor();
        await checkA.click(); assert.equal(await selectA.count(), 0);
        await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(writes[2].body.programAssignments, [{ institutionProgramId: programB, roleId: roleB }]);
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    console.log("PASS: desktop/mobile, keyboard checkbox, progressive role display, required role, role filtering, unchecked removal, create/edit defaults and saved payload.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
