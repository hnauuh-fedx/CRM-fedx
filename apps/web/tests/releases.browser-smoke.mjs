import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import { build } from 'vite';
import { openSmokeBrowser } from './browser-smoke-driver.mjs';
const temp = await mkdtemp(resolve(tmpdir(), 'crm-releases-smoke-'));
let browser, server;
try {
  const outDir = resolve(temp, 'dist');
  await build({ root: process.cwd(), logLevel: 'error', build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve('tests/releases-smoke.html') } } });
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(outDir, '.' + (pathname === '/' ? '/tests/releases-smoke.html' : pathname));
    if (!file.startsWith(outDir)) { res.writeHead(403); res.end(); return; }
    try { const content = await readFile(file); res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] ?? 'application/octet-stream'); res.end(content); }
    catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  browser = await openSmokeBrowser(resolve(temp, 'profile'));
  const { command, evaluate, wait, click, fill } = browser;
  const base = `http://127.0.0.1:${server.address().port}`;
  const navigate = async mode => { await command('Page.navigate', { url: `${base}/?mode=${mode}` }); };
  const clickText = async text => {
    await evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}); if(!e) throw new Error('Missing button');e.id='smoke-target'; })()`);
    await click('#smoke-target');
  };
  await navigate('admin'); await wait("document.body.textContent.includes('v1.0.2')");
  await clickText('Triển khai'); await wait("document.querySelector('[role=dialog]')");
  await clickText('Xác nhận'); await wait("document.body.textContent.includes('Nhập lý do tối thiểu 5 ký tự.')");
  assert.equal(await evaluate('window.releaseRequests.length'), 0);
  await fill('#deployment-reason', 'Kiểm thử bản phát hành mới'); await clickText('Xác nhận');
  await wait("document.body.textContent.includes('Chưa xác nhận máy chủ đã nhận yêu cầu.')");
  await clickText('Xác nhận'); await wait("!document.querySelector('[role=dialog]')");
  await wait("document.body.textContent.includes('Triển khai thành công.')");
  const requests = await evaluate('window.releaseRequests');
  assert.equal(requests.length, 2); assert.equal(requests[0].requestId, requests[1].requestId);
  assert.equal(requests[0].environment, 'staging'); assert.equal(requests[0].operation, 'deploy');
  await clickText('Xem nhật ký'); await wait("document.body.textContent.includes('Kiểm tra kết nối và mã phiên bản thành công.')");
  await wait("document.querySelector('[aria-label=\"Trạng thái từng thành phần\"]')?.children.length === 7");
  await mkdir(resolve('../../artifacts/releases'), { recursive: true });
  const componentsShot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
  await writeFile(resolve('../../artifacts/releases/ui-components-desktop.png'), Buffer.from(componentsShot.data, 'base64'));
  await clickText('Đóng');
  await mkdir(resolve('../../artifacts/releases'), { recursive: true });
  let shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
  await writeFile(resolve('../../artifacts/releases/ui-desktop.png'), Buffer.from(shot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile page must not overflow horizontally');
  shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
  await writeFile(resolve('../../artifacts/releases/ui-mobile.png'), Buffer.from(shot.data, 'base64'));
  await navigate('viewer'); await wait("document.body.textContent.includes('v1.0.2')");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='Triển khai')"), false);
  await navigate('scoped'); await wait("document.body.textContent.includes('Không có quyền quản lý phiên bản')");
  await navigate('unconfigured'); await wait("document.body.textContent.includes('Chưa kết nối dịch vụ triển khai')");
  await navigate('offline'); await wait("document.body.textContent.includes('Trạng thái phiên bản chưa được xác nhận.')");
  console.log('PASS: Vietnamese UI, confirmation, validation, stable retry request, history/events, scope, read-only access, unconfigured/offline states, desktop and mobile.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
