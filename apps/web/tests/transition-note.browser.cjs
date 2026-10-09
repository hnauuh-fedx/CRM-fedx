// Run against the local Vite server with Playwright available (no production data is changed).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.argv[2] || "playwright");

const programId = "10000000-0000-4000-8000-000000000001";
const leadId = "10000000-0000-4000-8000-000000000002";
const stage1 = "10000000-0000-4000-8000-000000000003";
const stage3 = "10000000-0000-4000-8000-000000000004";
const stage0 = "10000000-0000-4000-8000-000000000007";
const templateId = "10000000-0000-4000-8000-000000000005";
const failTemplateId = "10000000-0000-4000-8000-000000000006";
const screenshots = path.join(os.tmpdir(), "admission-crm-transition-note-qa");
fs.mkdirSync(screenshots, { recursive: true });

async function fixture(browser, viewport, opening = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("admission-crm.access-token", "browser-test-token"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = [];
  const program = { id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Trường kiểm thử", programTypeName: "Đại học" };
  const stages = [{ id: stage1, name: "L1", color: null, pipelineId: programId, pipelineName: "Telesale" }, { id: stage3, name: "L3", color: null, pipelineId: programId, pipelineName: "Telesale" }];
  stages.unshift({ id: stage0, name: "L0", color: null, pipelineId: programId, pipelineName: "Telesale" });
  const configuration = [
    { target: stage1, label: "L1", pipelineName: "Telesale", templates: [] },
    { target: stage3, label: "L3", pipelineName: "Telesale", templates: [{ id: templateId, content: "Còn phân vân học phí", isActive: true }] },
    { target: "FAIL", label: "Fail", pipelineName: null, templates: [{ id: failTemplateId, content: "Sai đối tượng", isActive: true }] },
  ];
  const lead = {
    id: leadId, fullName: "Ứng viên kiểm thử", phone: "0900000000", email: null, leadCode: "TEST-001", createdAt: "2026-10-05T01:00:00Z",
    lifecycleStatus: { value: "ACTIVE", label: "Active", failedStageId: null }, pipelineStage: stages.find((stage) => stage.id === stage1),
    institutionProgramId: programId, institutionProgram: program, source: { id: programId, name: "Nguồn kiểm thử" },
    tags: "", note: "Ghi chú trước đó", assignments: [], stageHistory: [], notes: [], activities: [], recentChanges: [], files: [], sourceOccurrences: [],
  };
  if (opening.unselected) lead.pipelineStage = null;
  if (opening.owner) lead.assignee = { id: opening.owner, fullName: "Nhân viên kiểm thử" };
  if (opening.failed) lead.lifecycleStatus = { value: "FAIL", label: "Fail | L3", failedStageId: stage3 };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/^\/api/, "");
    const method = route.request().method();
    let payload = {};
    if (endpoint === "/auth/me") payload = { user: { id: programId, email: "test@example.test", fullName: "Nhân viên kiểm thử", avatarUrl: null, roles: ["TELESALE"], permissions: ["lead.view_assigned", "lead.update_assigned", "custom_field.view", "custom_field.update", "custom_field.manage_options"], departmentIds: [], institutionProgramIds: [programId], accessScope: "ASSIGNED_ONLY" } };
    else if (endpoint === "/institution-programs/options") payload = { data: [program] };
    else if (endpoint === "/leads/action-options") payload = { sources: [lead.source], stages, assignees: [], telesales: [], departments: [], institutionPrograms: [program], majors: [], admissionStatuses: [], tags: [], systemFieldRequirements: { fullName: true, phone: true, sourceId: true } };
    else if (endpoint === "/leads/options") payload = { sources: [lead.source], stages: stages.map((item) => ({ ...item, count: 1 })), institutionPrograms: [program], assignees: [], majors: [], totalLeads: 1 };
    else if (endpoint === "/leads") payload = { data: [lead], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, sort: { sortBy: "createdAt", sortOrder: "desc" }, filters: {} };
    else if (endpoint === `/leads/${leadId}`) {
      if (method === "PATCH") { requests.push({ endpoint, body: route.request().postDataJSON() }); payload = { id: leadId }; }
      else payload = { data: lead };
    }
    else if (endpoint === `/leads/${leadId}/open`) {
      requests.push({ endpoint, method, body: {} });
      const changed = !lead.pipelineStage && lead.assignee?.id === programId && lead.lifecycleStatus.value === "ACTIVE";
      if (changed) lead.pipelineStage = stages.find((stage) => stage.id === stage0);
      payload = { id: leadId, changed };
    }
    else if (endpoint === `/leads/${leadId}/custom-fields`) payload = { fields: [], canEdit: true };
    else if (endpoint === `/leads/${leadId}/transition-note-options`) {
      const item = configuration.find((item) => item.target === url.searchParams.get("target"));
      payload = { target: item.target, label: item.label, templates: item.templates.filter((template) => template.isActive).map(({ id, content }) => ({ id, content })) };
    }
    else if ([`/leads/${leadId}/stage`, `/leads/${leadId}/status`].includes(endpoint)) {
      const body = route.request().postDataJSON();
      requests.push({ endpoint, body });
      if (body.stageId) lead.pipelineStage = stages.find((item) => item.id === body.stageId);
      else if (body.status === "FAIL") {
        lead.lifecycleStatus = { value: "FAIL", label: `Fail | ${lead.pipelineStage.name}`, failedStageId: lead.pipelineStage.id };
        lead.pipelineStage = null;
      } else {
        lead.pipelineStage = stages.find((item) => item.id === lead.lifecycleStatus.failedStageId);
        lead.lifecycleStatus = { value: "ACTIVE", label: "Active", failedStageId: null };
      }
      if (body.noteTemplateId) {
        const target = body.status === "FAIL" ? "FAIL" : lead.pipelineStage.id;
        const item = configuration.find((item) => item.target === target);
        const selected = item.templates.find((template) => template.id === body.noteTemplateId);
        lead.note = `${item.label} | ${body.noteContent ?? selected.content}`;
        lead.notes.unshift({ id: body.noteTemplateId, content: lead.note, author: null, createdAt: lead.createdAt });
      }
      payload = { id: leadId, changed: true };
    }
    else if (endpoint === `/leads/${leadId}/notes` && method === "POST") {
      const body = route.request().postDataJSON();
      requests.push({ endpoint, body });
      const content = `${lead.lifecycleStatus.value === "FAIL" ? "Fail" : lead.pipelineStage.name} | ${body.content.trim()}`;
      lead.notes.unshift({ id: `manual-${requests.length}`, content, author: null, createdAt: lead.createdAt });
      payload = { id: lead.notes[0].id };
    }
    else if (endpoint === "/custom-fields/system/LEAD/note-templates") payload = configuration;
    else if (endpoint.startsWith("/custom-fields/system/LEAD/note-templates/")) {
      const target = endpoint.split("/").pop();
      const body = route.request().postDataJSON();
      requests.push({ endpoint, body });
      configuration.find((item) => item.target === target).templates = body.templates;
      payload = body.templates;
    }
    else if (endpoint === "/custom-fields/system/LEAD/requirements") payload = { fullName: true, phone: true, sourceId: true };
    else if (endpoint.startsWith("/custom-fields")) payload = [];
    else if (endpoint.startsWith("/notifications")) payload = { data: [], unreadCount: 0 };
    await route.fulfill({ json: payload, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  return { page, context, requests, errors };
}

async function chooseNote(page, content) {
  await page.getByRole("dialog", { name: "Ghi chú chuyển trạng thái" }).getByRole("combobox").click();
  await page.getByRole("option", { name: content, exact: true }).click();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
      for (const surface of ["detail", "popup"]) {
        const opened = await fixture(browser, viewport, { unselected: true, owner: programId });
        await opened.page.goto(`http://127.0.0.1:5173/sale/leads${surface === "detail" ? `/${leadId}` : ""}`);
        if (surface === "popup") {
          assert.equal(opened.requests.length, 0, "Viewing the list alone must never initialize leads.");
          await opened.page.getByLabel("Mở chi tiết Ứng viên kiểm thử", { exact: true }).click();
        }
        await opened.page.getByText("Đã tự động chuyển lead sang tiến trình L0", { exact: true }).waitFor().catch(async (error) => {
          console.error({ surface, viewport, requests: opened.requests, errors: opened.errors, text: (await opened.page.locator("body").innerText()).slice(0, 4500) });
          throw error;
        });
        assert.equal(opened.requests.filter((request) => request.endpoint.endsWith("/open")).length, 1);
        await opened.page.getByRole("button", { name: "L0", exact: true }).waitFor();
        await opened.page.getByText("Tiến trình hiện tại: L0", { exact: true }).waitFor();
        await opened.page.screenshot({ path: path.join(screenshots, `open-${surface}-${viewport.width}.png`) });
        if (surface === "popup") {
          await opened.page.getByRole("button", { name: "Đóng", exact: true }).click();
          await opened.page.getByRole("dialog", { name: "Ứng viên kiểm thử" }).waitFor({ state: "hidden" });
          await opened.page.getByLabel("Mở chi tiết Ứng viên kiểm thử", { exact: true }).click();
        } else await opened.page.reload();
        await opened.page.getByRole("button", { name: "L0", exact: true }).waitFor();
        assert.equal(opened.requests.filter((request) => request.endpoint.endsWith("/open")).length, 1, "Reopening must not repeat initialization.");
        assert.equal(opened.errors.length, 0, opened.errors.join("\n"));
        await opened.context.close();
      }
      for (const excluded of [{ unselected: true, owner: leadId }, { unselected: true }, { unselected: true, owner: programId, failed: true }]) {
        const unopened = await fixture(browser, viewport, excluded);
        await unopened.page.goto(`http://127.0.0.1:5173/sale/leads/${leadId}`);
        await unopened.page.getByRole("button", { name: "L0", exact: true }).waitFor();
        assert.equal(unopened.requests.length, 0, "Other owners, unassigned leads and Fail must not initialize.");
        await unopened.context.close();
      }
      console.log(`Lead-open checks passed at ${viewport.width}px: detail, popup, notification, repeat opens and exclusions.`);
      const { page, context, requests, errors } = await fixture(browser, viewport);
      await page.goto(`http://127.0.0.1:5173/sale/leads/${leadId}`);
      await page.getByRole("button", { name: "L3", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Ghi chú chuyển trạng thái" });
      await dialog.waitFor();
      assert.equal(requests.length, 0);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests.length, 0, "Escape must not save a transition.");
      await page.getByRole("button", { name: "L3", exact: true }).click();
      await chooseNote(page, "Còn phân vân học phí");
      assert.equal(await dialog.getByText("Nội dung sẽ lưu", { exact: true }).count(), 0);
      assert.equal(await dialog.getByLabel("Nội dung ghi chú", { exact: true }).inputValue(), "Còn phân vân học phí");
      await dialog.getByLabel("Nội dung ghi chú", { exact: true }).fill(" ");
      assert.equal(await dialog.getByRole("button", { name: "Xác nhận", exact: true }).isDisabled(), true);
      await dialog.getByLabel("Nội dung ghi chú", { exact: true }).fill("Còn phân vân học phí, hẹn gọi lại ngày mai");
      assert.equal(await dialog.getByText("L3 | Còn phân vân học phí, hẹn gọi lại ngày mai", { exact: true }).count(), 0);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]'))), true);
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, "Popup must fit the viewport.");
      await page.screenshot({ path: path.join(screenshots, `stage-${viewport.width}.png`) });
      await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(requests[0].body, { stageId: stage3, noteTemplateId: templateId, noteContent: "Còn phân vân học phí, hẹn gọi lại ngày mai" });
      await page.getByRole("combobox", { name: "Trạng thái lead" }).click();
      await page.getByRole("option", { name: "Fail | L3", exact: true }).click();
      await chooseNote(page, "Sai đối tượng");
      assert.equal(await dialog.getByLabel("Nội dung ghi chú", { exact: true }).inputValue(), "Sai đối tượng");
      await dialog.getByLabel("Nội dung ghi chú", { exact: true }).fill("Sai đối tượng, muốn học chương trình khác");
      await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(requests[1].body, { status: "FAIL", noteTemplateId: failTemplateId, noteContent: "Sai đối tượng, muốn học chương trình khác" });
      await page.getByRole("combobox", { name: "Trạng thái lead" }).click();
      await page.getByRole("option", { name: "Active", exact: true }).click();
      await dialog.getByRole("button", { name: "Chuyển không ghi chú", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(requests[2].body, { status: "ACTIVE" });
      await Promise.all([
        page.waitForResponse((response) => response.url().endsWith(`/leads/${leadId}/stage`) && response.request().method() === "PATCH"),
        page.getByRole("button", { name: "L1", exact: true }).click(),
      ]);
      assert.deepEqual(requests[3].body, { stageId: stage1 });
      assert.equal(await dialog.count(), 0, "No templates means no popup.");
      await page.getByRole("tab", { name: /^Ghi chú/ }).click();
      await page.getByLabel("Thêm ghi chú chăm sóc", { exact: true }).fill("Hẹn gọi lại lúc 3:33");
      assert.equal(await page.getByText(/^Nội dung sẽ lưu/).count(), 0);
      await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
      await page.getByText("L1 | Hẹn gọi lại lúc 3:33", { exact: true }).waitFor();
      assert.deepEqual(requests.at(-1).body, { content: "Hẹn gọi lại lúc 3:33" });

      await page.goto("http://127.0.0.1:5173/sale/leads");
      await page.getByText("Ứng viên kiểm thử", { exact: true }).click();
      const detailDialog = page.getByRole("dialog", { name: "Ứng viên kiểm thử" });
      await detailDialog.getByRole("button", { name: "L3", exact: true }).click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await detailDialog.count(), 1, "Canceling nested popup must keep the lead window open.");
      await detailDialog.getByRole("button", { name: "L3", exact: true }).click();
      await chooseNote(page, "Còn phân vân học phí");
      await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await detailDialog.count(), 1, "Saving nested popup must keep the lead window open.");
      await Promise.all([
        page.waitForResponse((response) => response.url().endsWith(`/leads/${leadId}/stage`) && response.request().method() === "PATCH"),
        detailDialog.getByRole("button", { name: "L1", exact: true }).click(),
      ]);
      await detailDialog.getByRole("button", { name: "Đóng", exact: true }).click();
      await detailDialog.waitFor({ state: "hidden" });

      await page.goto(`http://127.0.0.1:5173/sale/leads/${leadId}`);
      await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Lưu thay đổi", exact: true }) });
      const beforeFormChange = requests.length;
      await form.getByRole("button", { name: /^L3/ }).click();
      await chooseNote(page, "Còn phân vân học phí");
      await dialog.getByLabel("Nội dung ghi chú", { exact: true }).fill("Còn phân vân học phí, cần trao đổi với gia đình");
      await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests.length, beforeFormChange, "Editing form must only stage the choice until save.");
      assert.equal(await form.getByText(/^Ghi chú khi lưu:/).count(), 0);
      await Promise.all([
        page.waitForResponse((response) => response.url().endsWith(`/leads/${leadId}`) && response.request().method() === "PATCH"),
        form.getByRole("button", { name: "Lưu thay đổi", exact: true }).click(),
      ]);
      assert.equal(requests.at(-1).body.noteTemplateId, templateId);
      assert.equal(requests.at(-1).body.noteContent, "Còn phân vân học phí, cần trao đổi với gia đình");
      assert.equal(requests.at(-1).body.pipelineStageId, stage3);

      await page.goto("http://127.0.0.1:5173/sale/cau-hinh-truong");
      await page.getByRole("button", { name: "Cấu hình ghi chú theo trạng thái" }).click();
      const settings = page.getByRole("dialog", { name: "Ghi chú có sẵn theo tiến trình / Fail" });
      await settings.getByRole("button", { name: "Thêm mẫu ghi chú" }).click();
      const added = settings.getByLabel("Ghi chú 2", { exact: true });
      await added.fill("Nội dung mới");
      await settings.getByRole("button", { name: "Lưu cấu hình", exact: true }).click();
      await settings.getByText("Đã lưu cấu hình ghi chú.").waitFor();
      const save = requests.findLast((item) => item.endpoint.endsWith("note-templates/FAIL"));
      assert.equal(save.body.templates[1].content, "Nội dung mới");
      await page.screenshot({ path: path.join(screenshots, `settings-${viewport.width}.png`) });
      assert.equal(errors.length, 0, errors.join("\n"));
      console.log(`Browser checks passed at ${viewport.width}px: configure, cancel, keyboard focus, exact prefixes, optional choice, empty target, nested popup and full form.`);
      await context.close();
    }
    console.log(`Screenshots: ${screenshots}`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
