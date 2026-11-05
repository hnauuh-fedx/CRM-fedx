import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname, sep } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-assignment-report-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/assignment-report-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" ? "/tests/assignment-report-smoke.html" : pathname}`);
    if (!file.startsWith(outDir + sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(await readFile(file)); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click } = browser;
  const origin = `http://127.0.0.1:${server.address().port}`;
  await command("Page.navigate", { url: origin });
  await wait("document.body.textContent.includes('Nguyễn An')");
  assert.ok(await evaluate("document.body.textContent.includes('Dữ liệu được ghi nhận từ ngày')"));
  assert.ok(await evaluate("window.assignmentRequests.some(url=>url.includes('eventTypes=ASSIGNED'))"));
  await click("button[aria-label='Lượt giao của Nguyễn An: 45']");
  await wait("document.querySelector('[role=dialog]') && document.body.textContent.includes('Lead ngoài phạm vi truy cập')");
  assert.equal(await evaluate("document.querySelectorAll('[role=dialog] a').length"), 0);
  assert.ok(await evaluate("window.assignmentRequests.some(url=>url.includes('/events?')&&url.includes('assigneeIds=00000000-0000-4000-8000-000000000002'))"));
  await browser.key("Escape", "Escape");
  await wait("!document.querySelector('[role=dialog]')");
  await click("button[aria-controls$='-advanced']");
  await wait("document.body.textContent.includes('Automation / Quy tắc phân bổ')");
  // Native keyboard access opens a Radix select and selects the manual option.
  await click("button[id$='-method']");
  await wait("document.querySelector('[role=option][data-state]')");
  await evaluate("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='Thủ công').setAttribute('data-manual','true')");
  await click("[data-manual]");
  assert.ok(await evaluate("[...document.querySelectorAll('button')].some(e=>e.disabled && e.id && document.querySelector('label[for=\"'+e.id+'\"]')?.textContent==='Automation / Quy tắc phân bổ')"));
  await click("button[type=submit]");
  await wait("location.search.includes('assignment.method=MANUAL')");
  await wait("window.assignmentRequests.some(url=>url.includes('method=MANUAL'))");
  // Filters survive reload, and reset restores the current month.
  await command("Page.reload");
  await wait("document.body.textContent.includes('Nguyễn An')");
  assert.ok(await evaluate("location.search.includes('assignment.method=MANUAL')"));
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Đặt lại').setAttribute('data-reset','true')");
  await click("[data-reset]");
  await wait("location.search.includes('assignment.method=ALL')");
  const artifacts = resolve("../../artifacts/assignment-report"); await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 375]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    await command("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `No viewport overflow at ${width}px`);
    const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(resolve(artifacts, `report-${width}.png`), Buffer.from(image.data, "base64"));
  }
  await command("Page.navigate", { url: `${origin}/?mode=empty` });
  await wait("document.body.textContent.includes('Chưa có sự kiện phù hợp')");
  await command("Page.navigate", { url: `${origin}/?mode=error` });
  await wait("document.body.textContent.includes('Không thể tải báo cáo phân bổ lead')");
  await command("Page.navigate", { url: `${origin}/?mode=denied` });
  await wait("document.querySelector('[data-ready]')");
  assert.equal(await evaluate("window.assignmentRequests.length"), 0, "No report requests without report permission");
  console.log("PASS: dashboard report, detail masking, filter apply/reset/URL persistence, manual-rule dependency, empty/error/permission states and responsive widths 1440/390/375");
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (!temp.startsWith(resolve(tmpdir(), "crm-assignment-report-smoke-"))) throw new Error("Unexpected temporary directory.");
  await rm(temp, { recursive: true, force: true });
}
