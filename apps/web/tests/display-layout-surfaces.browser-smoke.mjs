import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";
const temp = await mkdtemp(resolve(tmpdir(), "crm-layout-surfaces-"));
const outDir = resolve(temp, "dist");
const programId = "00000000-0000-4000-8000-000000000001";
const user = {
  id: "fixture-user",
  fullName: "Sale kiểm thử",
  email: "fixture@example.test",
  roles: [],
  permissions: ["lead.view_assigned", "lead.create", "system.manage"],
  accessScope: "DEPARTMENT",
  departmentIds: ["fixture-department"],
  institutionProgramIds: [programId],
};
const requests = [],
  unknown = [];
const json = (res, data) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
let browser, server;
let popupApplied = false;
let popupTemplate = {
  id: "popup-unassigned", screen: "LEAD_POPUP", revision: 1, publishedVersion: 3,
  managementDepartmentId: "fixture-department",
  draft: { name: "Popup fixture", visibleFields: ["phone", "fullName", "note", "sourceId", "institutionProgramId"], targets: [] },
  published: null,
};
try {
  await build({
    root: process.cwd(),
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: {
        input: resolve("tests/display-layout-surfaces-smoke.html"),
      },
    },
  });
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      requests.push({
        path: url.pathname,
        screen: url.searchParams.get("screen"),
        program: req.headers["x-institution-program-id"],
      });
      if (url.pathname === "/api/auth/refresh")
        return json(res, {
          accessToken: "fixture-access",
          expiresIn: 900,
          user,
        });
      if (url.pathname === "/api/auth/me") return json(res, { user });
      if (url.pathname === "/api/institution-programs/options")
        return json(res, {
          data: [
            {
              id: programId,
              name: "Chương trình mẫu",
              institutionName: "Trường mẫu",
            },
          ],
        });
      if (url.pathname === "/api/display-layouts/targets")
        return json(res, { data: url.searchParams.get("type") === "DEPARTMENT" ? [{ id: "fixture-department", name: "Fixture department" }] : [], totalPages: 1 });
      if (url.pathname === "/api/display-layouts/popup-unassigned/draft") {
        let body = ''; for await (const chunk of req) body += chunk;
        popupTemplate = { ...popupTemplate, draft: JSON.parse(body).draft, revision: popupTemplate.revision + 1 };
        return json(res, popupTemplate);
      }
      if (url.pathname === "/api/display-layouts/popup-unassigned/preview")
        return json(res, { users: 1, departments: 1, overriddenUsers: 0, replacedAssignments: 0, assignmentRevision: 10, replacedTemplates: [] });
      if (url.pathname === "/api/display-layouts/popup-unassigned/publish") {
        assert.ok(popupTemplate.draft.targets.length, 'A popup must have an audience before Apply.');
        popupApplied = true;
        popupTemplate = { ...popupTemplate, revision: popupTemplate.revision + 1, publishedVersion: popupTemplate.publishedVersion + 1, published: popupTemplate.draft };
        return json(res, popupTemplate);
      }
      if (url.pathname === "/api/display-layouts/popup-unassigned")
        return json(res, { ...popupTemplate, assignments: popupApplied ? popupTemplate.draft.targets : [], targetLabels: {}, versions: [], versionPage: 1, versionPages: 1 });
      if (url.pathname === "/api/display-layouts")
        return json(res, { data: url.searchParams.get('screen') === 'LEAD_POPUP' ? [popupTemplate] : [], page: 1, totalPages: 1, total: 0, fields: [] });
      if (url.pathname.endsWith("/custom-fields"))
        return json(res, { fields: [] });
      if (url.pathname === "/api/display-layouts/effective") {
        const form = url.searchParams.get("screen") === "LEAD_FORM";
        const popup = url.searchParams.get("screen") === "LEAD_POPUP";
        const visibleFields = popup ? (popupApplied ? popupTemplate.published.visibleFields : ["phone", "fullName", "note", "sourceId", "institutionProgramId"]) : form
          ? [
              "sourceId",
              "fullName",
              "phone",
              "institutionProgramId",
              "assigneeId",
            ]
          : ["sourceId", "fullName", "majorId"];
        return json(res, {
          visibleFields,
          name: form ? "Mẫu biểu mẫu" : "Mẫu chi tiết",
          source: "DEFAULT",
          baseTemplateId: popup ? "popup-1" : form ? "form-1" : "detail-1",
          baseVersion: 1,
        });
      }
      unknown.push(url.pathname);
      res.writeHead(404);
      res.end("{}");
      return;
    }
    const file = resolve(outDir, `.${url.pathname}`);
    if (!file.startsWith(outDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(file)
      ] ?? "application/octet-stream",
    );
    createReadStream(file)
      .on("error", () => {
        res.statusCode = 404;
        res.end();
      })
      .pipe(res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.fetch=((original)=>(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return original(url.pathname.startsWith('/api/')?location.origin+url.pathname+url.search:input,init)})(window.fetch.bind(window));`,
  });
  await browser.command("Page.navigate", {
    url: `http://127.0.0.1:${server.address().port}/tests/display-layout-surfaces-smoke.html`,
  });
  await browser.wait(
    "document.querySelector('[data-testid=\"configured-lead-form\"]') && document.querySelector('[data-testid=\"configured-lead-detail\"]')",
  );
  const keys = (kind) =>
    browser.evaluate(
      `Array.from(document.querySelectorAll('[data-testid="configured-lead-${kind}"] [data-layout-field]')).map(e=>e.dataset.layoutField)`,
    );
  await browser.click('[data-testid="edit-list-display-layout"]');
  await browser.wait('document.querySelector("[data-testid=list-layout-popup]")');
  await browser.wait('!document.querySelector("[data-testid=list-layout-popup] [data-slot=skeleton]")');
  assert.ok(requests.some((item) => item.path === '/api/display-layouts' && item.screen === 'LEAD_DETAIL'));
  await browser.evaluate('document.querySelector("[data-testid=list-layout-popup] button[aria-label]").click()');
  await browser.wait('!document.querySelector("[data-testid=list-layout-popup]")');
  assert.deepEqual(await keys("detail"), ["sourceId", "fullName", "majorId"]);
  assert.deepEqual(await keys("form"), [
    "sourceId",
    "fullName",
    "phone",
    "institutionProgramId",
    "majorId",
  ]);
  assert.equal(
    await browser.evaluate(
      "document.querySelector('[data-testid=\"configured-lead-detail\"]').textContent.includes('Nguồn mẫu')",
    ),
    true,
  );
  assert.equal(
    await browser.evaluate(
      "Boolean(document.querySelector('#configured-lead-note'))",
    ),
    false,
  );
  await browser.evaluate(
    "document.querySelector('form button[type=submit]').click()",
  );
  await browser.wait(
    "document.querySelector('#configured-lead-email[aria-invalid=true]')",
  );
  await browser.wait("document.activeElement.id==='configured-lead-email'");
  assert.equal(
    await browser.evaluate("document.querySelector('#submitted').textContent"),
    "",
  );
  await browser.fill("#configured-lead-email", "valid@example.test");
  assert.equal(await browser.evaluate("document.activeElement.id"), "configured-lead-email", "Correcting an error must keep the revealed field mounted and focused.");
  await browser.evaluate(
    "document.querySelector('form button[type=submit]').click()",
  );
  await browser.wait(
    "document.querySelector('#submitted').textContent.includes('valid@example.test')",
  );
  const saved = JSON.parse(
    await browser.evaluate("document.querySelector('#submitted').textContent"),
  );
  assert.equal(saved.note, "Giá trị ẩn cần giữ");
  assert.equal(saved.assigneeId, "");
  assert.equal(saved.majorId, "major-1");
  await browser.click("#create-mode");
  await browser.wait(
    "document.querySelector('#configured-lead-fullName').value===''",
  );
  await browser.fill("#configured-lead-fullName", "Ứng viên mới");
  await browser.fill("#configured-lead-phone", "0909999888");
  await browser.evaluate(
    "document.querySelector('form button[type=submit]').click()",
  );
  await browser.wait(
    "document.querySelector('#submitted').textContent.includes('Ứng viên mới')",
  );
  // The detail popup uses the same configured editor and validates all missing
  // fields on the first save, including dynamically required fields.
  await browser.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Chỉnh sửa thông tin').click()");
  await browser.wait("document.querySelectorAll('form').length===2");
  await browser.fill("#configured-lead-fullName", "");
  await browser.fill("#configured-lead-phone", "");
  await browser.evaluate(`for (const key of ['sourceId', 'majorId']) {
    const control = document.querySelector('#configured-lead-' + key);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(control, ''); control.dispatchEvent(new Event('change', { bubbles: true }));
  }`);
  await browser.evaluate("document.querySelector('form button[type=submit]').click()");
  await browser.wait("document.querySelectorAll('form')[0].querySelectorAll('[aria-invalid=true]').length>=4");
  for (const key of ['fullName', 'phone', 'sourceId', 'majorId']) {
    assert.equal(await browser.evaluate(`document.querySelector('#configured-lead-${key}').getAttribute('aria-invalid')`), 'true');
    assert.ok(await browser.evaluate(`document.querySelector('form [data-layout-field="${key}"] label').textContent.includes('*')`));
  }
  await browser.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Hủy chỉnh sửa').click()");
  assert.ok(requests.some((item) => item.screen === "LEAD_DETAIL"));
  assert.ok(
    requests.some(
      (item) => item.screen === "LEAD_FORM" && item.program === programId,
    ),
  );
  assert.deepEqual(unknown, []);
  const artifacts = resolve("../../artifacts/display-layout");
  await mkdir(artifacts, { recursive: true });
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await browser.evaluate(
    "document.querySelector('#submitted').hidden=true;window.scrollTo(0,0)",
  );
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await writeFile(
    resolve(artifacts, "phase3-desktop.png"),
    Buffer.from(
      (
        await browser.command("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(
    await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),
  );
  await writeFile(
    resolve(artifacts, "phase3-mobile.png"),
    Buffer.from(
      (
        await browser.command("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await browser.click('#popup-mode');
  await browser.wait('document.querySelector("[data-testid=lead-popup-header-actions]") && document.querySelector("[data-testid=configured-lead-detail]")');
  assert.deepEqual(await keys('detail'), ['phone', 'fullName', 'note', 'sourceId', 'institutionProgramId']);
  assert.equal(await browser.evaluate('document.querySelectorAll("[data-testid=edit-list-display-layout]").length'), 1);
  assert.ok(await browser.evaluate('Boolean(document.querySelector("[data-testid=lead-popup-header-actions] [data-testid=edit-list-display-layout]"))'));
  assert.equal(await browser.evaluate('document.querySelector("[data-testid=lead-popup-header-actions] a").getAttribute("href")'), '/sale/leads/lead-1');
  for (const [name, width, height] of [['popup-mobile', 390, 844], ['popup-desktop', 1440, 1000]]) {
    await browser.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await writeFile(resolve(artifacts, name + '.png'), Buffer.from((await browser.command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  await browser.click('[data-testid=edit-list-display-layout]');
  await browser.wait('document.querySelector("[data-testid=list-layout-popup]") && !document.querySelector("[data-testid=list-layout-popup] [data-slot=skeleton]")');
  assert.ok(requests.some(item => item.path === '/api/display-layouts' && item.screen === 'LEAD_POPUP'));
  await browser.evaluate("Array.from(document.querySelectorAll('[data-testid=list-layout-popup] button')).find(e=>e.textContent.includes('Popup fixture')).click()");
  await browser.wait('document.querySelector("#display-layout-name")');
  await browser.wait('document.querySelector("#target-DEPARTMENT-fixture-department")');
  assert.equal(await browser.evaluate('document.querySelector("#target-DEPARTMENT-fixture-department").getAttribute("data-state")'), 'checked');
  await browser.evaluate("Array.from(document.querySelectorAll('[data-field-key=note] button')).find(e=>e.textContent.trim()==='\u1ea8n').click()");
  await browser.evaluate("Array.from(document.querySelectorAll('[data-testid=layout-save-bar] button')).find(e=>e.textContent.trim()==='L\u01b0u nh\u00e1p').click()");
  await browser.wait("Array.from(document.querySelectorAll('[data-testid=layout-save-bar] button')).some(e=>e.textContent.trim()==='Xem tr\u01b0\u1edbc v\u00e0 \u00e1p d\u1ee5ng' && !e.disabled)");
  await browser.evaluate("Array.from(document.querySelectorAll('[data-testid=layout-save-bar] button')).find(e=>e.textContent.trim()==='Xem tr\u01b0\u1edbc v\u00e0 \u00e1p d\u1ee5ng').click()");
  await browser.wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='\u00c1p d\u1ee5ng' && !e.disabled)");
  await browser.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='\u00c1p d\u1ee5ng').setAttribute('data-testid', 'confirm-popup-apply')");
  await browser.click('[data-testid=confirm-popup-apply]');
  await browser.wait('!document.querySelector("[data-testid=configured-lead-detail] [data-layout-field=note]")');
  assert.equal(popupApplied, true);
  assert.deepEqual(popupTemplate.draft.targets, [{ type: 'DEPARTMENT', id: 'fixture-department' }]);

  await browser.evaluate('document.querySelector("[data-testid=list-layout-popup] button[aria-label]").click()');
  await browser.wait('!document.querySelector("[data-testid=list-layout-popup]")');
  await browser.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Ch\u1ec9nh s\u1eeda th\u00f4ng tin').click()");
  await browser.wait('document.querySelector("[data-testid=configured-lead-form]")');
  const popupFormKeys = await keys('form');
  assert.ok(!popupFormKeys.includes('note'));
  assert.ok(!popupFormKeys.includes('pipelineStageId'));
  assert.ok(!popupFormKeys.includes('email'));
  assert.equal(await browser.evaluate('document.querySelectorAll("[data-testid=edit-list-display-layout]").length'), 1);
  assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'));
  console.log(
    "PASS surfaces browser: detail/form order, hidden fields preserved, required fields, assignment permission, hidden invalid field revealed and focused, create/edit, program scope, mobile",
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(temp, { recursive: true, force: true });
}
