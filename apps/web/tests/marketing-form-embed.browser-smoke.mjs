import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(webRoot, "dist");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

async function findBrowser() {
  for (const candidate of chromeCandidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next installed browser. */ }
  }
  throw new Error("Không tìm thấy Chrome/Edge để chạy browser smoke G5.");
}

function listen(server) {
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Không lấy được cổng fixture.");
    return `http://127.0.0.1:${address.port}`;
  });
}

function close(server) {
  return new Promise(resolveClose => server.close(() => resolveClose()));
}

function send(response, status, type, body, headers = {}) {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...headers });
  response.end(body);
}

function json(response, status, body, headers = {}) {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(body), headers);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (error) { rejectBody(error); }
    });
    request.on("error", rejectBody);
  });
}

function formConfig(publicKey) {
  return {
    id: "form-g5-browser",
    name: `G5 Browser ${publicKey}`,
    formType: "survey",
    title: "Nghiệm thu biểu mẫu G5",
    subtitle: "Fixture cô lập — không ghi CRM",
    description: "Kiểm tra iframe, tracking và retry.",
    submitButtonLabel: "Gửi kiểm tra",
    primaryColor: "#0f4c81",
    backgroundColor: "#08366f",
    displaySettings: {},
    closeSettings: {},
    successSettings: { message: "Đã nhận fixture G5." },
    template: null,
    platform: "browser-smoke",
    campaign: null,
    fields: [{
      fieldKey: "full_name",
      label: "Họ tên kiểm thử",
      placeholder: "Nhập dữ liệu fixture",
      fieldType: "text",
      isRequired: true,
      options: [],
      validationRules: {},
      defaultValue: null,
      sortOrder: 0,
    }],
  };
}

function automationScript() {
  return String.raw`<script>
(function () {
  const key = location.pathname.split("/").filter(Boolean).pop() || "";
  if (!key.startsWith("g5-")) return;
  const waitFor = async (predicate, timeout = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Browser fixture timeout: " + key);
  };
  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  (async () => {
    const input = await waitFor(() => document.querySelector('input:not([aria-hidden="true"]):not([type="hidden"])'));
    setValue(input, "Fixture G5 Browser");
    await new Promise(resolve => setTimeout(resolve, 900));
    const params = new URLSearchParams(location.search);
    const parentOrigin = params.get("parent_origin");
    if (parentOrigin && window.parent !== window) {
      window.parent.postMessage({ protocol: "admission-crm.form-embed", version: 1, type: "resize", formId: "form-g5-browser", height: 1550, extra: true }, parentOrigin);
      if (key === "g5-snippet") window.parent.postMessage({ protocol: "admission-crm.form-embed", version: 1, type: "redirect", formId: "form-g5-browser", url: parentOrigin + "/wrong-redirect" }, parentOrigin);
    }
    document.querySelector('button[type="submit"]').click();
    if (key === "g5-retry") {
      await waitFor(() => document.querySelector('[role="alert"]'));
      document.querySelector('button[type="submit"]').click();
    }
    if (key === "g5-static") {
      const link = await waitFor(() => document.querySelector('a[target="_top"]'));
      await fetch(window.__qaApiOrigin + "/api/qa-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "static", hasContinue: link.textContent.includes("Tiếp tục") }) });
    } else if (key !== "g5-snippet") {
      await waitFor(() => document.body.textContent.includes("Đã gửi thông tin"));
      const result = document.createElement("pre");
      result.id = "acceptance-result";
      result.textContent = JSON.stringify({ key, success: true });
      document.body.appendChild(result);
    }
  })().catch(error => {
    const result = document.createElement("pre");
    result.id = "acceptance-result";
    result.textContent = JSON.stringify({ key, error: String(error) });
    document.body.appendChild(result);
  });
})();
</script>`;
}

