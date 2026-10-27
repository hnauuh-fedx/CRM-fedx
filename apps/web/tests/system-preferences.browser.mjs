import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-preferences-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/system-preferences-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" ? "/tests/system-preferences-smoke.html" : pathname}`);
    if (!file.startsWith(outDir)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  await wait("document.querySelector('#preference-inboundDuplicate')");
  assert.ok(await evaluate("document.body.textContent.includes('Đang cấu hình: Chương trình A')"));
  assert.equal(await evaluate("window.preferenceSaves.length"), 0);
  const tab = async label => { const id = await evaluate(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent===${JSON.stringify(label)})?.id`); assert.ok(id); await click(`[id="${id}"]`); };
  await tab("Thông báo");
  await wait("document.querySelector('#preference-assignment')");
  await click("#preference-assignment");
  await wait("document.body.textContent.includes('Có thay đổi chưa lưu')");
  assert.ok(await evaluate("[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='Tiếp nhận dữ liệu').disabled"));
  await click('a[href="/other"]');
  await wait("document.querySelector('[role=alertdialog]')");
  await evaluate("[...document.querySelectorAll('[role=alertdialog] button')].find(e=>e.textContent==='Ở lại').click()");
  await wait("!document.querySelector('[role=alertdialog]')");
  await click('button[type="submit"]');
  await wait("window.preferenceSaves.length===1");
  assert.equal(await evaluate("window.preferenceSaves[0].value.assignment"), false);
  assert.ok(await evaluate("window.preferenceSaves[0].programId.endsWith('0001')"));
  await click("#preference-assignment");
  await evaluate("window.conflictNext=true");
  await click('button[type="submit"]');
  await wait("document.body.textContent.includes('Cấu hình đã được người khác thay đổi')");
  assert.equal(await evaluate("window.preferenceSaves.length"), 1);
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Hủy thay đổi').click()");
  await wait("!document.querySelector('#system-setting-search').disabled");
  await fill("#system-setting-search", "Excel");
  await wait("document.body.textContent.includes('Kết quả tìm kiếm')");
  await tab("Tiếp nhận dữ liệu");
  await wait("document.querySelector('#preference-inboundDuplicate')");
  await tab("Biểu mẫu & ghi chú");
  await wait("document.querySelector('#required-field-search')");
  await fill("#required-field-search", "Số điện thoại");
  assert.ok(await evaluate("document.querySelector('#required-phone').disabled"));
  await tab("Xuất dữ liệu");
  await wait("document.querySelector('#preference-columns-phone')");
  assert.equal(await evaluate("document.querySelector('#preference-columns-phone').getAttribute('data-state')"), "unchecked");
  const artifacts = resolve('../../artifacts/system-preferences'); await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 375]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No overflow at '+width);
    const shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
    await writeFile(resolve(artifacts, 'settings-'+width+'.png'), Buffer.from(shot.data, 'base64'));
  }
  await browser.key("Tab", "Tab");
  assert.notEqual(await evaluate("document.activeElement.tagName"), 'BODY');
  console.log('PASS: grouped settings, Vietnamese copy, defaults, save, conflict, leave guard, search, locked core fields, export controls, keyboard and 1440/390/375px layout');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (!temp.startsWith(resolve(tmpdir(), "crm-preferences-smoke-"))) throw new Error("Unsafe test cleanup path");
  await rm(temp, { recursive: true, force: true });
}
