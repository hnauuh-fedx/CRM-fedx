import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const root = process.cwd();
const temporary = await mkdtemp(resolve(tmpdir(), "crm-program-entry-"));
const outDir = resolve(temporary, "dist");
const programA = "11111111-1111-4111-8111-111111111111";
const programB = "22222222-2222-4222-8222-222222222222";
const programs = [
  { id: programA, name: "Chương trình đại học", code: "DH", institutionName: "Trường Đại học Tuyển sinh" },
  { id: programB, name: "Chương trình sau đại học", code: "SDH", institutionName: "Trường Đại học Tuyển sinh" },
];
const users = ["first", "second"].map((name, index) => ({ id: `user-${index}`, email: `${name}@example.test`, fullName: `Nhân viên ${index + 1}`, avatarUrl: null, roles: [], permissions: ["lead.view_assigned"], departmentIds: [], institutionProgramIds: [programA, programB], workingInstitutionProgramId: programA, accessScope: "ASSIGNED_ONLY" }));
let identity = null, version = 0, optionsFailure = false, profileFailure = false;
let available = [...programs], businessReads = [], server, browser;
const json = (response, payload, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(payload)); };
const body = async request => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || "{}"); };
const user = programId => ({ ...users[identity], institutionProgramIds: available.map(program => program.id), workingInstitutionProgramId: programId || programA, permissions: ["lead.view_assigned", ...(programId === programB ? ["lead.update_assigned"] : [])] });
const auth = () => ({ accessToken: `access-${++version}`, expiresIn: 900, sessionId: "fixture-session", rememberDevice: true, user: user(null) });
try {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const selected = request.headers["x-institution-program-id"];
    if (url.pathname === "/api/auth/login") {
      const input = await body(request);
      identity = users.findIndex(entry => entry.email === input.email);
      if (identity < 0 || input.password !== "password123") { identity = null; return json(response, {}, 401); }
      response.setHeader("Set-Cookie", `fixture-user=${identity}; HttpOnly; SameSite=Lax; Path=/api/auth; ${input.rememberDevice ? "Max-Age=34560000" : ""}`);
      return json(response, auth());
    }
    if (url.pathname === "/api/auth/refresh") {
      if (identity === null || !request.headers.cookie?.includes(`fixture-user=${identity}`)) return json(response, {}, 401);
      return json(response, auth());
    }
    if (url.pathname === "/api/auth/logout") {
      identity = null;
      response.setHeader("Set-Cookie", "fixture-user=; HttpOnly; Path=/api/auth; Max-Age=0");
      return json(response, {});
    }
    if (url.pathname === "/api/auth/me") {
      if (profileFailure) return json(response, {}, 503);
      if (selected && !available.some(program => program.id === selected)) return json(response, {}, 403);
      return json(response, { user: user(selected) });
    }
    if (url.pathname === "/api/institution-programs/options") {
      assert.equal(selected ?? "", "", "Options must not require access to the remembered program");
      return optionsFailure ? json(response, {}, 503) : json(response, { data: available });
    }
    if (url.pathname === "/api/records") {
      businessReads.push(selected);
      assert.ok(available.some(program => program.id === selected), "No unselected or unauthorized business read");
      return json(response, { programId: selected });
    }
    if (url.pathname.startsWith("/api/")) return json(response, { data: [], unreadCount: 0 });
    const path = url.pathname.startsWith("/assets/") ? resolve(outDir, "." + url.pathname) : resolve(outDir, "tests/program-entry-smoke.html");
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(path)] ?? "application/octet-stream");
    createReadStream(path).on("error", () => response.writeHead(404).end()).pipe(response);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previous = process.env.VITE_API_URL; process.env.VITE_API_URL = origin + "/api";
  try { await build({ root, logLevel: "error", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tests/program-entry-smoke.html") } } }); }
  finally { if (previous === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previous; }
  const profile = resolve(temporary, "profile");
  browser = await openSmokeBrowser(profile);
  let { command, evaluate, wait, click, key } = browser;
  const storageKey = id => `admission-crm.selected-institution-program-id:${users[id].id}`;
  const navigate = () => command("Page.navigate", { url: origin + "/work?view=edit#draft" });
  const login = async index => {
    await wait("document.querySelector('#email')");
    for (const [selector, value] of [["#email", users[index].email], ["#password", "password123"]]) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await command("Input.insertText", { text: value });
    }
    await evaluate("document.querySelector('button[type=submit]').click()");
  };
  const choose = async programId => {
    await wait("document.querySelector('#program-selection-form')");
    await evaluate(`document.querySelector('input[value="${programId}"]').click()`);
    await wait(`document.querySelector('input[value="${programId}"]').checked && !document.querySelector('button[form="program-selection-form"]').disabled`);
    await evaluate("document.querySelector('button[form=program-selection-form]').click()");
    await wait(`document.querySelector('#record-program')?.textContent===${JSON.stringify(programId)}`);
  };
  const logout = async () => {
    await evaluate("document.querySelector('#signout').click()");
    await wait("document.querySelector('#email')");
  };
  const screenshot = async name => {
    await mkdir(resolve(root, "../../artifacts/program-entry"), { recursive: true });
    const capture = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(root, `../../artifacts/program-entry/${name}.png`), Buffer.from(capture.data, "base64"));
  };

  await navigate(); await login(0); await wait("document.querySelector('#program-selection-form')");
  assert.equal(businessReads.length, 0);
  assert.equal(await evaluate("Boolean(document.querySelector('header'))"), false, "CRM shell stays hidden until confirmed");
  assert.ok(await evaluate("document.querySelector('button[form=program-selection-form]').disabled"));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await screenshot("selection-1440");
  await command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await screenshot("selection-375");
  await evaluate("document.querySelector('input[type=radio]').focus()");
  await key("ArrowDown", "ArrowDown", 0, 40);
  await wait(`document.querySelector('input[value="${programB}"]').checked`);
  await click('button[form="program-selection-form"]'); await wait(`document.querySelector('#record-program')?.textContent==='${programB}'`);
  assert.equal(await evaluate("document.querySelector('#program-permission').textContent"), "edit", "Selected-program permissions are fetched before mounting routes");
  assert.equal(await evaluate("location.pathname+location.search+location.hash"), "/work?view=edit#draft");
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(storageKey(0))})`), programB);

  await command("Page.reload"); await wait("document.querySelector('#draft')");
  assert.equal(await evaluate("Boolean(document.querySelector('#program-selection-form'))"), false);
  // Closing the browser and reopening the profile must keep the cookie and program.
  await browser.close();
  await rm(resolve(profile, "DevToolsActivePort"), { force: true });
  browser = await openSmokeBrowser(profile);
  ({ command, evaluate, wait, click, key } = browser);
  await command("Page.bringToFront");
  await navigate(); await wait("document.querySelector('#draft')");
  assert.equal(await evaluate("document.querySelector('#selected-program').textContent"), programB);
  await click('[aria-label="Đổi chương trình làm việc"]');
  await click(`[role="option"][data-state="unchecked"]`);
  await wait(`document.querySelector('#record-program')?.textContent==='${programA}'`);
  assert.equal(await evaluate("document.querySelector('#program-permission').textContent"), "read");

  await logout(); await login(1); await wait("document.querySelector('#program-selection-form')");
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(storageKey(1))})`), null);
  await choose(programB); await logout(); await login(0); await wait("document.querySelector('#draft')");
  assert.equal(await evaluate("document.querySelector('#selected-program').textContent"), programA);

  available = [programs[1]]; await command("Page.reload"); await wait("document.querySelector('#program-selection-form')");
  assert.equal(await evaluate("document.querySelectorAll('input[type=radio]').length"), 1, "Even a single available program needs first confirmation");
  assert.equal(await evaluate("Boolean(document.querySelector('#draft'))"), false);
  await choose(programB);
  available = []; await command("Page.reload"); await wait("document.body.textContent.includes('Chưa có chương trình làm việc')");
  assert.equal(await evaluate("Boolean(document.querySelector('#draft'))"), false);

  available = [...programs]; optionsFailure = true; await command("Page.reload"); await wait("document.body.textContent.includes('Không thể tải chương trình')");
  assert.equal(await evaluate("Boolean(document.querySelector('#draft'))"), false);
  optionsFailure = false; await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Thử lại')).click()");
  await choose(programA);
  profileFailure = true; await command("Page.reload"); await wait("document.body.textContent.includes('Không thể kiểm tra quyền')");
  assert.equal(await evaluate("Boolean(document.querySelector('#draft'))"), false);
  profileFailure = false; await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Thử lại')).click()"); await wait("document.querySelector('#draft')");

  // A legacy, unowned shared value must not be adopted for another account.
  await logout(); await evaluate(`localStorage.removeItem(${JSON.stringify(storageKey(0))});localStorage.setItem('admission-crm.selected-institution-program-id','${programB}')`);
  await login(0); await wait("document.querySelector('#program-selection-form')");
  assert.equal(await evaluate("localStorage.getItem('admission-crm.selected-institution-program-id')"), null);
  assert.ok(businessReads.every(id => id === programA || id === programB));
  console.log("PASS program entry: first choice, keyboard/375px, deep links, reload/browser reopen, program permissions/cache, account isolation, revoked/single/empty programs, retry, legacy storage");
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  assert.ok(temporary.startsWith(resolve(tmpdir(), "crm-program-entry-")));
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
