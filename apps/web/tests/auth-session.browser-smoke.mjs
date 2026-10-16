import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const root = process.cwd();
const temporary = await mkdtemp(resolve(tmpdir(), "crm-auth-browser-"));
const outDir = resolve(temporary, "dist");
const user = { id: "11111111-1111-4111-8111-111111111111", email: "session@example.test", fullName: "Kiểm thử phiên", avatarUrl: null, roles: [], permissions: [], departmentIds: [], institutionProgramIds: [], accessScope: "READ_ONLY" };
let loggedIn = false, version = 0, refreshCount = 0, writes = 0, rejectToken = false, refreshFailure = 0, logoutFailure = false, server, browser;
const json = (response, payload, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(payload)); };
const body = async request => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || "{}"); };
const auth = () => ({ accessToken: `access-${version}`, expiresIn: 900, sessionId: "22222222-2222-4222-8222-222222222222", rememberDevice: true, user });
try {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/auth/login") {
      const input = await body(request);
      if (input.email !== user.email || input.password !== "password123") return json(response, { message: "Mật khẩu không chính xác." }, 401);
      loggedIn = true; rejectToken = false; version++;
      response.setHeader("Set-Cookie", "fixture-refresh=present; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=34560000");
      return json(response, auth());
    }
    if (url.pathname === "/api/auth/refresh") {
      refreshCount++;
      if (refreshFailure) return json(response, { message: "Không thể gia hạn." }, refreshFailure);
      if (!loggedIn || !request.headers.cookie?.includes("fixture-refresh=present")) return json(response, { message: "Phiên đã kết thúc." }, 401);
      rejectToken = false; version++; return json(response, auth());
    }
    if (url.pathname === "/api/auth/logout") {
      if (logoutFailure) return json(response, { message: "Máy chủ tạm thời lỗi." }, 503);
      loggedIn = false; response.setHeader("Set-Cookie", "fixture-refresh=; HttpOnly; Path=/api/auth; Max-Age=0"); return json(response, {});
    }
    if (url.pathname === "/api/auth/me") return json(response, { user });
    if (url.pathname === "/api/records") {
      if (request.method === "POST") { writes++; await body(request); }
      if (rejectToken || !loggedIn || request.headers.authorization !== `Bearer access-${version}`) return json(response, { message: "Token hết hạn." }, 401);
      return json(response, {});
    }
    if (url.pathname.startsWith("/api/")) return json(response, {}, 404);
    const path = url.pathname.startsWith("/assets/") ? resolve(outDir, "." + url.pathname) : resolve(outDir, "tests/auth-session-smoke.html");
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(path)] ?? "application/octet-stream");
    createReadStream(path).on("error", () => response.writeHead(404).end()).pipe(response);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previous = process.env.VITE_API_URL; process.env.VITE_API_URL = origin + "/api";
  try { await build({ root, logLevel: "error", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tests/auth-session-smoke.html") } } }); }
  finally { if (previous === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previous; }
  browser = await openSmokeBrowser(resolve(temporary, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  const navigate = () => command("Page.navigate", { url: origin + "/work?view=edit#draft" });
  const login = async () => { await wait("document.querySelector('#email')"); await fill("#email", user.email); await fill("#password", "password123"); await click('button[type="submit"]'); await wait("document.querySelector('#draft')"); };
  await navigate(); await login();
  assert.equal(await evaluate("location.pathname+location.search+location.hash"), "/work?view=edit#draft");
  assert.equal(await evaluate("document.cookie.includes('fixture-refresh')"), false);
  assert.equal(await evaluate("localStorage.getItem('admission-crm.access-token')"), null);
  await fill("#draft", "Nội dung quan trọng chưa lưu");

  const beforeRead = refreshCount; rejectToken = true;
  await click("#read"); await wait("document.querySelector('#message')?.textContent==='Thành công'");
  assert.equal(refreshCount, beforeRead + 1);
  rejectToken = true; const beforeWrite = writes;
  await click("#save"); await wait("document.querySelector('#message')?.textContent.includes('thực hiện lại')");
  assert.equal(writes, beforeWrite + 1, "Rejected writes must never be automatically replayed");
  await click("#save"); await wait("document.querySelector('#message')?.textContent==='Thành công'");

  rejectToken = true; refreshFailure = 503;
  await click("#read"); await wait("document.querySelector('#message')?.textContent.includes('Không thể gia hạn')");
  assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), false);
  assert.equal(await evaluate("document.querySelector('#draft').value"), "Nội dung quan trọng chưa lưu");

  refreshFailure = 401; await click("#read"); await wait("document.querySelector('#reauth-password')");
  await fill("#reauth-password", "wrong"); await click('[role="dialog"] button[type="submit"]');
  await wait("document.querySelector('[role=dialog]').textContent.includes('Mật khẩu không chính xác')");
  assert.equal(await evaluate("document.querySelector('#draft').value"), "Nội dung quan trọng chưa lưu");
  refreshFailure = 0;
  await fill("#reauth-password", "password123"); await click('[role="dialog"] button[type="submit"]');
  await wait("!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate("document.querySelector('#draft').value"), "Nội dung quan trọng chưa lưu");

  await command("Page.reload"); await wait("document.querySelector('#draft')");
  await fill("#draft", "Giữ trên màn hình nhỏ");
  await command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  rejectToken = true; refreshFailure = 401;
  await click("#read"); await wait("document.querySelector('#reauth-password')");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Mobile reauthentication must fit the viewport");
  assert.ok(await evaluate("document.activeElement.closest('[role=dialog]')!==null"), "Focus must stay inside reauthentication");
  await new Promise(resolve => setTimeout(resolve, 350));
  await command("Page.captureScreenshot", { format: "png" }).then(async result => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(resolve(root, "../../artifacts/auth-session"), { recursive: true });
    await writeFile(resolve(root, "../../artifacts/auth-session/reauth-mobile.png"), Buffer.from(result.data, "base64"));
  });
  refreshFailure = 0; await fill("#reauth-password", "password123"); await click('[role="dialog"] button[type="submit"]'); await wait("!document.querySelector('[role=dialog]')");

  await evaluate(`window.otherTab=window.open(${JSON.stringify(origin + "/work")},'auth-second-tab');true`);
  await wait("window.otherTab?.document.querySelector('#draft')");
  await evaluate("window.oldToken=window.authProbe.currentSession().accessToken;true");
  logoutFailure = true; await click("#signout"); await wait("document.querySelector('[role=alert]')?.textContent.includes('Chưa thể đăng xuất')");
  assert.ok(await evaluate("document.querySelector('#draft')!==null"));
  logoutFailure = false; await click("#signout");
  await wait("document.querySelector('#email')");
  await wait("window.otherTab.document.querySelector('#email')");
  await evaluate("window.otherTab.close()");
  await login();
  const beforeStaleWrite = writes;
  assert.equal(await evaluate("window.authProbe.writeWithToken(window.oldToken).then(()=>0,error=>error.status)"), 409);
  assert.equal(writes, beforeStaleWrite, "A callback from a logged-out identity cannot use the new session");
  refreshFailure = 503; await command("Page.reload");
  await wait("document.body.textContent.includes('Chưa thể kiểm tra phiên đăng nhập')");
  assert.equal(await evaluate("Boolean(document.querySelector('#email'))"), false);
  refreshFailure = 0; await click("button"); await wait("document.querySelector('#draft')");
  console.log("PASS browser auth: restore, safe read retry, no write replay, transient failure, reauth/draft preservation, 375px/reduced motion/focus, multi-tab logout");
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  // Only remove this test's freshly-created OS temporary directory.
  assert.ok(temporary.startsWith(resolve(tmpdir(), "crm-auth-browser-")));
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
