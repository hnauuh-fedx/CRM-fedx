import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const config = JSON.parse(process.env.INFO_ACCEPTANCE);
const temp = await mkdtemp(resolve(tmpdir(), "crm-info-live-browser-"));
let browser;
try {
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  const clickText = async (text) => {
    await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()===${JSON.stringify(text)})`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).setAttribute('data-live-target','true')`);
    await click('[data-live-target=true]');
    await evaluate("document.querySelector('[data-live-target=true]')?.removeAttribute('data-live-target')");
    await delay(250);
  };
  await command("Page.navigate", { url: `${config.baseUrl}/automations/${config.ruleId}/builder` });
  await wait("document.querySelector('input[type=email]')");
  await fill('input[type=email]', config.email);
  await fill('input[type=password]', config.password);
  await click('button[type=submit]');
  await wait("document.querySelector('.react-flow__node[data-id=info]')");
  await click('.react-flow__node[data-id=info]');
  await wait("document.querySelector('textarea')");
  await click('button[data-automation-field-picker]');
  await fill('input[aria-label="Tìm trường dữ liệu"]', "Người thân 2");
  await wait("document.querySelectorAll('[data-slot=popover-content] button').length===5");
  await fill('input[aria-label="Tìm trường dữ liệu"]', "Quy trình Telesale");
  await wait("Boolean(document.querySelector('[data-slot=popover-content] button[aria-disabled=true]'))");
  await browser.key("Escape", "Escape");
  await wait("!document.querySelector('[data-slot=popover-content]')");
  await delay(250);
  await fill('textarea', config.note);
  await clickText("Lưu thay đổi");
  await wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Lưu thay đổi' && e.disabled)");
  await command("Page.reload");
  await wait("document.querySelector('.react-flow__node[data-id=info]')");
  await click('.react-flow__node[data-id=info]');
  await wait(`document.querySelector('textarea')?.value===${JSON.stringify(config.note)}`);
  for (let run = 0; run < 2; run++) {
    await clickText("Chạy thử");
    await fill('input[aria-label="Tìm Lead theo tên, mã hoặc số điện thoại"]', config.leadName);
    await clickText("Tìm");
    await wait("!Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Tìm')?.disabled");
    await click('#automation-test-lead');
    await wait(`Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent.includes(${JSON.stringify(config.leadName)}))`);
    await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes(${JSON.stringify(config.leadName)})).setAttribute('data-live-lead','true')`);
    await click('[data-live-lead]');
    await delay(250);
    await clickText("Xác nhận chạy thử");
    await wait("document.querySelector('[role=dialog]')?.textContent.includes('Hoàn tất')");
    if (run === 1) assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Không có thay đổi')"));
    await clickText("Đóng");
  }
  const artifacts = resolve("../../artifacts/automation-information-update");
  await mkdir(artifacts, { recursive: true });
  const screenshot = await command("Page.captureScreenshot", { captureBeyondViewport: true });
  await writeFile(resolve(artifacts, "live-builder.png"), Buffer.from(screenshot.data, "base64"));
  console.log("PASS: full application login, real builder edit/save/reload, two UI-triggered Redis executions and visible no-change result.");
} finally {
  await browser?.close();
  if (!temp.startsWith(resolve(tmpdir(), "crm-info-live-browser-"))) throw new Error("Unsafe browser cleanup path");
  await rm(temp, { recursive: true, force: true });
}
