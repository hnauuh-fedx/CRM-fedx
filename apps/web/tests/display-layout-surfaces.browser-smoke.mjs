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
  permissions: ["lead.view_assigned", "lead.create"],
  accessScope: "ASSIGNED_ONLY",
  departmentIds: [],
  institutionProgramIds: [programId],
};
const requests = [],
  unknown = [];
const json = (res, data) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
let browser, server;
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
      if (url.pathname.endsWith("/custom-fields"))
        return json(res, { fields: [] });
      if (url.pathname === "/api/display-layouts/effective") {
        const form = url.searchParams.get("screen") === "LEAD_FORM";
        const visibleFields = form
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
          baseTemplateId: form ? "form-1" : "detail-1",
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
