import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const root = process.cwd(), formId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", programA = "11111111-1111-4111-8111-111111111111";
const authOnly = process.argv.includes("--auth-only");
const surveyOnly = process.argv.includes("--survey-only");
const confirmationOnly = process.argv.includes("--confirmation-only");
const focusOnly = process.argv.includes("--focus-only");
const initial = JSON.parse(await readFile(resolve(root, "tests/marketing-form-g4-fixture.json"), "utf8"));
let input, controls, saveCalls, submissions, mutations;
function reset() { input = structuredClone(initial); controls = { failSave: false, saveDelay: 0, failSubmit: true, failAuth: false }; saveCalls = []; submissions = []; mutations = []; }
reset();
const temporary = await mkdtemp(resolve(tmpdir(), "crm-g4-browser-")), outDir = resolve(temporary, "dist");
let server, browser;
const body = async request => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || "{}"); };
const json = (response, data, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(data)); };
const options = { campaigns: [], templates: [], sources: [], leadFields: [], fieldTypes: ["text", "radio", "rating"], formTypes: ["survey"], statuses: ["published"] };
const fixtureUser = { id: "fixture", email: "fixture@example.test", fullName: "Fixture", avatarUrl: null, roles: [], permissions: ["marketing_form.manage", "campaign.view_all"], accessScope: "ALL", departmentIds: [], institutionProgramIds: [programA, "22222222-2222-4222-8222-222222222222"] };
try {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/fixture/reset") { reset(); return json(response, { ok: true }); }
      if (url.pathname === "/api/fixture/control") { Object.assign(controls, await body(request)); return json(response, { ok: true }); }
      if (url.pathname === "/api/fixture/state") return json(response, { input, saveCalls, submissions, mutations });
      if (url.pathname === "/api/auth/me") return json(response, { user: fixtureUser });
      if (["/api/auth/refresh", "/api/auth/login"].includes(url.pathname)) {
        if (url.pathname === "/api/auth/login") { await body(request); controls.failAuth = false; }
        if (controls.failAuth) return json(response, { message: "Phiên fixture đã kết thúc." }, 401);
        return json(response, { accessToken: "fixture-only", expiresIn: 900, user: fixtureUser, sessionId: "fixture", rememberDevice: true });
      }
      if (url.pathname === "/api/institution-programs/options") return json(response, { data: [{ id: programA, name: "Chương trình A", code: "A", institutionName: "Fixture" }, { id: "22222222-2222-4222-8222-222222222222", name: "Chương trình B", code: "B", institutionName: "Fixture" }] });
      if (url.pathname === "/api/forms/options") return json(response, options);
      if (url.pathname === `/api/forms/${formId}`) {
        if (request.method === "PUT") {
          if (controls.failAuth) { await body(request); return json(response, { message: "Phiên fixture đã kết thúc." }, 401); }
          const saved = await body(request); saveCalls.push(saved); mutations.push(url.pathname);
          await delay(controls.saveDelay);
          if (controls.failSave) return json(response, { message: "Lỗi lưu fixture" }, 503);
          input = saved; return json(response, { id: formId });
        }
        return json(response, { ...input, id: formId, institutionProgramId: programA, campaign: null, source: null, template: null, creator: null, createdAt: "2026-10-14T00:00:00Z", slug: null, publicKey: "g4-fixture", publicPath: "/fixture-public", submissionCount: 0 });
      }
      if (url.pathname === "/api/fixture/public") return json(response, { ...input, id: formId, campaign: null });
      if (url.pathname === "/api/fixture/submit") {
        submissions.push(await body(request));
        if (controls.failSubmit) { controls.failSubmit = false; return json(response, { message: "Lỗi mạng fixture" }, 504); }
        return json(response, { submissionId: "fixture", status: "processed" });
      }
      if (url.pathname.startsWith("/api/custom-fields/runtime/")) {
        if (request.method === "PATCH") { await body(request); return json(response, { message: "Fixture" }); }
        return json(response, { fields: [] });
      }
      if (url.pathname.endsWith("/submissions")) return json(response, { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
      return json(response, { message: `Unknown fixture API ${url.pathname}` }, 404);
    }
    const path = url.pathname.startsWith("/assets/") ? resolve(outDir, "." + url.pathname) : resolve(outDir, "tests/marketing-form-g4-smoke.html");
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(path)] ?? "application/octet-stream");
    createReadStream(path).on("error", () => response.writeHead(404).end()).pipe(response);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previousApi = process.env.VITE_API_URL, previousPublic = process.env.VITE_PUBLIC_WEB_URL;
  process.env.VITE_API_URL = `${origin}/api`; process.env.VITE_PUBLIC_WEB_URL = origin;
  try { await build({ root, logLevel: "warn", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tests/marketing-form-g4-smoke.html") } } }); }
  finally { if (previousApi === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previousApi; if (previousPublic === undefined) delete process.env.VITE_PUBLIC_WEB_URL; else process.env.VITE_PUBLIC_WEB_URL = previousPublic; }
  browser = await openSmokeBrowser(resolve(temporary, "profile"));
  const { command, evaluate, wait, click, fill, key, drag } = browser;
  const state = () => fetch(`${origin}/api/fixture/state`).then(r => r.json());
  const control = data => fetch(`${origin}/api/fixture/control`, { method: "POST", body: JSON.stringify(data) });
  const button = async (text, scope = "document") => {
    await evaluate(`(()=>{const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.closest('[data-state="closed"]'));if(!b)throw new Error('Missing button '+${JSON.stringify(text)});b.setAttribute('data-qa-click','target')})()`);
    await click('[data-qa-click="target"]'); await evaluate(`document.querySelector('[data-qa-click="target"]')?.removeAttribute('data-qa-click')`);
  };
  const navigate = async path => { await command("Page.navigate", { url: origin + path }); };
  const builderPath = `/marketing/form-survey/${formId}`;
  for (const width of [375, 768, 1440]) {
    await fetch(`${origin}/api/fixture/reset`);
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    if (surveyOnly || confirmationOnly || focusOnly) {
      await navigate("/fixture-public"); await wait(`document.querySelector('input[name="gate"]')`);
      if (focusOnly) await latePageFocusRepro(); else await surveyRepro(confirmationOnly);
      console.log(`PASS minimal survey ${focusOnly ? "late-focus" : confirmationOnly ? "confirmation" : "visibility"} ${width}px`);
      continue;
    }
    await navigate(builderPath);
    await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 1"]')`);
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Builder không tràn ngang.");
    await click("#fixture-public"); await wait(`document.querySelector('input[name="gate"]')`);
    await click("#fixture-builder"); await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 1"]')`);
    await click('[aria-label="Cấu hình câu hỏi 1"]');
    const beforeInvalid = (await state()).saveCalls.length;
    await fill("#marketing-field-label-0", ""); await button("Lưu cấu hình");
    await wait(`document.activeElement.id==='marketing-field-label-0' && document.querySelector('#marketing-field-label-0').getAttribute('aria-invalid')==='true'`);
    assert.equal((await state()).saveCalls.length, beforeInvalid, "Zod chặn cấu hình sai trước API và focus lỗi đầu tiên.");
    await fill("#marketing-field-label-0", "Câu hỏi G4 đã chỉnh");
    await control({ failAuth: true }); await button("Lưu cấu hình");
    await wait(`document.querySelector('#reauth-password')`);
    await fill("#reauth-password", "fixture-password"); await click('[role="dialog"] button[type="submit"]');
    await wait(`!document.querySelector('#reauth-password')`);
    assert.equal(await evaluate(`document.querySelector('#marketing-field-label-0').value`), "Câu hỏi G4 đã chỉnh", "Đăng nhập lại giữ nội dung builder thật và hộp chỉnh sửa đang mở.");
    assert.equal((await state()).saveCalls.length, beforeInvalid, "Không tự gửi lại thao tác lưu sau đăng nhập lại.");
    if (authOnly) {
      // Explicit cleanup after the preservation assertions avoids a beforeunload
      // prompt when navigating to the next viewport's fixture.
      await button("Lưu cấu hình");
      await wait(`document.body.textContent.includes('Đã lưu cấu hình Form & Survey thành công.')`);
      await delay(200);
      console.log(`PASS builder reauthentication ${width}px: unsaved question/editor preserved, no automatic write replay.`);
      continue;
    }
    await click('a[href="/tong-quan"]');
    await wait(`document.querySelector('[role="alertdialog"]')`);
    assert.equal(await evaluate("document.activeElement.textContent.trim()"), "Ở lại");
    await key("Escape", "Escape", 0, 27);
    await wait(`!document.querySelector('[role="alertdialog"]')`);
    assert.equal(await evaluate("location.pathname"), builderPath);
    assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), "/tong-quan");
    await evaluate("history.back()"); await wait(`document.querySelector('[role="alertdialog"]')`);
    await button("Ở lại"); await wait(`!document.querySelector('[role="alertdialog"]')`);
    assert.equal(await evaluate("location.pathname"), builderPath);
    await evaluate("history.back()"); await wait(`document.querySelector('[role="alertdialog"]')`);
    await button("Bỏ thay đổi và tiếp tục"); await wait(`location.pathname==='/fixture-public'`);
    await evaluate("history.forward()"); await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 1"]')`);
    await click('[aria-label="Cấu hình câu hỏi 1"]'); await fill("#marketing-field-label-0", "Câu hỏi G4 đã chỉnh");
    await click("#fixture-program"); await wait(`document.querySelector('[role="alertdialog"]')`);
    await button("Ở lại");
    await wait(`!document.querySelector('[role="alertdialog"]')`);
    assert.equal(await evaluate(`localStorage.getItem('admission-crm.selected-institution-program-id')`), programA);
    await click("#fixture-program"); await wait(`document.querySelector('[role="alertdialog"]')`);
    await button("Bỏ thay đổi và tiếp tục");
    await wait(`document.querySelector('#fixture-list')`);
    assert.equal(await evaluate(`document.querySelector('#fixture-scope').textContent`), "22222222-2222-4222-8222-222222222222");
    await navigate(builderPath); await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 1"]')`);
    await click('[aria-label="Cấu hình câu hỏi 1"]'); await fill("#marketing-field-label-0", "Lưu fixture G4");
    await control({ failSave: true }); await button("Lưu cấu hình");
    await wait(`document.body.textContent.includes('Lỗi lưu fixture')`);
    await control({ failSave: false, saveDelay: 1600 }); await button("Lưu cấu hình");
    await wait(`document.body.textContent.includes('Đang lưu...')`);
    await fill("#marketing-field-label-0", "Sửa thêm trong lúc lưu");
    await click('a[href="/tong-quan"]'); await wait(`document.querySelector('[role="alertdialog"]')`);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(b=>b.textContent==='Bỏ thay đổi và tiếp tục').disabled`));
    await wait(`!document.body.textContent.includes('Đang lưu cấu hình')`);
    await button("Ở lại");
    await wait(`!document.querySelector('[role="alertdialog"]')`);
    assert.equal(await evaluate(`document.querySelector('#marketing-field-label-0').value`), "Sửa thêm trong lúc lưu");
    await control({ saveDelay: 0 }); await button("Lưu cấu hình"); await wait(`document.body.textContent.includes('Đã lưu cấu hình Form & Survey thành công.') && !document.body.textContent.includes('Đang lưu...')`);
    await navigate(builderPath); await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 1"]')`);
    await click('[aria-label="Cấu hình câu hỏi 1"]');
    assert.equal(await evaluate(`document.querySelector('#marketing-field-label-0').value`), "Sửa thêm trong lúc lưu");
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Panel câu hỏi/lựa chọn không co hoặc tràn.");
    await command("Emulation.setDeviceMetricsOverride", { width, height: 2200, deviceScaleFactor: 1, mobile: false });
    assert.ok(await evaluate(`document.querySelector('[aria-label="Kéo trang 1 để đổi thứ tự"]').disabled`));
    await drag('[aria-label="Kéo trang 3 để đổi thứ tự"]', '[aria-label="Kéo trang 2 để đổi thứ tự"]');
    await wait(`document.querySelector('#layout-page-p3-title').closest('section[aria-label]').getAttribute('aria-label')==='Trang 2'`);
    await button("Lưu cấu hình"); await wait(`!document.body.textContent.includes('Đang lưu...') && document.body.textContent.includes('Đã lưu cấu hình Form & Survey thành công.')`);
    await navigate(builderPath); await wait(`document.querySelector('#layout-page-p3-title')`);
    assert.deepEqual((await state()).input.displaySettings.surveyLayout.pages.map(p => p.id), ["default", "p3", "p2"]);
    assert.equal(await evaluate(`document.querySelector('#layout-page-p3-title').closest('section[aria-label]').getAttribute('aria-label')`), "Trang 2");
    await evaluate(`document.querySelector('[aria-label="Kéo trang 3 để đổi thứ tự"]').focus()`);
    await key("ArrowUp", "ArrowUp", 1, 38);
    await wait(`document.querySelector('#layout-page-p2-title').closest('section[aria-label]').getAttribute('aria-label')==='Trang 2'`);
    await drag('[aria-label="Kéo câu hỏi 5 để đổi thứ tự"]', '[aria-label="Kéo câu hỏi 4 để đổi thứ tự"]');
    await wait(`document.querySelector('[aria-label="Câu hỏi 4"] h3').textContent.includes('Ghi chú cuối')`);
    await evaluate(`document.querySelector('[aria-label="Kéo câu hỏi 4 để đổi thứ tự"]').focus()`); await key("ArrowDown", "ArrowDown", 1, 40);
    await wait(`document.querySelector('[aria-label="Câu hỏi 5"] h3').textContent.includes('Ghi chú cuối')`);
    await click('[aria-label="Nhân bản câu hỏi 5"]');
    await wait(`document.querySelector('[aria-label="Câu hỏi 6"]')`);
    assert.notEqual(await evaluate(`document.querySelector('#marketing-field-key-5').value`), "final");
    await click('[aria-label="Xóa câu hỏi 6"]');
    await click('[aria-label="Cấu hình câu hỏi 4"]'); await fill("#marketing-rating-max-3", "7");
    await fill("#marketing-question-description-3", "Hướng dẫn G4 đã lưu. <b>Văn bản thuần</b>");
    await button("Lưu cấu hình"); await wait(`!document.body.textContent.includes('Đang lưu...') && document.body.textContent.includes('Đã lưu cấu hình Form & Survey thành công.')`);
    await navigate(builderPath); await wait(`document.querySelector('[aria-label="Cấu hình câu hỏi 4"]')`);
    await click('[aria-label="Cấu hình câu hỏi 4"]');
    assert.equal(await evaluate(`document.querySelector('#marketing-rating-max-3').value`), "7");
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await button("Điền thử"); await wait(`document.querySelector('[role="dialog"] input[name="gate"]')`);
    const previewMutationCount = (await state()).mutations.length;
    await fillSurvey(true);
    assert.equal((await state()).mutations.length, previewMutationCount);
    assert.equal((await state()).submissions.length, 0, "Preview không gọi mutation public/automation.");
    await key("Escape", "Escape", 0, 27); await wait(`!document.querySelector('[role="dialog"]')`);
    assert.equal(await evaluate("document.activeElement.textContent.trim()"), "Điền thử");
    await navigate("/fixture-public"); await wait(`document.querySelector('input[name="gate"]')`);
    await fillSurvey(false);
    const received = (await state()).submissions;
    assert.equal(received.length, 2); assert.deepEqual(received[0], received[1], "Retry giữ cùng đáp án.");
    assert.equal(received[0].detail, "Chi tiết mới"); assert.deepEqual(received[0].other, { kind: "other", text: "Khác cuối" });
    assert.equal(received[0].rating, "4"); assert.equal(received[0].final, "Ghi chú fixture");
    assert.ok(await evaluate(`!Object.values(localStorage).some(v=>v.includes('Chi tiết mới')||v.includes('Khác cuối'))`));
    console.log(`PASS G4 ${width}px: builder save/reload, native page drag/Alt arrow, clone, leave/saving guard, preview/public visibility/Other/rating, confirmation/retry.`);
  }

  async function latePageFocusRepro() {
    await click('label:has(input[name="gate"][value="yes"])'); await wait(`document.querySelector('#public-field-detail')`);
    await fill("#public-field-detail", "Chi tiết");
    // Deterministically simulate a delayed animation frame after changing page.
    await evaluate(`window.__savedRaf=window.requestAnimationFrame;window.__queuedFrames=[];window.requestAnimationFrame=callback=>window.__queuedFrames.push(callback);true`);
    await button("Tiếp tục"); await wait(`document.querySelector('#public-field-rating')`);
    await click('label:has(input[name="rating"][value="4"])');
    assert.ok(await evaluate(`document.activeElement===document.querySelector('input[name="rating"][value="4"]')`));
    await evaluate(`window.requestAnimationFrame=window.__savedRaf;window.__queuedFrames.splice(0).forEach(callback=>callback(performance.now()));true`);
    assert.ok(await evaluate(`document.activeElement===document.querySelector('input[name="rating"][value="4"]')`), "A delayed page-heading focus must not steal focus from an answer the user has selected");
    await key("ArrowLeft", "ArrowLeft", 0, 37);
    await wait(`document.querySelector('input[name="rating"][value="3"]').checked`);
    await evaluate(`window.__queuedFrames=[];window.requestAnimationFrame=callback=>window.__queuedFrames.push(callback);true`);
    await button("Trang trước"); await wait(`document.querySelector('#public-field-detail')`);
    await click("#public-field-detail");
    await evaluate(`window.requestAnimationFrame=window.__savedRaf;window.__queuedFrames.splice(0).forEach(callback=>callback(performance.now()));true`);
    assert.ok(await evaluate(`document.activeElement===document.querySelector('#public-field-detail')`), "A delayed page focus must not interrupt the next text entry");
    await key("a", "KeyA", 2, 65); await command("Input.insertText", { text: "Chi tiết mới" });
    assert.equal(await evaluate(`document.querySelector('#public-field-detail').value`), "Chi tiết mới");
  }

  async function surveyRepro(confirmation) {
    const fillChecked = async (selector, value) => {
      await fill(selector, value);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`), value,
        `Input must receive text before submitting: ${selector}; active=${await evaluate("document.activeElement?.outerHTML")}`);
    };
    await click('label:has(input[name="gate"][value="yes"])'); await wait(`document.querySelector('#public-field-detail')`);
    await fillChecked("#public-field-detail", "Chi tiết cũ"); await button("Tiếp tục");
    await wait(`document.querySelector('#public-field-rating')`);
    await click('label:has(input[name="rating"][value="4"])');
    await click('label:has(input[name="other"][value="__survey_other__"])');
    await fillChecked("#public-other-other", "Khác cũ");
    if (!confirmation) {
      await button("Trang trước");
      await click('label:has(input[name="gate"][value="no"])'); await wait(`!document.querySelector('#public-field-detail')`);
      await button("Tiếp tục"); await wait(`document.querySelector('#public-field-rating')`);
      assert.ok(await evaluate(`!document.querySelector('input[name="other"]')`));
      await button("Trang trước"); await click('label:has(input[name="gate"][value="yes"])');
      await wait(`document.querySelector('#public-field-detail')`);
      assert.equal(await evaluate(`document.querySelector('#public-field-detail').value`), "");
      await fillChecked("#public-field-detail", "Chi tiết mới"); await button("Tiếp tục");
      await wait(`document.querySelector('#public-field-rating')`);
      await click('label:has(input[name="other"][value="__survey_other__"])'); await wait(`document.querySelector('#public-other-other')`);
      assert.equal(await evaluate(`document.querySelector('#public-other-other').value`), "");
      return;
    }
    await button("Tiếp tục"); await wait(`document.querySelector('#public-field-final')`);
    await fillChecked("#public-field-final", "Ghi chú cần giữ");
    await button("Gửi kiểm thử"); await wait(`document.querySelector('[aria-label="Xác nhận câu trả lời"]')`);
    await button("Quay lại chỉnh sửa");
    assert.equal(await evaluate(`document.querySelector('#public-field-final')?.value`), "Ghi chú cần giữ");
  }

  async function fillSurvey(preview) {
    const scope = preview ? `document.querySelector('[role="dialog"]')` : "document";
    await button("Tiếp tục", scope);
    await wait(`document.activeElement?.getAttribute('aria-invalid')==='true'`);
    await click('label:has(input[name="gate"][value="yes"])'); await wait(`document.querySelector('#public-field-detail')`);
    await fill("#public-field-detail", "Chi tiết cũ"); await button("Tiếp tục", scope);
    await wait(`document.querySelector('#public-field-rating')`);
    assert.match(await evaluate(`document.querySelector('#public-field-rating-description').textContent`), /<b>Văn bản thuần<\/b>/);
    assert.equal(await evaluate(`document.querySelector('#public-field-rating-description b')`), null);
    await click('label:has(input[name="rating"][value="4"])');
    await evaluate(`document.querySelector('input[name="rating"][value="4"]').focus()`);
    await key("ArrowRight", "ArrowRight", 0, 39); await wait(`document.querySelector('input[name="rating"][value="5"]').checked`);
    await key("ArrowLeft", "ArrowLeft", 0, 37); await wait(`document.querySelector('input[name="rating"][value="4"]').checked`);
    await click('label:has(input[name="other"][value="__survey_other__"])'); await wait(`document.querySelector('#public-other-other')`);
    await fill("#public-other-other", "Khác cũ"); await button("Trang trước", scope);
    await click('label:has(input[name="gate"][value="no"])'); await wait(`!document.querySelector('#public-field-detail')`);
    await button("Tiếp tục", scope); await wait(`document.querySelector('#public-field-rating')`);
    assert.ok(await evaluate(`!document.querySelector('#public-other-other') && !document.querySelector('input[name="other"]')`));
    await button("Trang trước", scope); await click('label:has(input[name="gate"][value="yes"])');
    await wait(`document.querySelector('#public-field-detail')`); assert.equal(await evaluate(`document.querySelector('#public-field-detail').value`), "");
    await fill("#public-field-detail", "Chi tiết mới"); await button("Tiếp tục", scope);
    await click('label:has(input[name="other"][value="__survey_other__"])'); await wait(`document.querySelector('#public-other-other')`);
    assert.equal(await evaluate(`document.querySelector('#public-other-other').value`), "");
    await fill("#public-other-other", "Không giữ nội dung này"); await click('label:has(input[name="other"][value="a"])');
    await click('label:has(input[name="other"][value="__survey_other__"])'); await wait(`document.querySelector('#public-other-other')`);
    assert.equal(await evaluate(`document.querySelector('#public-other-other').value`), "");
    await fill("#public-other-other", "Khác cuối");
    assert.ok(await evaluate(`document.querySelector('input[name="rating"][value="4"]').checked`));
    await button("Tiếp tục", scope); await wait(`document.querySelector('#public-field-final')`);
    await button("Gửi kiểm thử", scope); await wait(`document.activeElement.id==='public-field-final'`);
    await fill("#public-field-final", "Ghi chú fixture");
    await button("Trang trước", scope); await button("Tiếp tục", scope);
    assert.equal(await evaluate(`document.querySelector('#public-field-final').value`), "Ghi chú fixture");
    await button("Gửi kiểm thử", scope); await wait(`document.querySelector('[aria-label="Xác nhận câu trả lời"]')`);
    assert.ok(await evaluate(`document.body.textContent.includes('Khác: Khác cuối')`));
    await button("Quay lại chỉnh sửa", scope); assert.equal(await evaluate(`document.querySelector('#public-field-final').value`), "Ghi chú fixture");
    await button("Gửi kiểm thử", scope); await button("Xác nhận gửi", scope);
    if (preview) await wait(`document.body.textContent.includes('Kiểm tra thành công. Không gửi API')`);
    else { await wait(`document.body.textContent.includes('Lỗi mạng fixture')`); await button("Xác nhận gửi"); await wait(`document.querySelector('#fixture-submitted')`); }
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Renderer không tràn ngang.");
  }
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  assert.ok(temporary.startsWith(resolve(tmpdir(), "crm-g4-browser-")));
  await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
}
