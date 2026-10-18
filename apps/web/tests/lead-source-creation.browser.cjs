// Run against a local Vite server; all API requests use isolated browser fixtures.
const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");
const programId = "10000000-0000-4000-8000-000000000001";
const program = { id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Trường kiểm thử" };

async function fixture(browser, viewport, canManage) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => localStorage.setItem("admission-crm.access-token", "source-test-token"));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const requests = [];
  const sources = [];
  const errors = [];
  let rejectSave = true;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.route("**/api/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let status = 200;
    let payload = { data: [], unreadCount: 0 };
    if (endpoint === "/auth/me") payload = { user: { id: programId, fullName: "Người kiểm thử", email: "test@example.test", roles: [], permissions: canManage ? ["campaign.view_all", "lead_source.manage"] : ["campaign.view_all"], departmentIds: [], institutionProgramIds: [programId], accessScope: "ALL" } };
    else if (endpoint === "/institution-programs/options") payload = { data: [program] };
    else if (endpoint === "/lead-sources/options") payload = { types: [], institutionPrograms: [program] };
    else if (endpoint === "/lead-sources" && route.request().method() === "POST") {
      requests.push({ body: route.request().postDataJSON(), programId: route.request().headers()["x-institution-program-id"] });
      if (rejectSave) { status = 400; payload = { message: "Không thể lưu nguồn kiểm thử." }; rejectSave = false; }
      else { sources.push({ id: programId, name: requests.at(-1).body.name, type: null, institutionProgram: program, activeLeadCount: 0, createdAt: new Date().toISOString() }); status = 201; payload = sources[0]; }
    } else if (endpoint === "/lead-sources") {
      assert.equal(route.request().headers()["x-institution-program-id"], programId);
      payload = { data: sources, pagination: { page: 1, limit: 20, total: sources.length, totalPages: 1 } };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto(process.env.SOURCE_TEST_URL || "http://127.0.0.1:5197/marketing/nguon-lead");
  try { await page.getByRole("heading", { name: "Nguồn lead", exact: true }).first().waitFor(); } catch (error) { console.error({ url: page.url(), errors, body: await page.locator("body").innerText() }); await context.close(); throw error; }
  return { page, context, requests, errors };
}

async function verify() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOURCE_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const { page, context, requests, errors } = await fixture(browser, viewport, true);
      try {
        await page.getByRole("button", { name: "Thêm nguồn", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
        await page.getByRole("button", { name: "Lưu nguồn", exact: true }).click();
        await page.getByText("Vui lòng nhập tên nguồn.", { exact: true }).waitFor();
        assert.equal(requests.length, 0);
        const input = page.getByLabel("Tên nguồn *", { exact: true });
        assert.equal(await input.evaluate(element => document.activeElement === element), true);
        await input.fill("  Nguồn browser test  ");
        await page.getByRole("button", { name: "Lưu nguồn", exact: true }).click();
        await page.getByText("Không thể lưu nguồn kiểm thử.", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Lưu nguồn", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("status").filter({ hasText: "Đã thêm nguồn" }).waitFor();
        await page.getByRole("cell", { name: "Nguồn browser test", exact: true }).waitFor();
        assert.equal(requests.length, 2);
        assert.deepEqual(requests[1], { body: { name: "Nguồn browser test" }, programId });
        await page.getByRole("button", { name: "Thêm nguồn", exact: true }).click();
        assert.equal(await input.inputValue(), "");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    const readOnly = await fixture(browser, { width: 1440, height: 900 }, false);
    try { assert.equal(await readOnly.page.getByRole("button", { name: "Thêm nguồn", exact: true }).count(), 0); assert.deepEqual(readOnly.errors, []); }
    finally { await readOnly.context.close(); }
    console.log("Lead-source browser checks passed: desktop/mobile dialog, validation and focus, API error/retry, program header, trimmed save, list refresh, reset, Escape and read-only visibility.");
  } finally { await browser.close(); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