function hostPage(kind, hostOrigin, webOrigin) {
  const resultScript = kind === "layout" ? String.raw`
    let rejectedMessageChangedHeight = false;
    const watch = setInterval(() => {
      const iframe = document.querySelector("#mount iframe");
      if (!iframe) return;
      const height = Math.round(iframe.getBoundingClientRect().height);
      if (height === 1550 || height === 1600) rejectedMessageChangedHeight = true;
    }, 25);
    setTimeout(() => {
      clearInterval(watch);
      const iframe = document.querySelector("#mount iframe");
      const box = iframe.getBoundingClientRect();
      document.querySelector("#result").textContent = JSON.stringify({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        iframeWidth: Math.round(box.width),
        iframeHeight: Math.round(box.height),
        minHeight: iframe.style.minHeight,
        rejectedMessageChangedHeight,
        path: location.pathname,
      });
    }, 3500);` : String.raw`
    setTimeout(() => {
      const iframe = document.querySelector("#static-form");
      document.querySelector("#result").textContent = JSON.stringify({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        iframeHeight: Math.round(iframe.getBoundingClientRect().height),
        path: location.pathname,
      });
    }, 3500);`;
  if (kind === "static") {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G5 static iframe</title></head><body><iframe id="static-form" src="${webOrigin}/bieu-mau/g5-static?embed=1" title="Form tĩnh G5" style="width:100%;min-height:720px;border:0"></iframe><pre id="result">pending</pre><script>${resultScript}</script></body></html>`;
  }
  const key = kind === "redirect" ? "g5-snippet" : "g5-layout";
  const redirect = kind === "redirect" ? ` data-redirect-url="${hostOrigin}/redirected"` : "";
  const attacker = kind === "layout" ? `<iframe title="Nguồn message giả" hidden src="${webOrigin}/attacker?parent_origin=${encodeURIComponent(hostOrigin)}"></iframe>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G5 ${kind}</title><style>body{margin:8px;overflow-wrap:anywhere}</style></head><body><main><div id="mount"></div>${attacker}<pre id="result">pending</pre></main><script async src="${webOrigin}/marketing-form-embed.js" data-mount-id="mount" data-form-id="form-g5-browser" data-form-url="${webOrigin}/bieu-mau/${key}" data-title="Nghiệm thu G5"${redirect}></script>${kind === "layout" ? `<script>${resultScript}</script>` : ""}</body></html>`;
}

function mime(pathname) {
  return ({ ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".html": "text/html; charset=utf-8" })[extname(pathname)] ?? "application/octet-stream";
}

async function runBrowser(browser, profileRoot, url, completion) {
  const profile = await mkdtemp(resolve(profileRoot, "chrome-"));
  const child = spawn(browser, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { windowsHide: true });
  child.stdout?.resume();
  child.stderr?.resume();
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { port = Number((await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); break; }
      catch { await delay(50); }
    }
    assert.ok(port, "Chrome phải mở DevTools protocol cho browser smoke.");
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    const target = targets.find(item => item.type === "page");
    assert.ok(target?.webSocketDebuggerUrl, "Chrome phải có page target.");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    let commandId = 0;
    const pending = new Map();
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
      const id = ++commandId;
      pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await command("Page.navigate", { url });
    const started = Date.now();
    let dom = "";
    while (Date.now() - started < 12_000) {
      try {
        const result = await command("Runtime.evaluate", {
          expression: `({ done: Boolean(${completion}), html: document.documentElement.outerHTML })`,
          returnByValue: true,
        });
        if (result.result?.value?.done) { dom = result.result.value.html; break; }
      } catch { /* Navigation may replace the execution context; retry on the new page. */ }
      await delay(100);
    }
    socket.close();
    assert.ok(dom, `Browser smoke hết thời gian chờ: ${url}`);
    return { stdout: dom, stderr: "" };
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit").catch(() => undefined);
    }
    await rm(profile, { recursive: true, force: true });
  }
}

function resultFromDom(dom) {
  const match = dom.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(match, "Trang host phải xuất kết quả nghiệm thu.");
  return JSON.parse(match[1].replaceAll("&amp;", "&").replaceAll("&quot;", '"'));
}

const submissions = [];
const captures = [];
const retries = new Map();
const hostHits = [];
let apiOrigin = "";
let webOrigin = "";
let hostOrigin = "";

const apiServer = createServer(async (request, response) => {
  const originHeaders = {
    "Access-Control-Allow-Origin": webOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Idempotency-Key",
  };
  if (request.method === "OPTIONS") { response.writeHead(204, originHeaders); response.end(); return; }
  const url = new URL(request.url, apiOrigin);
  if (request.method === "GET" && /^\/api\/public\/forms\/g5-/.test(url.pathname)) {
    json(response, 200, formConfig(url.pathname.split("/").pop()), originHeaders);
    return;
  }
  const submit = url.pathname.match(/^\/api\/public\/forms\/(g5-[^/]+)\/submit$/);
  if (request.method === "POST" && submit) {
    const key = submit[1];
    const body = await readBody(request);
    const record = { key, idempotencyKey: request.headers["idempotency-key"], body };
    submissions.push(record);
    const attempt = (retries.get(key) ?? 0) + 1;
    retries.set(key, attempt);
    if (key === "g5-retry" && attempt === 1) {
      json(response, 504, { message: "Yêu cầu quá thời gian. Vui lòng thử lại." }, originHeaders);
      return;
    }
    const redirect = key === "g5-static" ? `${hostOrigin}/static-redirect-target` : key === "g5-snippet" ? `${hostOrigin}/redirected` : undefined;
    json(response, 200, { submissionId: `submission-${key}`, status: "processed", message: "Đã nhận fixture G5.", redirectUrl: redirect, redirectMode: redirect ? "landing_page" : undefined }, originHeaders);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/qa-capture") {
    captures.push(await readBody(request));
    json(response, 200, { ok: true }, originHeaders);
    return;
  }
  json(response, 404, { message: "Fixture API không tồn tại." }, originHeaders);
});

const webServer = createServer(async (request, response) => {
  const url = new URL(request.url, webOrigin);
  if (url.pathname === "/attacker") {
    const parentOrigin = url.searchParams.get("parent_origin") ?? "";
    send(response, 200, "text/html; charset=utf-8", `<!doctype html><script>setTimeout(()=>parent.postMessage({protocol:"admission-crm.form-embed",version:1,type:"resize",formId:"form-g5-browser",height:1600},${JSON.stringify(parentOrigin)}),700)</script>`);
    return;
  }
  if (url.pathname.startsWith("/bieu-mau/")) {
    let index = await readFile(resolve(distRoot, "index.html"), "utf8");
    index = index.replace("</head>", `<script>window.__qaApiOrigin=${JSON.stringify(apiOrigin)}</script></head>`).replace("</body>", `${automationScript()}</body>`);
    send(response, 200, "text/html; charset=utf-8", index);
    return;
  }
  const diskPath = resolve(distRoot, `.${url.pathname}`);
  if (diskPath.startsWith(distRoot)) {
    try {
      const info = await stat(diskPath);
      if (info.isFile()) {
        response.writeHead(200, { "Content-Type": mime(diskPath), "Cache-Control": "no-store" });
        createReadStream(diskPath).pipe(response);
        return;
      }
    } catch { /* Fall through to 404. */ }
  }
  send(response, 404, "text/plain; charset=utf-8", "Not found");
});

const hostServer = createServer((request, response) => {
  const url = new URL(request.url, hostOrigin);
  hostHits.push(url.pathname);
  if (url.pathname === "/snippet-layout") { send(response, 200, "text/html; charset=utf-8", hostPage("layout", hostOrigin, webOrigin)); return; }
  if (url.pathname === "/static") { send(response, 200, "text/html; charset=utf-8", hostPage("static", hostOrigin, webOrigin)); return; }
  if (url.pathname === "/snippet-redirect") { send(response, 200, "text/html; charset=utf-8", hostPage("redirect", hostOrigin, webOrigin)); return; }
  if (url.pathname === "/redirected") { send(response, 200, "text/html; charset=utf-8", "<!doctype html><title>redirect-ok</title><h1>redirect-ok</h1>"); return; }
  if (url.pathname === "/wrong-redirect" || url.pathname === "/static-redirect-target") { send(response, 200, "text/html; charset=utf-8", `<h1>${url.pathname}</h1>`); return; }
  send(response, 404, "text/plain; charset=utf-8", "Not found");
});

const profileRoot = await mkdtemp(resolve(tmpdir(), "admission-crm-g5-"));
try {
  [apiOrigin, webOrigin, hostOrigin] = await Promise.all([listen(apiServer), listen(webServer), listen(hostServer)]);
  const browser = await findBrowser();
  const previousApiUrl = process.env.VITE_API_URL;
  const previousPublicUrl = process.env.VITE_PUBLIC_WEB_URL;
  process.env.VITE_API_URL = `${apiOrigin}/api`;
  process.env.VITE_PUBLIC_WEB_URL = webOrigin;
  try {
    const { build } = await import("vite");
    await build({ root: webRoot, logLevel: "warn" });
  } finally {
    if (previousApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = previousApiUrl;
    if (previousPublicUrl === undefined) delete process.env.VITE_PUBLIC_WEB_URL;
    else process.env.VITE_PUBLIC_WEB_URL = previousPublicUrl;
  }

  const layoutRun = await runBrowser(browser, profileRoot, `${hostOrigin}/snippet-layout?utm_source=qa&utm_campaign=g5&secret=khong-luu#fragment`, `document.querySelector("#result")?.textContent !== "pending"`);
  const layout = resultFromDom(layoutRun.stdout);
  assert.ok(layout.viewport <= 400, `Viewport mobile phải gần 375px, thực tế ${layout.viewport}px.`);
  assert.ok(layout.documentWidth <= layout.viewport, "Landing page không được tràn ngang trên mobile.");
  assert.ok(layout.iframeWidth <= layout.viewport, "Iframe phải nằm trong viewport mobile.");
  assert.equal(layout.minHeight, "240px", "Snippet phải hạ min-height sau resize tin cậy.");
  assert.ok(layout.iframeHeight >= 240 && layout.iframeHeight < 720, `Auto-height phải co iframe theo nội dung, thực tế ${layout.iframeHeight}px.`);
  assert.equal(layout.rejectedMessageChangedHeight, false, "Message sai source/schema không được đổi chiều cao.");

  const layoutSubmission = submissions.find(item => item.key === "g5-layout");
  assert.ok(layoutSubmission, "Form trong snippet phải submit thành công.");
  assert.equal(layoutSubmission.body.utm_source, "qa");
  assert.equal(layoutSubmission.body.utm_campaign, "g5");
  assert.ok(String(layoutSubmission.body.source_url).includes("utm_source=qa"));
  assert.ok(!String(layoutSubmission.body.source_url).includes("secret="));
  assert.ok(!String(layoutSubmission.body.source_url).includes("#fragment"));

  const staticRun = await runBrowser(browser, profileRoot, `${hostOrigin}/static`, `document.querySelector("#result")?.textContent !== "pending"`);
  const staticResult = resultFromDom(staticRun.stdout);
  assert.equal(staticResult.path, "/static", "Iframe tĩnh không được tự điều hướng landing page.");
  assert.ok(staticResult.iframeHeight >= 720, "Iframe tĩnh phải giữ fallback 720px khi không có snippet.");
  assert.deepEqual(captures.find(item => item.kind === "static"), { kind: "static", hasContinue: true });
  assert.ok(!hostHits.includes("/static-redirect-target"), "Iframe tĩnh không được tự mở redirect trên parent.");

  const retryRun = await runBrowser(browser, profileRoot, `${webOrigin}/bieu-mau/g5-retry`, `Boolean(document.querySelector("#acceptance-result"))`);
  assert.match(retryRun.stdout, /"key":"g5-retry","success":true/);
  const retrySubmissions = submissions.filter(item => item.key === "g5-retry");
  assert.equal(retrySubmissions.length, 2, "Timeout phải cho phép thử lại đúng một lần trong fixture.");
  assert.ok(retrySubmissions[0].idempotencyKey);
  assert.equal(retrySubmissions[0].idempotencyKey, retrySubmissions[1].idempotencyKey, "Retry cùng payload phải giữ idempotency key.");
  assert.deepEqual(retrySubmissions[0].body, retrySubmissions[1].body);

  const redirectRun = await runBrowser(browser, profileRoot, `${hostOrigin}/snippet-redirect`, `location.pathname === "/redirected"`);
  assert.match(redirectRun.stdout, /redirect-ok/);
  assert.ok(hostHits.includes("/redirected"), "Parent phải điều hướng đến đúng URL đã cấu hình.");
  assert.ok(!hostHits.includes("/wrong-redirect"), "Parent phải từ chối redirect không khớp cấu hình.");

  console.log(JSON.stringify({
    ok: true,
    browser,
    origins: { host: hostOrigin, app: webOrigin, api: apiOrigin },
    mobile: layout,
    tracking: layoutSubmission.body,
    staticIframe: staticResult,
    retry: { attempts: retrySubmissions.length, idempotencyKey: retrySubmissions[0].idempotencyKey },
    redirect: { exactTargetVisited: true, forgedTargetVisited: false },
  }, null, 2));
} finally {
  await Promise.all([close(apiServer), close(webServer), close(hostServer)]);
  await rm(profileRoot, { recursive: true, force: true });
}
