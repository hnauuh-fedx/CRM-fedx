import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function openSmokeBrowser(profile) {
  let executable;
  for (const path of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await access(path); executable = path; break; } catch {}
  }
  assert.ok(executable, "Chrome/Edge phải có để nghiệm thu UI.");
  const child = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--window-size=1440,2400", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true });
  child.stdout?.resume(); child.stderr?.resume();
  let socket;
  const close = async () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (child.exitCode === null) await Promise.race([once(child, "exit"), delay(1000)]);
    socket?.close();
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
  };
  try {
    let port;
    for (let i = 0; i < 100; i++) { try { port = Number((await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); break; } catch { await delay(50); } }
    assert.ok(port);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
    let id = 0; const pending = new Map();
    socket.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
    const evaluate = async expression => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result?.value;
    };
    const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(50); } throw new Error(`UI timeout: ${expression}; ${(await evaluate("document.body.textContent"))?.slice(-1800)}`); };
    const box = async (selector, scroll = true) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw new Error('Missing control: '+${JSON.stringify(selector)}); ${scroll ? "e.scrollIntoView({block:'center'});" : ""} const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height}})()`);
    const click = async selector => {
      await wait(`document.querySelector(${JSON.stringify(selector)})`);
      if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.closest('[role="dialog"],[role="alertdialog"]'))`)) await delay(200);
      const b = await box(selector);
      await command("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
      await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
    };
    const key = async (key, code, modifiers = 0, virtualKey) => { for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key, code, modifiers, ...(virtualKey ? { windowsVirtualKeyCode: virtualKey } : {}) }); };
    const fill = async (selector, text) => { await click(selector); await key("a", "KeyA", 2, 65); await command("Input.insertText", { text }); };
    const drag = async (source, target) => {
      await command("Input.setInterceptDrags", { enabled: false });
      const from = await box(source);
      await evaluate(`window.__g4DragEvents=[];for(const name of ['dragstart','drop'])document.addEventListener(name,e=>window.__g4DragEvents.push({type:e.type,data:e.dataTransfer?.getData('application/x-admission-form-reorder')}),{once:true,capture:name==='drop'})`);
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
      await command("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + i * 5, y: from.y + i * 5, button: "left", buttons: 1 });
        await delay(25);
      }
      const to = await box(target, false);
      for (let step = 0; step < 4; step++) {
        await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: to.x + step % 2, y: to.y + step % 2, button: "left", buttons: 1 });
        await delay(50);
      }
      await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", clickCount: 1 });
      assert.ok(await evaluate(`window.__g4DragEvents.some(e=>e.type==='dragstart')`), "Chuột thật phải bắt đầu native drag.");
      assert.ok(await evaluate(`window.__g4DragEvents.some(e=>e.type==='drop' && e.data)`), "Chuột thật phải drop dữ liệu từ handler thật.");
    };
    await command("Page.enable"); await command("Runtime.enable");
    return { command, evaluate, wait, click, fill, key, drag, close };
  } catch (error) { await close(); throw error; }
}
