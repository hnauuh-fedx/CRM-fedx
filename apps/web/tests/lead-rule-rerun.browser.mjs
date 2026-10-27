import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-rule-rerun-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/lead-rule-rerun-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" ? "/tests/lead-rule-rerun-smoke.html" : pathname}`);
    if (!file.startsWith(outDir)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click } = browser;
  const press = async (label) => {
    await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).setAttribute('data-press','true')`);
    await click('[data-press=true]');
    await evaluate("document.querySelector('[data-press=true]')?.removeAttribute('data-press')");
  };
  for (const scenario of ["selected", "filtered", "all"]) {
    await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/tests/lead-rule-rerun-smoke.html?scenario=${scenario}` });
    await wait("document.querySelector('#rerun-rule')");
    assert.ok(await evaluate(`document.body.textContent.includes(${JSON.stringify(scenario === "filtered" ? "Theo bộ lọc hiện tại (63)" : "Theo bộ lọc hiện tại (2.620)")})`));
    if (scenario === "all") assert.ok(await evaluate("document.body.textContent.includes('Không có bộ lọc: lấy toàn bộ danh sách')"));
    if (scenario !== "selected") assert.ok(await evaluate("Array.from(document.querySelectorAll('[data-slot=toggle-group-item]')).find(e=>e.textContent.includes('Đang chọn')).disabled"));
    await click('#rerun-rule');
    await wait("document.querySelector('[role=option]')");
    await click('[role=option]');
    await wait("!document.querySelector('[role=listbox]')");
    await press("Xem trước");
    await wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Xác nhận chạy lại')");
    const preview = await evaluate("window.mockRequests.find(r=>r.url.includes('bulk-preview')).body");
    assert.equal(preview.target, scenario === "selected" ? "selected" : "filtered");
    if (scenario === "selected") assert.equal(preview.leadIds.length, 2);
    else { assert.equal(preview.filters.search, scenario === "filtered" ? "Match" : ""); assert.equal(preview.filters.audience, "all"); assert.equal(preview.filters.page, undefined); }
    for (const width of [1440, 375]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
      assert.ok(await evaluate("document.querySelector('[role=dialog]').scrollWidth<=document.querySelector('[role=dialog]').clientWidth+1"));
    }
    await press("Xác nhận chạy lại");
    await wait("window.mockRequests.some(r=>r.url.endsWith('bulk-run'))");
    const run = await evaluate("window.mockRequests.find(r=>r.url.endsWith('bulk-run'))");
    assert.deepEqual(run.body, preview);
    assert.match(run.requestId, /^[a-f0-9-]{36}$/);
    await wait("document.body.textContent.includes('Xem lịch sử chạy rule')");
  }
  console.log("PASS: selection/filter/all targets, rule selection, preview/confirmation, identical payload, request key, progress and 1440/375px layout");
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  if (!temp.startsWith(resolve(tmpdir(), "crm-rule-rerun-smoke-"))) throw new Error("Unsafe test cleanup path");
  await rm(temp, { recursive: true, force: true });
}
