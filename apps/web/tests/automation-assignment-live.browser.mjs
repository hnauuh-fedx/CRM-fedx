import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";
const config = JSON.parse(process.env.ASSIGNMENT_ACCEPTANCE);
const temp = await mkdtemp(resolve(tmpdir(), "crm-assignment-browser-"));
let browser;
try {
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  const clickText = async (text) => {
    await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()===${JSON.stringify(text)})`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).setAttribute('data-live-target','true')`);
    await click('[data-live-target=true]');
    await evaluate("document.querySelector('[data-live-target=true]')?.removeAttribute('data-live-target')");
    await delay(200);
  };
  await command('Page.addScriptToEvaluateOnNewDocument', { source: "window.__acceptErrors=[];const acceptConsoleError=console.error;console.error=(...args)=>{window.__acceptErrors.push(args.map(x=>x?.stack??String(x)).join(' '));acceptConsoleError(...args)};window.addEventListener('error',e=>window.__acceptErrors.push(e.error?.stack??e.message));" });
  await command('Page.navigate', { url: config.baseUrl+'/automations/monitoring' });
  await wait("document.querySelector('input[type=email]')");
  await fill('input[type=email]', config.email); await fill('input[type=password]', config.password); await click('button[type=submit]');
  await wait(`Array.from(document.querySelectorAll('tbody tr')).some(e=>e.textContent.includes(${JSON.stringify(config.ruleName)}))`);
  await evaluate(`Array.from(document.querySelectorAll('tbody tr')).find(e=>e.textContent.includes(${JSON.stringify(config.ruleName)})).querySelector('button').setAttribute('data-live-detail','true')`);
  await click('[data-live-detail=true]');
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Xung đột phân công')");
  assert.ok(await evaluate(`document.querySelector('[role=dialog]').textContent.includes(${JSON.stringify(config.saleName)})`));
  assert.ok(await evaluate(`document.querySelector('[role=dialog]').textContent.includes(${JSON.stringify(config.winnerRuleName)})`));
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role=dialog] a')).some(e=>e.getAttribute('href')==='/automations/${config.winnerRuleId}/builder')`));
  const artifact = resolve('../../artifacts/automation-assignment-conflict/readiness'); await mkdir(artifact,{recursive:true});
  for (const width of [1440,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500}); await delay(200);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'No root overflow at '+width);
    const shot=await command('Page.captureScreenshot',{captureBeyondViewport:true}); await writeFile(resolve(artifact,'live-monitoring-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:config.baseUrl+'/automations/'+config.ruleId+'/builder'});
  await wait("document.querySelector('.react-flow__node[data-id=assign]')");
  await delay(500);
  assert.ok(await evaluate("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Chạy thử' && !e.disabled)"), 'Opening a saved rule must not mark it dirty');
  await click('.react-flow__node[data-id=assign]');
  await delay(200);
  assert.ok(await evaluate("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Chạy thử' && !e.disabled)"), 'Selecting a node must not mark it dirty');
  await clickText('Chạy thử');
  await fill('input[aria-label="Tìm Lead theo tên, mã hoặc số điện thoại"]',config.leadName);
  await clickText('Tìm');
  await wait("!Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Tìm')?.disabled");
  await click('#automation-test-lead');
  await wait(`Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent.includes(${JSON.stringify(config.leadName)}))`);
  await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes(${JSON.stringify(config.leadName)})).setAttribute('data-live-lead','true')`);
  await click('[data-live-lead]'); await delay(200); await clickText('Xác nhận chạy thử');
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Hoàn tất')");
  assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Xung đột phân công')"));
  const shot=await command('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(resolve(artifact,'live-builder.png'),Buffer.from(shot.data,'base64'));
  await clickText('Đóng');
  await wait("!document.querySelector('[role=dialog]')"); await delay(300);
  const point = await evaluate("(()=>{const b=document.querySelector('.react-flow__node[data-id=condition]').getBoundingClientRect();return {x:b.x+20,y:b.y+20}})()");
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
  for(let step=1;step<=6;step++){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+step*8,y:point.y+step*5,button:'left',buttons:1});await delay(40);}
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+48,y:point.y+30,button:'left',clickCount:1});
  await wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Chạy thử' && e.disabled)");
  assert.equal((await evaluate('window.__acceptErrors')).length,0,'No runtime errors in the real app');
  console.log('PASS: real application login, monitoring conflict/source link, desktop/mobile, and UI-triggered test run preserving sale');
} catch (error) {
  if (browser) console.error("Acceptance runtime errors:", await browser.evaluate("window.__acceptErrors ?? []"));
  throw error;
} finally {
  await browser?.close();
  if(!temp.startsWith(resolve(tmpdir(),'crm-assignment-browser-')))throw Error('Unsafe cleanup target');
  await rm(temp,{recursive:true,force:true});
}
