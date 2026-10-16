import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "vite";

const root = process.cwd();
const temporary = await mkdtemp(resolve(tmpdir(), "crm-report-browser-"));
const outDir = resolve(temporary, "dist");
let child, socket, server;
try {
  await build({ root, logLevel: "warn", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tests/marketing-form-report-smoke.html") } } });
  server = createServer((request, response) => {
    const path = resolve(outDir, "." + new URL(request.url, "http://localhost").pathname);
    if (!path.startsWith(outDir + "\\") && !path.startsWith(outDir + "/")) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(path)] ?? "application/octet-stream");
    createReadStream(path).on("error", () => response.writeHead(404).end()).pipe(response);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let executable;
  for (const path of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await access(path); executable = path; break; } catch {}
  }
  assert.ok(executable, "Chrome/Edge phải có để nghiệm thu UI.");
  const profile = resolve(temporary, "profile");
  child = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true });
  child.stdout?.resume(); child.stderr?.resume();
  let port;
  for (let i = 0; i < 100; i++) { try { port = Number((await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); break; } catch { await delay(50); } }
  assert.ok(port);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => (await command("Runtime.evaluate", { expression, returnByValue: true })).result?.value;
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } assert.fail(`UI timeout: ${expression}`); };
  await command("Page.enable"); await command("Runtime.enable");
  for (const width of [375, 768, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/tests/marketing-form-report-smoke.html` });
    await wait(`document.body.textContent.includes('Pipeline hiện tại đếm Lead duy nhất')`);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
    await evaluate(`document.querySelector('input[type=date]').focus()`);
    assert.equal(await evaluate("document.activeElement.type"), "date");
    // Native date controls have internal day/month/year segments in Chrome.
    for (let tab = 0; tab < 6; tab++) {
      await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      if (await evaluate(`document.activeElement.id.startsWith('report-to-')`)) break;
    }
    assert.ok(await evaluate(`document.activeElement.id.startsWith('report-to-')`));
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xuất trang báo cáo CSV').click()`);
    await wait(`window.reportSmoke.requests.some(r=>r.path.includes('/export'))`);
    assert.ok(await evaluate(`window.reportSmoke.requests.every(r=>r.program==='program-a')`));
    await evaluate(`window.reportSmoke.fail=true; document.querySelector('#change-program').click()`);
    await wait(`document.body.textContent.includes('Không thể tải báo cáo.')`);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xuất trang báo cáo CSV').disabled`));
    await evaluate(`window.reportSmoke.fail=false; Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Thử lại').click()`);
    await wait(`document.querySelector('dd')?.textContent==='20'`);
    assert.ok(await evaluate(`window.reportSmoke.requests.filter(r=>r.program==='program-b').length>=2`));
    await evaluate(`document.querySelector('#remove-export').click()`);
    await wait(`!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Xuất trang báo cáo CSV')`);
    await evaluate(`document.querySelector('#remove-view').click()`);
    await wait(`!document.body.textContent.includes('Báo cáo phản hồi')`);
  }
  console.log("PASS report UI: 375/768/1440px, focus, scoped export, program change and permission visibility.");
} finally {
  socket?.close();
  if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  assert.ok(temporary.startsWith(resolve(tmpdir(), "crm-report-browser-")));
  await rm(temporary, { recursive: true, force: true });
}
