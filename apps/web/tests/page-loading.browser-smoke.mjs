import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const root = process.cwd();
const temporary = await mkdtemp(resolve(tmpdir(), "crm-page-loading-"));
const outDir = resolve(temporary, "dist");
const artifacts = resolve(root, "../../artifacts/page-skeleton");
const pending = [];
const requests = [];
let browser;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/fixture-")) {
    requests.push(url.pathname + url.search);
    pending.push({ url, response });
    return;
  }
  const file = url.pathname.startsWith("/assets/")
    ? resolve(outDir, "." + url.pathname)
    : resolve(outDir, "tests/page-loading-smoke.html");
  response.setHeader("Content-Type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[extname(file)] ?? "application/octet-stream");
  createReadStream(file).on("error", () => response.writeHead(404).end()).pipe(response);
});

function release(predicate, status = 200) {
  const matches = pending.filter(({ url }) => predicate(url));
  assert.ok(matches.length, "Phải có request đang chờ để kiểm tra trạng thái tải.");
  for (const item of matches) {
    pending.splice(pending.indexOf(item), 1);
    item.response.writeHead(status, { "Content-Type": "application/json" });
    item.response.end(JSON.stringify({ ready: true }));
  }
}

try {
  await build({ root, logLevel: "error", build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tests/page-loading-smoke.html") } } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await openSmokeBrowser(resolve(temporary, "profile"));
  const { command, evaluate, wait, click, fill } = browser;
  const go = async (path) => {
    await command("Page.navigate", { url: origin + path });
    await wait("document.querySelector('#root')?.childElementCount > 0");
  };
  const skeleton = "document.querySelector('[data-page-skeleton]')";
  await mkdir(artifacts, { recursive: true });
  const screenshot = async (name) => {
    const { data } = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(artifacts, name + ".png"), Buffer.from(data, "base64"));
  };

  await go("/");
  await wait(skeleton);
  assert.equal(await evaluate(`${skeleton}.dataset.pageSkeleton`), "lead-list");
  assert.equal(await evaluate(`${skeleton}.getAttribute('aria-busy')`), "true");
  assert.equal(await evaluate("Boolean(document.querySelector('#draft'))"), false);
  await screenshot("list-desktop");
  release((url) => url.pathname === "/fixture-data");
  await wait("document.querySelector('#ready')");
  await fill("#draft", "Bản nháp được giữ nguyên");
  await click("#refresh");
  await wait("document.querySelector('#fetching')");
  assert.equal(await evaluate(`Boolean(${skeleton})`), false, "Refetch không thay nội dung bằng skeleton toàn trang.");
  assert.equal(await evaluate("document.querySelector('#draft').value"), "Bản nháp được giữ nguyên");
  release((url) => url.pathname === "/fixture-data");
  await wait("!document.querySelector('#fetching')");

  await click("#next");
  await wait("document.querySelector('#fetching')");
  assert.equal(await evaluate(skeleton), null, "Đổi trang giữ bộ lọc và nội dung nhập mounted.");
  assert.equal(await evaluate("document.querySelector('#draft').value"), "Bản nháp được giữ nguyên");
  release((url) => url.pathname === "/fixture-data");
  await wait("!document.querySelector('#fetching')");

  await click("#collapse");
  await evaluate("window.originalSidebar = document.querySelector('#sidebar'); window.originalTopbar = document.querySelector('#topbar'); true");
  await click("#to-lazy");
  await wait("location.pathname === '/sale/leads' && document.querySelector('[data-page-skeleton]')");
  assert.equal(await evaluate("document.querySelector('#sidebar') === window.originalSidebar && document.querySelector('#topbar') === window.originalTopbar"), true, "Chuyển route phải giữ nguyên khung điều hướng.");
  assert.equal(await evaluate("document.querySelector('#sidebar').dataset.collapsed"), "true");
  assert.equal(await evaluate(`${skeleton}.dataset.pageSkeleton`), "lead-list");
  release((url) => url.pathname === "/fixture-lazy");
  await wait("document.querySelector('#next')");
  assert.equal(await evaluate(`${skeleton}.dataset.pageSkeleton`), "lead-list", "Chunk và dữ liệu dùng cùng mẫu skeleton.");
  release((url) => url.pathname === "/fixture-data");
  await wait("document.querySelector('#ready')");

  const beforeCached = requests.length;
  await click("#to-cached");
  await wait("location.pathname === '/cached' && document.querySelector('#ready')");
  assert.equal(await evaluate(skeleton), null, "Dữ liệu trong cache hiển thị ngay.");
  assert.equal(requests.length, beforeCached);

  await go("/disabled");
  await wait("document.querySelector('#ready')");
  assert.equal(await evaluate(skeleton), null, "Query disabled không làm trang loading vô hạn.");
  await go("/error");
  await wait(skeleton);
  release((url) => url.pathname === "/fixture-data", 500);
  await wait("document.querySelector('#error')");
  assert.equal(await evaluate(skeleton), null, "Lỗi phải kết thúc skeleton.");

  await go("/forms/public-key?embed=1");
  await wait(skeleton);
  assert.equal(await evaluate(`${skeleton}.dataset.pageSkeleton`), "public-form");
  assert.equal(await evaluate("document.querySelector('main').classList.contains('min-h-170')"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('#sidebar'))"), false);
  release((url) => url.pathname === "/fixture-lazy");
  await wait("document.querySelector('#next')");
  release((url) => url.pathname === "/fixture-data");
  await wait("document.querySelector('#ready')");

  await go("/gallery");
  const variants = ["list", "lead-list", "detail", "dashboard", "settings", "cards", "builder", "public-form", "session"];
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-page-skeleton]')].map(e=>e.dataset.pageSkeleton)"), variants);
  const routeCases = {
    "/sale/leads": "lead-list",
    "/marketing/danh-sach-khach-hang/lead-1": "detail",
    "/marketing/quan-ly-danh-sach/list-1": "lead-list",
    "/marketing/form-survey/form-1": "settings",
    "/automations/rule-1/builder": "builder",
    "/automations/monitoring": "list",
    "/bao-cao/tong-hop": "dashboard",
    "/marketing/cau-hinh-truong": "settings",
    "/quan-ly/cau-hinh-hien-thi": "settings",
    "/marketing/kenh-ket-noi": "cards",
    "/marketing/kenh-ket-noi/meta": "settings",
    "/sinh-vien/danh-sach/": "list",
    "/bieu-mau/public-key": "public-form",
    "/dang-nhap": "session",
  };
  for (const [path, expected] of Object.entries(routeCases)) {
    assert.equal(await evaluate(`window.classifySkeleton(${JSON.stringify(path)})`), expected, path);
  }
  for (const width of [375, 768, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `Không được tràn ngang ở ${width}px.`);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-page-skeleton]')].some(e=>e.querySelector('button,input,a,select,textarea,[tabindex]'))"), false, "Skeleton không tạo điểm Tab giả.");
    await screenshot(`gallery-${width}`);
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-slot=skeleton]')).animationName"), "none");
  console.log("PASS: initial load, cache, disabled/error queries, refetch, pagination, draft preservation, lazy route shell, embed, 9 layouts, 14 route mappings, 3 viewport widths, reduced motion.");
} finally {
  for (const { response } of pending) response.end();
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise((done) => server.close(done));
  assert.ok(temporary.startsWith(resolve(tmpdir(), "crm-page-loading-")));
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
