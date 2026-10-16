import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const temp = await mkdtemp(resolve(tmpdir(), "crm-display-layout-")),
  outDir = resolve(temp, "dist");
const user = {
  id: "fixture-user",
  fullName: "Quản lý kiểm thử",
  email: "fixture@example.test",
  roles: [],
  permissions: ["system.manage", "lead.view_all"],
  accessScope: "ALL",
  departmentIds: [],
  institutionProgramIds: ["program-1"],
};
let layout = {
  id: "layout-1",
  screen: "LEAD_LIST",
  revision: 1,
  managementDepartmentId: null,
  draft: {
    name: "Mẫu kiểm thử",
    visibleFields: ["fullName", "phone", "source"],
    targets: [{ type: "DEFAULT", id: "default" }],
  },
  published: null,
  publishedVersion: 0,
};
let customerLayout = {
  ...structuredClone(layout),
  id: "customer-layout",
  screen: "CUSTOMER_LIST",
  publishedVersion: 1,
  draft: {
    name: "Mẫu khách hàng riêng",
    visibleFields: ["fullName", "email", "source"],
    targets: [{ type: "DEFAULT", id: "default" }],
    personalization: {
      visibility: true,
      order: true,
      pinning: true,
      widths: true,
    },
  },
};
customerLayout.published = structuredClone(customerLayout.draft);
let customerPersonal = null,
  customerPersonalRevision = 0;
let personal = null,
  personalRevision = 0;
