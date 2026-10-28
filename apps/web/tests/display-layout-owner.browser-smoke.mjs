import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";
const temp = await mkdtemp(resolve(tmpdir(), "crm-owner-dropdown-"));
const outDir = resolve(temp, "dist");
const user = {
  id: "owner-manager",
  fullName: "Quản lý fixture",
  email: "fixture@example.test",
  roles: [],
  permissions: ["system.manage"],
  accessScope: "DEPARTMENT",
  departmentIds: ["dept-1"],
  institutionProgramIds: ["program-1"],
};
const requests = [];
let failOnce = true,
  browser,
  server;
function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
try {
  await build({
    root: process.cwd(),
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: {
        input: resolve("tests/display-layout-owner-smoke.html"),
      },
    },
  });
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/auth/refresh")
      return json(res, { accessToken: "fixture-access", expiresIn: 900, user });
    if (url.pathname === "/api/auth/me") return json(res, { user });
    if (url.pathname === "/api/institution-programs/options")
      return json(res, {
        data: [
          {
            id: "program-1",
            name: "Chương trình fixture",
            institutionName: "Trường fixture",
          },
        ],
      });
    if (url.pathname === "/api/display-layouts/targets") {
      requests.push(Object.fromEntries(url.searchParams));
      if (failOnce) {
        failOnce = false;
        return json(res, { message: "Fixture temporary error" }, 503);
      }
      const search = url.searchParams.get("search") ?? "";
      if (search === "không tồn tại")
        return json(res, { data: [], totalPages: 1 });
      if (search)
        return json(res, {
          data: [{ id: "dept-2", name: "Phòng Tuyển sinh" }],
          totalPages: 1,
        });
      const nextPage = url.searchParams.get("page") === "2";
      return json(res, {
        data: [
          {
            id: nextPage ? "dept-2" : "dept-1",
            name: nextPage ? "Phòng Tuyển sinh" : "Phòng Kinh doanh",
          },
        ],
        totalPages: 2,
      });
    }
    if (url.pathname.startsWith("/api/"))
      return json(res, { message: "Unknown route" }, 404);
    const file = resolve(outDir, `.${url.pathname}`);
    if (!file.startsWith(outDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(file)
      ] ?? "application/octet-stream",
    );
    createReadStream(file)
      .on("error", () => {
        res.statusCode = 404;
        res.end();
      })
      .pipe(res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.fetch=((original)=>(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return original(url.pathname.startsWith('/api/')?location.origin+url.pathname+url.search:input,init)})(window.fetch.bind(window))",
  });
  const url = `http://127.0.0.1:${server.address().port}/tests/display-layout-owner-smoke.html`;
  await browser.command("Page.navigate", { url });
  await browser.wait(
    "document.body.textContent.includes('Không tải được phòng ban.')",
  );
  assert.equal(
    await browser.evaluate(
      "Boolean(document.querySelector('#layout-owner-search'))",
    ),
    false,
    "Search belongs inside the dropdown.",
  );
  await browser.click("#display-layout-owner");
  await browser.wait("document.querySelector('[data-slot=popover-content]')");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[data-slot=popover-content] button')).find(button=>button.textContent==='Thử lại').click()",
  );
  await browser.wait(
    "document.querySelector('[role=option]')?.textContent.includes('Phòng Kinh doanh')",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[data-slot=popover-content] button')).find(button=>button.textContent==='Sau').click()",
  );
  await browser.wait(
    "document.querySelector('[role=option]')?.textContent.includes('Phòng Tuyển sinh')",
  );
  await browser.fill('[aria-label="Tìm phòng ban sở hữu mẫu"]', "Tuyển sinh");
  await browser.wait(
    "document.querySelector('[role=option]')?.textContent.includes('Phòng Tuyển sinh') && !document.querySelector('[role=listbox][aria-busy=true]')",
  );
  await browser.key("ArrowDown", "ArrowDown", 0, 40);
  await browser.key("Enter", "Enter", 0, 13);
  await browser.wait(
    "document.querySelector('#owner-value').textContent==='dept-2' && !document.querySelector('[data-slot=popover-content]')",
  );
  assert.ok(
    await browser.evaluate(
      "document.querySelector('#display-layout-owner').textContent.includes('Phòng Tuyển sinh')",
    ),
  );
  await browser.click("#display-layout-owner");
  await browser.fill(
    '[aria-label="Tìm phòng ban sở hữu mẫu"]',
    "không tồn tại",
  );
  await browser.wait(
    "document.querySelector('[data-slot=popover-content]').textContent.includes('Không có phòng ban phù hợp')",
  );
  await browser.key("Escape", "Escape", 0, 27);
  await browser.wait("!document.querySelector('[data-slot=popover-content]')");
  assert.ok(
    await browser.evaluate(
      "document.querySelector('#display-layout-owner').textContent.includes('Phòng Tuyển sinh')",
    ),
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await browser.click("#display-layout-owner");
  await browser.wait("document.querySelector('[role=option]')");
  assert.ok(
    await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),
  );
  await browser.wait(
    "getComputedStyle(document.querySelector('[data-slot=popover-content]')).opacity==='1'",
  );
  const artifacts = resolve("../../artifacts/display-layout");
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    resolve(artifacts, "owner-dropdown-mobile.png"),
    Buffer.from(
      (
        await browser.command("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        })
      ).data,
      "base64",
    ),
  );
  assert.ok(
    requests.every(
      (request) => request.purpose === "OWNER" && request.type === "DEPARTMENT",
    ),
  );
  assert.ok(requests.some((request) => request.page === "2"));
  assert.ok(
    requests.some(
      (request) => request.search === "Tuyển sinh" && request.page === "1",
    ),
  );
  console.log(
    "PASS owner dropdown: retry, server search, paging, keyboard select, retained label, empty state, mobile",
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(temp, { recursive: true, force: true });
}
