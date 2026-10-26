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
  await build({ root: process.cwd(), logLevel: "error", build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve("tests/automation-information-smoke.html") } } });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(outDir, `.${pathname === "/" ? "/tests/automation-information-smoke.html" : pathname}`);
    if (!file.startsWith(outDir)) { response.writeHead(403); response.end(); return; }
    try { const body = await readFile(file); response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] ?? "application/octet-stream"); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  await wait("document.querySelector('[data-updates]')");
  const output = () => evaluate("JSON.parse(document.querySelector('[data-updates]').textContent)");
  const pick = async (label, index) => {
    await delay(250);
    await click(`button[data-automation-field-picker]:nth-of-type(1)`);
    await fill('input[aria-label="Tìm trường dữ liệu"]', label);
    await wait(`Array.from(document.querySelectorAll('[data-slot=popover-content] [role=option]')).some(e=>e.textContent.includes(${JSON.stringify(label)}))`);
    await evaluate(`Array.from(document.querySelectorAll('[data-slot=popover-content] [role=option]')).find(e=>e.textContent.includes(${JSON.stringify(label)})).setAttribute('data-choice','target')`);
    await click('[data-choice=target]');
    await wait("!document.querySelector('[data-slot=popover-content]')");
    await delay(250);
    assert.equal((await output())[index].field !== "", true);
  };
  await pick("Họ và tên", 0);
  await fill('fieldset input:not([type=hidden])', "Nguyễn Văn An");
  assert.equal((await output())[0].value, "Nguyễn Văn An");
  await click('button[data-automation-field-picker]');
  await fill('input[aria-label="Tìm trường dữ liệu"]', "Quy trình Telesale");
  await wait("Boolean(document.querySelector('[data-slot=popover-content] [role=option][aria-disabled=true]'))");
  await click('[data-slot=popover-content] [role=option][aria-disabled=true]');
  assert.equal((await output())[0].field, "system:fullName");
  assert.ok(await evaluate("document.body.textContent.includes('Dùng node Cập nhật Pipeline')"));
  await browser.key("Escape", "Escape");
  await wait("!document.querySelector('[data-slot=popover-content]')");
  await delay(250);
  // A required field cannot be cleared.
  await click('[data-slot=select-trigger]');
  await wait("document.querySelector('[role=option][data-disabled]')");
  assert.ok((await evaluate("document.querySelector('[role=option][data-disabled]').textContent")).includes("Xóa giá trị"));
  await browser.key("Escape", "Escape");
  await wait("!document.querySelector('[role=listbox]')");
  await delay(250);
  // Changing fields drops the previous typed value.
  await pick("Điểm", 0);
  assert.equal((await output())[0].value, undefined);
  await fill('input[type=number]', "0");
  assert.equal((await output())[0].value, 0);
  // Add a row; selected fields must not appear again in its picker.
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('Thêm trường cập nhật')).setAttribute('data-add','true')");
  await click('[data-add]');
  await evaluate("document.querySelectorAll('button[data-automation-field-picker]')[1].setAttribute('data-picker','second')");
  await click('[data-picker=second]');
  await delay(250);
  await fill('input[aria-label="Tìm trường dữ liệu"]', "Điểm");
  await wait("document.body.textContent.includes('Không tìm thấy trường phù hợp')");
  await fill('input[aria-label="Tìm trường dữ liệu"]', "Đồng ý");
  await wait("Array.from(document.querySelectorAll('[data-slot=popover-content] [role=option]')).some(e=>e.textContent.includes('Đồng ý'))");
  await evaluate("Array.from(document.querySelectorAll('[data-slot=popover-content] [role=option]')).find(e=>e.textContent.includes('Đồng ý')).setAttribute('data-choice','target')");
  await click('[data-choice=target]');
  await wait("!document.querySelector('[data-slot=popover-content]')");
  await delay(250);
  await evaluate("document.querySelectorAll('[data-slot=select-trigger]')[2].setAttribute('data-value','boolean')");
  await click('[data-value=boolean]');
  await wait("Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent==='Không')");
  await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent==='Không').setAttribute('data-no','true')");
  await click('[data-no]');
  assert.equal((await output())[1].value, false);
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Lưu cấu hình kiểm thử').setAttribute('data-save','true')");
  await click('[data-save]');
  await command("Page.reload");
  await wait("document.querySelectorAll('button[data-automation-field-picker]').length===2");
  assert.equal((await output())[0].value, 0);
  assert.equal((await output())[1].value, false);
  // Delete a preceding row; retained controls still describe their own value.
  await click('button[aria-label="Xóa dòng cập nhật 1"]');
  assert.equal((await output())[0].value, false);
  await pick("Quan tâm", 0);
  await click('button[role=checkbox]');
  assert.deepEqual((await output())[0].value, ["a"]);
  assert.ok(await evaluate("document.body.textContent.includes('Thay thế toàn bộ danh sách')"));
  await click('[data-slot=select-trigger]');
  await wait("Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent==='Xóa giá trị')");
  await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent==='Xóa giá trị').setAttribute('data-clear','true')");
  await click('[data-clear]');
  await delay(250);
  assert.equal((await output())[0].operation, "clear");
  assert.equal((await output())[0].value, undefined);
  assert.ok(await evaluate("!document.querySelector('button[role=checkbox]')"));
  await pick("Ngày sinh", 0);
  assert.equal((await output())[0].operation, "set");
  assert.ok(await evaluate("Boolean(document.querySelector('input[type=date]'))"));
  await pick("Ghi chú", 0);
  await fill('textarea', "Ghi chú cập nhật từ Automation");
  await wait("document.querySelector('textarea').getAttribute('aria-invalid') === 'false' && !document.querySelector('[role=alert]')");
  await pick("Nhãn phân loại", 0);
  await fill('textarea', "Nhãn A\nNhãn B");
  assert.deepEqual((await output())[0].value, ["Nhãn A", "Nhãn B"]);
  await pick("Tệp đính kèm", 0);
  await fill('textarea', "https://example.test/document.pdf");
  assert.equal((await output())[0].value[0].url, "https://example.test/document.pdf");
  await wait("!document.querySelector('[role=alert]')");
  await pick("Ngày giờ", 0);
  assert.ok(await evaluate("Boolean(document.querySelector('input[type=datetime-local]'))"));
  await evaluate("{const el=document.querySelector('input[type=datetime-local]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-21T10:30');el.dispatchEvent(new Event('input',{bubbles:true}));}");
  await wait("JSON.parse(document.querySelector('[data-updates]').textContent)[0].value?.includes('T')");
  assert.equal(Number.isNaN(Date.parse((await output())[0].value)), false);
  await pick("Tỉnh tùy chỉnh", 0);
  await evaluate("document.querySelectorAll('[data-slot=select-trigger]')[1].setAttribute('data-province','true')");
  await click('[data-province]');
  await wait("Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent==='Đà Nẵng')");
  await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent==='Đà Nẵng').setAttribute('data-province-choice','true')");
  await click('[data-province-choice]');
  assert.equal((await output())[0].value, "da_nang");
  for (const width of [1440, 390, 375]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `No horizontal overflow at ${width}px`);
  }
  await browser.key("Tab", "Tab");
  assert.ok(await evaluate("document.activeElement !== document.body"), "Keyboard focus reaches controls");
  const artifacts = resolve("../../artifacts/automation-information-update");
  await mkdir(artifacts, { recursive: true });
  await delay(250);
  const screenshot = await command("Page.captureScreenshot", { captureBeyondViewport: true });
  await writeFile(resolve(artifacts, "mobile.png"), Buffer.from(screenshot.data, "base64"));
  console.log("PASS: real editor build, searchable fields, required clear restriction, field reset, numeric zero, boolean false, multi-select replacement, clear, date input, duplicate prevention, save/reopen, row removal, keyboard and desktop/mobile overflow.");
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  // Only the generated test workspace is removed.
  if (!temp.startsWith(resolve(tmpdir(), "crm-information-smoke-"))) throw new Error("Unsafe test cleanup path");
  await rm(temp, { recursive: true, force: true });
}
