import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-work-schedule-smoke-"));
const outDir = resolve(temp, "dist");
let server, browser;
try {
  await build({
    root: process.cwd(),
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: {
        input: resolve("tests/sale-work-schedule-smoke.html"),
      },
    },
  });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(
      outDir,
      `.${pathname === "/" ? "/tests/sale-work-schedule-smoke.html" : pathname}`,
    );
    if (!file.startsWith(outDir)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(file);
      response.setHeader(
        "Content-Type",
        { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
          extname(file)
        ] ?? "application/octet-stream",
      );
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  await command("Page.navigate", {
    url: `http://127.0.0.1:${server.address().port}`,
  });
  await wait("document.querySelector('#schedule-name')");
  assert.equal(
    await evaluate("document.activeElement.id"),
    "schedule-name",
    "Focus starts in the dialog",
  );
  await click('button[type="submit"]');
  await wait(
    "document.body.textContent.includes('Tên lịch cần ít nhất hai ký tự')",
  );
  await fill("#schedule-name", "Giờ làm việc Telesale");
  await click("#schedule-sale-00000000-0000-4000-8000-000000000001");
  await click("#schedule-day-2");
  assert.equal(
    await evaluate(
      "document.querySelector('#schedule-day-2').getAttribute('aria-checked')",
    ),
    "false",
  );
  const artifacts = resolve("../../artifacts/sale-work-schedules");
  await mkdir(artifacts, { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [375, 812],
    [812, 375],
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 900,
    });
    await wait("document.querySelector('[role=dialog]').clientWidth > 0");
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      `Page overflow at ${width}`,
    );
    assert.ok(
      await evaluate(
        "(()=>{const d=document.querySelector('[role=dialog]');return d.scrollWidth<=d.clientWidth+1})()",
      ),
      `Dialog overflow at ${width}`,
    );
    const shot = await command("Page.captureScreenshot", {
      captureBeyondViewport: true,
    });
    await writeFile(
      resolve(artifacts, `form-${width}.png`),
      Buffer.from(shot.data, "base64"),
    );
  }
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
  });
  assert.ok(
    await evaluate(
      "document.querySelector('[role=dialog]').contains(document.activeElement)",
    ),
  );
  await click('button[type="submit"]');
  await wait("window.scheduleSaves.length === 1");
  const saved = await evaluate("window.scheduleSaves[0]");
  assert.equal(saved.name, "Giờ làm việc Telesale");
  assert.equal(saved.saleIds.length, 1);
  assert.equal(saved.calendar.days[2].shifts.length, 0);
  assert.equal(saved.calendar.days[1].shifts[0].start, "08:00");
  await wait("document.body.textContent.includes('Đã đóng biểu mẫu')");
  console.log(
    "PASS: Vietnamese validation, Sale selection, day toggle, form save, keyboard focus, reduced motion, desktop/375px/landscape layout",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
