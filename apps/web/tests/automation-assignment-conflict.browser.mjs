import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-information-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/automation-assignment-conflict-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" ? "/tests/automation-assignment-conflict-smoke.html" : pathname}`);
    if (!file.startsWith(outDir)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  await wait("document.querySelector('[data-case]')");
  assert.ok(await evaluate("document.body.textContent.includes('Giữ Nguyễn Thị Thanh An. Yêu cầu gán cho Trần Văn Bình đã bị bỏ qua.')"));
  assert.ok(await evaluate("document.querySelector('section:nth-of-type(2)').textContent.includes('chưa chọn sale mới')"));
  assert.equal(await evaluate("document.querySelectorAll('section:nth-of-type(3) a').length"), 0);
  assert.ok(await evaluate("document.querySelector('section:nth-of-type(3)').textContent.includes('ngoài phạm vi xem')"));
  assert.ok(await evaluate("document.querySelector('section:nth-of-type(4)').textContent.includes('không có thay đổi')"));
  assert.ok(await evaluate("document.querySelector('section:nth-of-type(5)').textContent.includes('hết hiệu lực')"));
  assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), '/automations/rule-a/builder');
  await browser.key("Tab", "Tab");
  assert.equal(await evaluate("document.activeElement.tagName"), 'A');
  const artifacts = resolve('../../artifacts/automation-assignment-conflict');
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 375]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    await delay(150);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No overflow at '+width);
    const shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
    await writeFile(resolve(artifacts, 'component-'+width+'.png'), Buffer.from(shot.data, 'base64'));
  }
  console.log('PASS: Vietnamese conflict, pool skip, source link/scope, unchanged/stale results, keyboard and 1440/390/375px layout');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  // Only the generated test workspace is removed.
  if (!temp.startsWith(resolve(tmpdir(), "crm-information-smoke-"))) throw new Error("Unsafe test cleanup path");
  await rm(temp, { recursive: true, force: true });
}
