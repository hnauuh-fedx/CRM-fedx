import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-creation-history-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/lead-creation-history-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" || pathname.startsWith("/quan-ly/") ? "/tests/lead-creation-history-smoke.html" : pathname}`);
    if (!file.startsWith(outDir)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  await wait("document.querySelector('[role=tabpanel]')?.textContent.includes('Facebook tuyển sinh tháng 10')");
  const artifacts = resolve('../../artifacts/lead-webhook-link');
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 375]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    for (const tab of ['activities', 'changes']) {

      const index = tab === 'activities' ? 0 : 2;
      await evaluate(`document.querySelectorAll('[role=tab]')[${index}].click()`);
      await wait("document.querySelector('[role=tabpanel][data-state=active]')?.textContent.includes('Facebook tuyển sinh tháng 10')");
      await wait("document.querySelector('[role=tabpanel][data-state=active] a[aria-label=\"Mở webhook Facebook tuyển sinh tháng 10\"]')");
      assert.equal(await evaluate("document.querySelector('[role=tabpanel][data-state=active] a').getAttribute('href')"), '/quan-ly/tich-hop/webhooks?webhookId=12345678-abcd-1234-abcd-123456789012');
      const content = await evaluate("document.querySelector('[role=tabpanel][data-state=active]').textContent");
      assert.ok(content.includes('API đã đổ dữ liệu tạo lead qua webhook Facebook tuyển sinh tháng 10'));
      assert.ok(content.includes('Họ và tên: Nguyễn Văn An'));
      assert.ok(content.includes('Nguồn học viên: Facebook'));
      assert.ok(content.includes('Nhân viên phụ trách: Trần Thị Mai'));
      assert.ok(!content.includes('12345678-abcd') && !content.includes('(mã)'));
      assert.ok(content.includes('Số điện thoại: 0901234567'));
      assert.ok(!content.includes('Giám đốc'));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No overflow at '+width);
      const shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
      await writeFile(resolve(artifacts, `${tab}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  await evaluate("document.querySelector('[role=tabpanel][data-state=active] a').click()");
  await wait("document.body.textContent.includes('Webhook URL') && document.body.textContent.includes('Facebook tuyển sinh tháng 10')");
  assert.ok(await evaluate("[...document.querySelectorAll('input')].some(input => input.value.includes('/inbound-webhooks/fixture-key'))"));
  await command('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/quan-ly/tich-hop/webhooks?webhookId=12345678-abcd-1234-abcd-123456789012' });
  await wait("document.body.textContent.includes('Webhook URL')");
  await command('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/?mode=no-access' });
  await wait("document.querySelector('[role=tabpanel]')?.textContent.includes('Facebook tuyển sinh tháng 10')");
  assert.equal(await evaluate("document.querySelectorAll('[role=tabpanel] a').length"), 0);
  console.log('PASS: both real history tabs show API/webhook, initial data, no director attribution and no overflow at 1440/390/375px');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  // Only the generated test workspace is removed.
  if (!temp.startsWith(resolve(tmpdir(), "crm-creation-history-smoke-"))) throw new Error("Unsafe test cleanup path");
  await rm(temp, { recursive: true, force: true });
}