function effective(screen = "LEAD_LIST") {
  const template = screen === "CUSTOMER_LIST" ? customerLayout : layout;
  const preference = screen === "CUSTOMER_LIST" ? customerPersonal : personal;
  const draft = template.published ?? template.draft;
  const inherited = {
    visibleFields: draft.visibleFields,
    pinnedFields: draft.pinnedFields ?? [],
    columnWidths: draft.columnWidths ?? {},
  };
  const policy = draft.personalization ?? {
    visibility: false,
    order: false,
    pinning: false,
    widths: false,
  };
  const personalized = Boolean(
    preference &&
      preference.version === template.publishedVersion &&
      Object.values(policy).some(Boolean),
  );
  return {
    ...(personalized ? preference.presentation : inherited),
    inherited,
    policy,
    personalized,
    personalizationStale: Boolean(preference && !personalized),
    baseTemplateId: template.id,
    baseVersion: template.publishedVersion,
    personalRevision:
      screen === "CUSTOMER_LIST" ? customerPersonalRevision : personalRevision,
    name: draft.name,
    source: "DEFAULT",
    ambiguousDepartment: false,
  };
}
const versions = [],
  requests = [],
  unknown = [];
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(value));
};
let server, browser;
try {
  await build({
    root: process.cwd(),
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: { input: resolve("tests/display-layout-smoke.html") },
    },
  });
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT",
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
      requests.push({
        path: url.pathname,
        method: req.method,
        body,
        search: url.search,
      });
      if (url.pathname === "/api/customer-lists/list-1")
        return json(res, {
          id: "list-1",
          name: "Danh sách khách hàng mẫu",
          filterDescription: "Khách hàng thuộc danh sách kiểm thử",
        });
      if (url.pathname === "/api/auth/refresh")
        return json(res, {
          accessToken: "fixture-access",
          expiresIn: 900,
          user,
        });
      if (url.pathname === "/api/auth/me") return json(res, { user });
      if (url.pathname === "/api/institution-programs/options")
        return json(res, {
          data: [
            {
              id: "program-1",
              name: "Chương trình mẫu",
              institutionName: "Trường mẫu",
            },
          ],
        });
      if (url.pathname === "/api/display-layouts")
        return json(res, {
          data: [
            url.searchParams.get("screen") === "CUSTOMER_LIST"
              ? customerLayout
              : layout,
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        });
      if (url.pathname === "/api/display-layouts/targets")
        return json(res, { data: [], totalPages: 1 });
      if (url.pathname === "/api/display-layouts/effective")
        return json(res, effective(url.searchParams.get("screen")));
      if (url.pathname === "/api/display-layouts/personal") {
        if (url.searchParams.get("screen") === "CUSTOMER_LIST") {
          customerPersonal = {
            presentation: body.presentation,
            version: customerLayout.publishedVersion,
          };
          customerPersonalRevision++;
          return json(res, effective("CUSTOMER_LIST"));
        }
        personal = {
          presentation: body.presentation,
          version: body.baseVersion,
        };
        personalRevision++;
        return json(res, effective());
      }
      if (url.pathname === "/api/display-layouts/personal/reset") {
        if (url.searchParams.get("screen") === "CUSTOMER_LIST") {
          customerPersonal = null;
          customerPersonalRevision++;
          return json(res, effective("CUSTOMER_LIST"));
        }
        personal = null;
        personalRevision++;
        return json(res, effective());
      }
      if (url.pathname === "/api/display-layouts/customer-layout/draft") {
        customerLayout = {
          ...customerLayout,
          draft: body.draft,
          revision: customerLayout.revision + 1,
        };
        return json(res, customerLayout);
      }
      if (url.pathname === "/api/display-layouts/customer-layout/preview")
        return json(res, {
          departments: 0,
          users: 12,
          overriddenUsers: 0,
          replacedAssignments: 0,
          assignmentRevision: 0,
        });
      if (url.pathname === "/api/display-layouts/customer-layout/publish") {
        customerLayout = {
          ...customerLayout,
          published: structuredClone(customerLayout.draft),
          revision: customerLayout.revision + 1,
          publishedVersion: customerLayout.publishedVersion + 1,
        };
        return json(res, customerLayout);
      }
      if (url.pathname === "/api/display-layouts/customer-layout")
        return json(res, {
          ...customerLayout,
          versions: [],
          versionPage: 1,
          versionPages: 1,
          assignments: customerLayout.published.targets,
        });
      if (url.pathname === "/api/display-layouts/layout-1/draft") {
        layout = {
          ...layout,
          draft: body.draft,
          revision: layout.revision + 1,
        };
        return json(res, layout);
      }
      if (url.pathname === "/api/display-layouts/layout-1/preview")
        return json(res, {
          departments: 0,
          users: 18,
          overriddenUsers: 2,
          replacedAssignments: 1,
          assignmentRevision: 0,
        });
      if (url.pathname === "/api/display-layouts/layout-1/publish") {
        layout = {
          ...layout,
          published: structuredClone(layout.draft),
          publishedVersion: layout.publishedVersion + 1,
          revision: layout.revision + 1,
        };
        versions.unshift({
          version: layout.publishedVersion,
          name: layout.draft.name,
          visibleFields: layout.draft.visibleFields,
          actorName: user.fullName,
          createdAt: new Date().toISOString(),
        });
        return json(res, layout);
      }
      if (url.pathname === "/api/display-layouts/layout-1")
        return json(res, {
          ...layout,
          versions,
          versionPage: 1,
          versionPages: 1,
          assignments: layout.published?.targets ?? [],
        });
      if (
        url.pathname === "/api/leads" ||
        url.pathname === "/api/customer-lists/list-1/leads"
      )
        return json(res, {
          data: [
            {
              id: "lead-1",
              fullName: "Nguyễn Văn Minh",
              phone: "0900000000",
              email: "example@example.test",
              source: { id: "s", name: "Website" },
              pipelineStage: null,
              assignee: null,
              dateOfBirth: null,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      if (url.pathname === "/api/leads/options")
        return json(res, {
          sources: [],
          stages: [],
          majors: [],
          telesales: [],
          totalLeads: 1,
        });
      if (url.pathname === "/api/leads/action-options")
        return json(res, {
          sources: [],
          stages: [],
          majors: [],
          telesales: [],
        });
      unknown.push(url.pathname);
      return json(res, { message: "Unknown fixture route" }, 404);
    }
    const file = resolve(outDir, `.${url.pathname}`);
    if (!file.startsWith(outDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      await readFile(file);
      res.setHeader(
        "Content-Type",
        { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
          extname(file)
        ] ?? "application/octet-stream",
      );
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  browser = await openSmokeBrowser(resolve(temp, "profile"));
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.command("Runtime.addBinding", { name: "fixtureError" });
  await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.addEventListener('error',e=>console.error(e.message)); window.fetch=((original)=> (input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.startsWith('/api/'))return original(location.origin+url.pathname+url.search,init);return original(input,init)})(window.fetch.bind(window));`,
  });
  await browser.command("Page.navigate", {
    url: `http://127.0.0.1:${port}/tests/display-layout-smoke.html`,
  });
  await browser.wait("document.querySelector('#display-layout-name')");
  await browser.wait(
    "document.querySelectorAll('section[aria-label=\"Vùng thả đang hiển thị\"] [data-field-key]').length===3",
  );
  const visible = () =>
    browser.evaluate(
      "Array.from(document.querySelectorAll('section[aria-label=\"Vùng thả đang hiển thị\"] [data-field-key]')).map(e=>e.dataset.fieldKey)",
    );
  assert.deepEqual(await visible(), ["fullName", "phone", "source"]);
  const panelKeys = (show) =>
    browser.evaluate(
      `Array.from(document.querySelectorAll('section[aria-label="Vùng thả ${show ? "đang" : "chưa"} hiển thị"] [data-field-key]')).map(e=>e.dataset.fieldKey)`,
    );
  await browser.evaluate(
    "const select=document.querySelector('#hidden-field-group');select.value='education';select.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await browser.wait(
    "document.querySelector('[aria-label=\"Kéo trường Năm tốt nghiệp\"]')",
  );
  assert.ok((await panelKeys(false)).includes("graduationYear"));
  assert.ok(!(await panelKeys(false)).includes("email"));
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xóa bộ lọc trường').click()",
  );
  await browser.fill("#field-search-false", "noi cap");
  await browser.wait(
    "document.querySelector('#choose-field-diplomaIssuePlace')",
  );
  assert.deepEqual(
    (await panelKeys(false)).sort(),
    ["cccdIssuePlace", "diplomaIssuePlace"].sort(),
  );
  await browser.click("#choose-field-cccdIssuePlace");
  await browser.click("#choose-field-diplomaIssuePlace");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Hiện 2 trường đã chọn').click()",
  );
  assert.ok((await visible()).includes("diplomaIssuePlace"));
  await browser.click("#choose-field-cccdIssuePlace");
  await browser.click("#choose-field-diplomaIssuePlace");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Ẩn 2 trường đã chọn').click()",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xóa bộ lọc trường').click()",
  );
  assert.deepEqual(await visible(), ["fullName", "phone", "source"]);
  assert.ok(
    await browser.evaluate(
      "document.querySelector('#choose-field-fullName').disabled",
    ),
  );
  await browser.evaluate(
    "document.querySelector('[data-testid=display-field-editor]').scrollIntoView({block:'start'})",
  );
  await writeFile(
    resolve("../../artifacts/display-layout/editor-desktop.png"),
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
    await browser.evaluate(
      "(()=>{const bar=document.querySelector('[data-testid=layout-save-bar]').getBoundingClientRect();return bar.bottom<=innerHeight+1 && bar.top>=0})()",
    ),
  );
  // Native mouse drag uses the actual browser DataTransfer and handlers.
  const point = (selector, scroll = true) =>
    browser.evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});${scroll ? "e.scrollIntoView({block:'center'});" : ""}const r=e.getBoundingClientRect();return {x:r.x+Math.min(30,r.width/2),y:r.y+r.height/2}})()`,
    );
  await browser.command("Input.setInterceptDrags", { enabled: false });
  const from = await point('[aria-label="Kéo trường Email"]');
  await browser.command("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...from,
  });
  await browser.command("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...from,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let i = 1; i <= 8; i++) {
    await browser.command("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + i * 5,
      y: from.y + i * 3,
      button: "left",
      buttons: 1,
    });
    await delay(25);
  }
  const to = await point('[data-field-key="phone"]', false);
  for (let i = 0; i < 4; i++) {
    await browser.command("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: to.x + (i % 2),
      y: to.y + (i % 2),
      button: "left",
      buttons: 1,
    });
    await delay(50);
  }
  await browser.command("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...to,
    button: "left",
    clickCount: 1,
  });
  await browser.wait(
    'document.querySelector(\'section[aria-label="Vùng thả đang hiển thị"] [data-field-key="email"]\')',
  );
  assert.deepEqual(await visible(), ["fullName", "email", "phone", "source"]);
  await browser.click('[aria-label="Đưa Email lên"]');
  assert.deepEqual(await visible(), ["email", "fullName", "phone", "source"]);
  await browser.evaluate(
    "document.querySelector('[data-testid=layout-live-preview]').open=true",
  );
  await browser.wait(
    "document.querySelector('[data-testid=layout-live-preview] thead')",
  );
  assert.deepEqual(
    await browser.evaluate(
      "Array.from(document.querySelectorAll('[data-testid=layout-live-preview] thead th')).map(e=>e.textContent.trim())",
    ),
    ["Email", "Họ và tên", "Số điện thoại", "Nguồn học viên"],
  );
  await browser.evaluate(
    "document.querySelector('[data-testid=layout-live-preview]').open=false",
  );
  await browser.fill("#field-search-true", "Email");
  assert.equal(
    await browser.evaluate(
      "document.querySelector('[aria-label=\"Kéo trường Email\"]').disabled",
    ),
    true,
  );
  await browser.fill("#field-search-true", "");
  await browser.click("#fixture-leads");
  await browser.wait("document.querySelector('[role=alertdialog]')");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='Ở lại').click()",
  );
  await browser.wait("!document.querySelector('[role=alertdialog]')");
  await browser.fill("#display-layout-name", "Mẫu đã chỉnh");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('Điều chỉnh')).click()",
  );
  await browser.click("#pin-column-fullName");
  await browser.fill("#column-width-fullName", "260");
  for (const key of ["visibility", "order", "pinning", "widths"])
    await browser.click(`#personal-policy-${key}`);
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Lưu nháp').click()",
  );
  await browser.wait("document.body.textContent.includes('Đã lưu nháp.')");
  assert.equal(layout.published, null);
  assert.deepEqual(layout.draft.visibleFields, [
    "email",
    "fullName",
    "phone",
    "source",
  ]);
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xem trước và áp dụng').click()",
  );
  await browser.wait(
    "document.querySelector('[role=dialog]')?.textContent.includes('18 nhân viên')",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Áp dụng').click()",
  );
  await browser.wait(
    "document.body.textContent.includes('Đã áp dụng. Nhân viên')",
  );
  await browser.wait("!document.querySelector('[role=dialog]')");
  await browser.click("#fixture-leads");
  await browser.wait(
    "document.querySelector('header h2')?.textContent==='Danh sách lead' && document.querySelector('table caption') && !document.querySelector('[role=dialog]') && document.querySelector('tbody')?.textContent.includes('Nguyễn Văn Minh')",
  );
  assert.equal(
    await browser.evaluate(
      "document.querySelector('header [data-testid=edit-list-display-layout]')?.textContent.trim()",
    ),
    "Chỉnh sửa giao diện",
  );
  const headings = await browser.evaluate(
    "Array.from(document.querySelectorAll('thead th')).map(e=>e.textContent.trim())",
  );
  assert.deepEqual(headings.slice(2), [
    "Họ và tên",
    "Email",
    "Số điện thoại",
    "Nguồn học viên",
  ]);
  assert.deepEqual(layout.published.pinnedFields, ["fullName"]);
  assert.equal(layout.published.columnWidths.fullName, 260);
  assert.equal(
    await browser.evaluate(
      "document.querySelector('thead th:nth-child(3)').style.left",
    ),
    "104px",
  );
  assert.equal(
    await browser.evaluate(
      "document.querySelector('thead th:nth-child(3)').getBoundingClientRect().width",
    ),
    260,
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const beforeScroll = await browser.evaluate(
    "document.querySelector('thead th:nth-child(3)').getBoundingClientRect().x",
  );
  await browser.evaluate(
    "document.querySelector('[data-slot=table-container]').scrollLeft=100",
  );
  assert.ok(
    Math.abs(
      (await browser.evaluate(
        "document.querySelector('thead th:nth-child(3)').getBoundingClientRect().x",
      )) - beforeScroll,
    ) < 1,
    "Cột ghim đứng yên khi cuộn ngang",
  );
  await mkdir(resolve("../../artifacts/display-layout"), { recursive: true });
  await browser.evaluate(
    "document.querySelector('table').scrollIntoView({block:'center'})",
  );
  const desktopScreenshot = await browser.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    resolve("../../artifacts/display-layout/phase2-desktop.png"),
    Buffer.from(desktopScreenshot.data, "base64"),
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Giao diện cá nhân').click()",
  );
  await browser.wait(
    "document.querySelector('[role=dialog]')?.textContent.includes('Giao diện cá nhân')",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] [data-field-key=email] button')).find(b=>b.textContent==='Ẩn').click()",
  );
  await browser.click('[role=dialog] [aria-label="Đưa Số điện thoại lên"]');
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] summary')).find(e=>e.textContent.includes('Điều chỉnh')).click()",
  );
  await browser.click("[role=dialog] #pin-column-fullName");
  await browser.click("[role=dialog] #pin-column-phone");
  await browser.fill("[role=dialog] #column-width-phone", "180");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Lưu giao diện cá nhân').click()",
  );
  await browser.wait(
    "!document.querySelector('[role=dialog]') && document.body.textContent.includes('Đang dùng tùy chỉnh cá nhân.')",
  );
  assert.deepEqual(personal.presentation.visibleFields, [
    "phone",
    "fullName",
    "source",
  ]);
  assert.deepEqual(personal.presentation.pinnedFields, ["phone"]);
  assert.equal(personal.presentation.columnWidths.phone, 180);
  const dataHeaders = () =>
    browser.evaluate(
      "Array.from(document.querySelectorAll('thead th')).slice(2).map(e=>e.textContent.trim())",
    );
  const leadBeforeCustomerEdit = structuredClone({ layout, personal });
  for (const [link, title] of [
    ["#fixture-customers", "Danh sách khách hàng"],
    ["#fixture-customer-list", "Danh sách khách hàng mẫu"],
  ]) {
    await browser.click(link);
    await browser.wait(
      `document.querySelector('header h2')?.textContent===${JSON.stringify(title)} && document.querySelector('tbody')?.textContent.includes('Nguyễn Văn Minh')`,
    );
    assert.deepEqual(
      await dataHeaders(),
      link === "#fixture-customers"
        ? ["Họ và tên", "Email", "Nguồn học viên"]
        : ["Họ và tên", "Nguồn học viên"],
    );
    await browser.fill("#lead-search", "Nguyễn");
    await browser.click("header [data-testid=edit-list-display-layout]");
    await browser.wait(
      "document.querySelector('[data-testid=list-layout-popup]') && document.querySelector('#display-layout-name')",
    );
    assert.ok(
      await browser.evaluate(
        "document.querySelector('[data-testid=list-layout-popup]').textContent.includes('Danh sách khách hàng')",
      ),
    );
    assert.equal(
      await browser.evaluate("document.querySelector('header h2').textContent"),
      title,
    );
    if (link === "#fixture-customers") {
      await browser.command("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await browser.wait(
        "getComputedStyle(document.querySelector('[data-testid=list-layout-popup]')).opacity==='1'",
      );
      await browser.evaluate(
        "document.querySelector('[data-testid=list-layout-popup] [data-testid=display-field-editor]').scrollIntoView({block:'start'})",
      );
      assert.ok(
        await browser.evaluate(
          "(()=>{const close=document.querySelector('[aria-label=\"Đóng chỉnh sửa giao diện\"]').getBoundingClientRect();return close.top>=0 && close.bottom<=innerHeight && document.querySelector('[data-testid=list-layout-popup]').scrollTop===0})()",
        ),
        "Popup header and close control stay visible when scrolling the editor",
      );
      await writeFile(
        resolve("../../artifacts/display-layout/customer-popup-desktop.png"),
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
      await browser.command("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await browser.wait(
        "document.querySelector('[data-testid=list-layout-popup] [role=tab]')",
      );
      assert.ok(
        await browser.evaluate(
          "(()=>{const popup=document.querySelector('[data-testid=list-layout-popup]');return popup.scrollWidth<=popup.clientWidth && document.documentElement.scrollWidth<=innerWidth})()",
        ),
      );
      await writeFile(
        resolve("../../artifacts/display-layout/customer-popup-mobile.png"),
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
      await browser.command("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const writes = requests.filter((request) =>
        request.path.endsWith("/customer-layout/draft"),
      ).length;
      await browser.fill("#display-layout-name", "Bản chưa lưu");
      await browser.key("Escape", "Escape", 0, 27);
      await browser.wait("document.querySelector('[role=alertdialog]')");
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='Ở lại').click()",
      );
      await browser.wait("!document.querySelector('[role=alertdialog]')");
      assert.equal(
        await browser.evaluate(
          "document.querySelector('#display-layout-name').value",
        ),
        "Bản chưa lưu",
      );
      await browser.click('[aria-label="Đóng chỉnh sửa giao diện"]');
      await browser.wait("document.querySelector('[role=alertdialog]')");
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='Bỏ thay đổi').click()",
      );
      await browser.wait(
        "!document.querySelector('[data-testid=list-layout-popup]')",
      );
      assert.equal(
        requests.filter((request) =>
          request.path.endsWith("/customer-layout/draft"),
        ).length,
        writes,
      );
      await browser.click("header [data-testid=edit-list-display-layout]");
      await browser.wait(
        "document.querySelector('#display-layout-name')?.value==='Mẫu khách hàng riêng'",
      );
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[data-testid=list-layout-popup] [data-field-key=email] button')).find(b=>b.textContent==='Ẩn').click()",
      );
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[data-testid=list-layout-popup] button')).find(b=>b.textContent==='Lưu nháp').click()",
      );
      await browser.wait(
        "document.querySelector('[data-testid=list-layout-popup]').textContent.includes('Đã lưu nháp.')",
      );
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[data-testid=list-layout-popup] button')).find(b=>b.textContent==='Xem trước và áp dụng').click()",
      );
      await browser.wait(
        "Array.from(document.querySelectorAll('[role=dialog]')).some(dialog=>dialog.textContent.includes('12 nhân viên'))",
      );
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Áp dụng').click()",
      );
      await browser.wait(
        "document.querySelector('[data-testid=list-layout-popup]')?.textContent.includes('Đã áp dụng.') && document.querySelectorAll('[role=dialog]').length===1",
      );
      assert.deepEqual({ layout, personal }, leadBeforeCustomerEdit);
    }
    await browser.click('[aria-label="Đóng chỉnh sửa giao diện"]');
    await browser.wait(
      "!document.querySelector('[data-testid=list-layout-popup]')",
    );
    assert.equal(
      await browser.evaluate("document.querySelector('#lead-search').value"),
      "Nguyễn",
    );
    assert.equal(
      await browser.evaluate("document.querySelector('header h2').textContent"),
      title,
    );
    await browser.wait("document.querySelectorAll('thead th').length===4");
    assert.deepEqual(await dataHeaders(), ["Họ và tên", "Nguồn học viên"]);
    if (link === "#fixture-customers") {
      await browser.evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Giao diện cá nhân').click()",
      );
      await browser.wait(
        "document.querySelector('[role=dialog]')?.textContent.includes('Giao diện cá nhân')",
      );
      await browser.click(
        '[role=dialog] [aria-label="Đưa Nguồn học viên lên"]',
      );
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Lưu giao diện cá nhân').click()",
      );
      await browser.wait(
        "!document.querySelector('[role=dialog]') && document.querySelector('thead th:nth-child(3)')?.textContent==='Nguồn học viên'",
      );
      assert.deepEqual(personal, leadBeforeCustomerEdit.personal);
      assert.ok(customerPersonal);
      await browser.evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Giao diện cá nhân').click()",
      );
      await browser.wait("document.querySelector('[role=dialog]')");
      await browser.evaluate(
        "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Dùng lại mẫu quản lý').click()",
      );
      await browser.wait(
        "!document.querySelector('[role=dialog]') && document.querySelector('thead th:nth-child(3)')?.textContent==='Họ và tên'",
      );
      assert.equal(customerPersonal, null);
      assert.deepEqual(personal, leadBeforeCustomerEdit.personal);
    }
  }
  assert.ok(
    requests.some(
      (request) =>
        request.path === "/api/customer-lists/list-1/leads" &&
        new URLSearchParams(request.search).get("page") === "1",
    ),
  );
  await writeFile(
    resolve("../../artifacts/display-layout/customers-independent-layout.png"),
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
  await browser.click("#fixture-leads");
  await browser.wait(
    "document.querySelector('header h2')?.textContent==='Danh sách lead' && document.querySelector('thead th:nth-child(3)')?.style.position==='sticky'",
  );
  await browser.click("header [data-testid=edit-list-display-layout]");
  await browser.wait(
    "document.querySelector('#display-layout-name')?.value==='Mẫu đã chỉnh'",
  );
  assert.ok(
    await browser.evaluate(
      "document.querySelector('[data-testid=list-layout-popup]').textContent.includes('Danh sách lead')",
    ),
  );
  await browser.click('[aria-label="Đóng chỉnh sửa giao diện"]');
  await browser.wait(
    "!document.querySelector('[data-testid=list-layout-popup]')",
  );
  assert.equal(
    await browser.evaluate(
      "document.querySelector('thead th:nth-child(3)').getBoundingClientRect().width",
    ),
    180,
  );
  const savedWrites = requests.filter(
    (request) => request.path === "/api/display-layouts/personal",
  ).length;
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Giao diện cá nhân').click()",
  );
  await browser.wait("document.querySelector('[role=dialog]')");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] [data-field-key=source] button')).find(b=>b.textContent==='Ẩn').click()",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Đóng').click()",
  );
  await browser.wait("document.querySelector('[role=alertdialog]')");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='Bỏ thay đổi').click()",
  );
  await browser.wait(
    "!document.querySelector('[role=dialog]') && !document.querySelector('[role=alertdialog]')",
  );
  assert.equal(
    requests.filter(
      (request) => request.path === "/api/display-layouts/personal",
    ).length,
    savedWrites,
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await browser.wait(
    "document.querySelector('thead th:nth-child(3)').style.position!== 'sticky'",
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Giao diện cá nhân').click()",
  );
  await browser.wait("document.querySelector('[role=dialog]')");
  assert.equal(
    await browser.evaluate(
      "document.querySelector('[role=dialog]').scrollWidth <= document.querySelector('[role=dialog]').clientWidth",
    ),
    true,
  );
  await browser.wait(
    "getComputedStyle(document.querySelector('[role=dialog]')).opacity==='1'",
  );
  const mobileScreenshot = await browser.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    resolve("../../artifacts/display-layout/phase2-mobile.png"),
    Buffer.from(mobileScreenshot.data, "base64"),
  );
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Dùng lại mẫu quản lý').click()",
  );
  await browser.wait(
    "!document.querySelector('[role=dialog]') && !document.body.textContent.includes('Đang dùng tùy chỉnh cá nhân.')",
  );
  assert.equal(personal, null);
  for (const link of [
    "#fixture-customers",
    "#fixture-customer-list",
    "#fixture-leads",
  ]) {
    await browser.click(link);
    const expectedTitle =
      link === "#fixture-leads"
        ? "Danh sách lead"
        : link === "#fixture-customers"
          ? "Danh sách khách hàng"
          : "Danh sách khách hàng mẫu";
    await browser.wait(
      `document.querySelector('header h2')?.textContent===${JSON.stringify(expectedTitle)} && document.querySelectorAll('thead th').length===${link === "#fixture-leads" ? 6 : 4}`,
    );
    await browser.wait(
      "document.querySelector('tbody')?.textContent.includes('Nguyễn Văn Minh')",
    );
    assert.deepEqual(
      await browser.evaluate(
        "Array.from(document.querySelectorAll('thead th')).slice(2).map(e=>e.textContent.trim())",
      ),
      link === "#fixture-leads"
        ? ["Email", "Họ và tên", "Số điện thoại", "Nguồn học viên"]
        : ["Họ và tên", "Nguồn học viên"],
    );
    assert.ok(
      await browser.evaluate(
        "!document.body.textContent.includes('Đang dùng tùy chỉnh cá nhân.')",
      ),
    );
    assert.equal(
      await browser.evaluate(
        "document.querySelector('thead th:nth-child(3)').style.position==='sticky'",
      ),
      false,
    );
  }
  assert.deepEqual(
    await browser.evaluate(
      "Array.from(document.querySelectorAll('thead th')).slice(2).map(e=>e.textContent.trim())",
    ),
    ["Email", "Họ và tên", "Số điện thoại", "Nguồn học viên"],
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.click("#fixture-layouts");
  await browser.wait("document.querySelector('#display-layout-name')");
  assert.equal(
    await browser.evaluate(
      "document.querySelector('#display-layout-name').value",
    ),
    "Mẫu đã chỉnh",
  );
  await browser.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await browser.evaluate(
      "document.documentElement.scrollWidth <= innerWidth",
    ),
    true,
    "Điện thoại không tràn ngang",
  );
  await browser.evaluate(
    "document.querySelector('[data-testid=display-field-editor]').scrollIntoView({block:'start'})",
  );
  await writeFile(
    resolve("../../artifacts/display-layout/editor-mobile.png"),
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
  assert.equal(
    await browser.evaluate(
      "document.querySelector('[role=tab][aria-selected=true]')?.textContent",
    ),
    "Đang hiển thị (4)",
  );
  await browser.click('[role=tab][aria-selected="false"]');
  await browser.wait("document.querySelector('#hidden-field-group')");
  await browser.click('[role=tab][aria-selected="false"]');
  await browser.wait(
    "document.querySelector('[aria-label=\"Đưa Email xuống\"]')",
  );
  await browser.evaluate(
    "document.querySelector('[aria-label=\"Đưa Email xuống\"]').scrollIntoView({block:'center'});document.querySelector('[aria-label=\"Đưa Email xuống\"]').focus()",
  );
  assert.equal(
    await browser.evaluate(
      "document.activeElement?.getAttribute('aria-label')",
    ),
    "Đưa Email xuống",
  );
  await browser.key(" ", "Space", 0, 32);
  await browser.wait(
    "document.querySelector('section[aria-label=\"Vùng thả đang hiển thị\"] [data-field-key]')?.dataset.fieldKey==='fullName'",
  );
  assert.deepEqual(await visible(), ["fullName", "email", "phone", "source"]);
  await browser.command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await browser.evaluate("document.documentElement.classList.add('dark')");
  await browser.evaluate(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  await mkdir(resolve("../../artifacts/display-layout"), { recursive: true });
  const screenshot = await browser.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    resolve("../../artifacts/display-layout/mobile-dark.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  await browser.click("#fixture-leads");
  await browser.wait("document.querySelector('[role=alertdialog]')");
  await browser.evaluate(
    "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(button=>button.textContent.includes('Bỏ thay đổi')).click()",
  );
  await browser.wait(
    "document.querySelector('header h2')?.textContent==='Danh sách lead'",
  );
  for (const [permissions, accessScope] of [
    [["lead.view_all"], "ALL"],
    [["system.manage", "lead.view_all"], "READ_ONLY"],
  ]) {
    user.permissions = permissions;
    user.accessScope = accessScope;
    await browser.command("Page.reload");
    await browser.wait("document.querySelector('#display-layout-name')");
    await browser.click("#fixture-leads");
    await browser.wait(
      "document.querySelector('header h2')?.textContent==='Danh sách lead'",
    );
    assert.equal(
      await browser.evaluate(
        "Boolean(document.querySelector('[data-testid=edit-list-display-layout]'))",
      ),
      false,
    );
  }
  assert.deepEqual(unknown, []);
  console.log(
    "PASS browser: native drag, filters, bulk show/hide, preview, popup close/discard/save/publish without navigation, preserved search, independent lead/customer layouts and preferences, pinning, widths, mobile tabs, keyboard, permissions, theme",
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (!temp.startsWith(resolve(tmpdir(), "crm-display-layout-")))
    throw new Error("Unexpected cleanup path");
  await rm(temp, { recursive: true, force: true });
}
