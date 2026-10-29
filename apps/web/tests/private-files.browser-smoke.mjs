import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import { build } from 'vite';
import { setTimeout as delay } from 'node:timers/promises';
import { openSmokeBrowser } from './browser-smoke-driver.mjs';
const temp = await mkdtemp(resolve(tmpdir(), 'crm-private-files-smoke-'));
let browser, server, downloadReceived = false;
try {
  const outDir = resolve(temp, 'dist'), file = resolve(temp, 'fixture.pdf'); await writeFile(file, '%PDF-1.4\nfixture\n%%EOF');
  await build({ root: process.cwd(), logLevel: 'error', build: { outDir, emptyOutDir: true, rolldownOptions: { input: resolve('tests/private-files-smoke.html') } } });
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/download') { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="fixture.pdf"' }); res.end('fixture'); downloadReceived = true; return; }
    const target = resolve(outDir, '.' + (pathname === '/' ? '/tests/private-files-smoke.html' : pathname));
    if (!target.startsWith(outDir)) { res.writeHead(403); res.end(); return; }
    try { const bytes = await readFile(target); res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(target)] ?? 'application/octet-stream'); res.end(bytes); } catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  browser = await openSmokeBrowser(resolve(temp, 'profile')); const { command, evaluate, wait, click } = browser;
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(temp, 'downloads') });
  const base = `http://127.0.0.1:${server.address().port}`;
  await command('Page.navigate', { url: base }); await wait("document.querySelector('input[type=file]')");
  const document = await command('DOM.getDocument'); const node = await command('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' });
  await command('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [file] });
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Tải tệp lên').id='upload-test'"); await click('#upload-test');
  await wait("document.body.textContent.includes('Lỗi tạm thời trong fixture')"); await click('#upload-test');
  await wait("document.body.textContent.includes('Đã đính kèm tệp')");
  const requests = await evaluate('window.fileRequests'); assert.equal(requests.length, 2); assert.ok(requests[0].id); assert.equal(requests[0].id, requests[1].id);
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  await mkdir(resolve('../../artifacts/private-files'), { recursive: true }); const shot = await command('Page.captureScreenshot', { captureBeyondViewport: true }); await writeFile(resolve('../../artifacts/private-files/ui-mobile.png'), Buffer.from(shot.data, 'base64'));
  await evaluate("document.querySelector('button[aria-label]').id='download-test'"); await click('#download-test'); await wait('window.downloadRequests === 1');
  for (let attempt = 0; attempt < 100 && !downloadReceived; attempt++) await delay(50);
  assert.ok(downloadReceived, 'Signed download must reach the fixture before navigating away.');
  await command('Page.navigate', { url: base + '?disabled' }); await wait("location.search === '?disabled' && window.fileRequests?.length === 0 && document.body.textContent.includes('Tệp đính kèm')");
  assert.equal(await evaluate("Boolean(document.querySelector('input[type=file]'))"), false);
  console.log('PASS: private file selection, multipart boundary, retry UUID reuse, authenticated download, mobile layout and disabled local UI.');
} finally { await browser?.close(); await new Promise(resolve => server?.close(resolve) ?? resolve()); await rm(temp, { recursive: true, force: true }); }
