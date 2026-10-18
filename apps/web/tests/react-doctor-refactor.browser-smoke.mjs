import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "vite";
import { openSmokeBrowser } from "./browser-smoke-driver.mjs";

const root = process.cwd(),
  temporary = await mkdtemp(resolve(tmpdir(), "crm-refactor-")),
  outDir = resolve(temporary, "dist");
const requests = [],
  writes = [],
  unknown = [];
const permissions = [
  "lead.create",
  "lead.update_all",
  "lead.assign",
  "lead.delete",
  "admission.update",
  "admission.approve",
  "admission_status.update",
  "admission_document.upload",
  "admission_fee.update",
  "automation.manage",
  "integration.manage",
  "integration.log.view",
];
const user = {
  id: "fixture",
  email: "fixture@example.test",
  fullName: "Fixture",
  avatarUrl: null,
  roles: [],
  permissions,
  accessScope: "ALL",
  departmentIds: [],
  institutionProgramIds: [],
};
const program = {
  id: "program-1",
  name: "Chương trình mẫu",
  institutionName: "Trường mẫu",
};
const source = { id: "source-1", name: "Nguồn mẫu" };
const lead = (n) => ({
  id: `lead-${n}`,
  fullName: `Ứng viên ${n}`,
  leadCode: `LD${n}`,
  phone: "0901234567",
  createdAt: "2026-10-01T00:00:00Z",
  dateOfBirth: null,
  pipelineStage: null,
  lifecycleStatus: { value: "ACTIVE", label: "?ang x? l?", changedAt: null },
  secondaryPhones: [],
  secondaryAssignee: null,
  tags: "",
  source,
  assignee: null,
});
const profile = (n) => ({
  id: `profile-${n}`,
  admissionCode: `HS${n}`,
  createdAt: "2026-10-01T00:00:00Z",
  lead: lead(n),
  institutionProgram: program,
  major: { id: "major-1", name: "Ngành mẫu" },
  status: { id: "status-1", name: "Tiếp nhận", color: null },
  student: null,
  classCode: `LOP${n}`,
  applicationReceivedDate: "2026-10-03T00:00:00Z",
});
const statuses = [1, 2, 3].map((n) => ({
  id: `status-${n}`,
  name: `Trạng thái ${n}`,
  code: `S${n}`,
  color: null,
  profileCount: 0,
  createdAt: "2026-10-01T00:00:00Z",
}));
let flow = { "status-1": ["status-2"] };
const options = {
  sources: [source],
  leadSources: [source],
  stages: [],
  telesales: [{ id: "sale-1", fullName: "Sale mẫu" }],
  assignees: [],
  majors: [{ id: "major-1", name: "Ngành mẫu" }],
  institutionPrograms: [program],
  admissionStatuses: statuses,
  statuses,
  leads: [lead(1)],
  classes: [],
  tags: [],
  totalLeads: 21,
  failedLeads: 0,
  customFields: [],
  systemFieldRequirements: { fullName: true, phone: true, sourceId: true },
};
const pagination = (url) => ({
  page: Number(url.searchParams.get("page") || 1),
  limit: 20,
  total: 21,
  totalPages: 2,
});
const execution = {
  id: "execution-1",
  rule: { id: "rule-1", name: "Rule mẫu" },
  status: "failed",
  source: "event",
  version: 2,
  nodeExecutionCount: 1,
  startedAt: "2026-10-01T00:00:00Z",
  contextData: { fixture: true },
  nodes: [],
  errorMessage: "Lỗi thử nghiệm",
};
const versions = [
  { id: "version-1", version: 1, isCurrent: false, changes: null },
  { id: "version-2", version: 2, isCurrent: true, changes: null },
];
const connection = {
  id: "meta-1",
  pageId: "page-1",
  pageName: "Page mẫu",
  status: "active",
  lastError: null,
  webhookSubscribedAt: null,
  lastCheckedAt: null,
};
const json = (response, data, status = 200) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
};
const readBody = async (request) => {
  const chunks = [];
  for await (const c of request) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
};
let server, browser;
try {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost"),
      path = url.pathname;
    if (path.startsWith("/api/")) {
      requests.push({
        method: request.method,
        path,
        query: Object.fromEntries(url.searchParams),
      });
      if (path === "/api/auth/me") return json(response, { user });
      if (["/api/auth/refresh", "/api/auth/login"].includes(path))
        return json(response, {
          user,
          accessToken: "fixture-only",
          sessionId: "fixture",
          expiresIn: 900,
          rememberDevice: true,
        });
      if (request.method !== "GET") {
        const body = await readBody(request);
        writes.push({ path, body, method: request.method });
        if (path === "/api/admissions/statuses/flow") {
          flow = { ...flow, [body.fromStatusId]: body.toStatusIds };
          return json(response, body);
        }
        if (
          path.endsWith("/retry") ||
          path.endsWith("/replay") ||
          path.endsWith("/rollback")
        )
          return json(response, {
            id: "rule-1",
            executionId: "execution-1",
            version: 3,
            queued: [],
            skipped: [],
          });
        if (path === "/api/integrations/meta/meta-1/test")
          return json(response, { ok: true, connection });
        if (path === "/api/leads/lead-1/assign")
          return json(response, { id: "lead-1" });
        return json(response, { message: "Lỗi lưu fixture" }, 503);
      }
      if (path === "/api/display-layouts/effective") return json(response, { name: "M?c ??nh", baseTemplateId: null, visibleFields: ["fullName", "phone", "source", "assignee", "createdAt"], pinnedFields: [], columnWidths: {} });
      if (path === "/api/institution-programs/options")
        return json(response, { data: [{ ...program, code: "P1" }] });
      if (path === "/api/admissions/fees/options")
        return json(response, { statuses: ["pending", "paid"] });
      if (path === "/api/admissions/documents/options")
        return json(response, {
          statuses: ["pending", "approved"],
          types: ["Học bạ"],
        });
      if (path.endsWith("/options") || path.endsWith("/action-options"))
        return json(response, options);
      if (path === "/api/leads/custom-fields")
        return json(response, { fields: [] });
      if (path === "/api/leads/lead-1/transition-note-options") {
        assert.equal(url.searchParams.get("target"), "stage-2");
        return json(response, {
          target: "stage-2",
          label: "Giai đoạn mới",
          templates: [{ id: "note-1", content: "Ghi chú mẫu" }],
        });
      }
      if (
        path === "/api/custom-fields/runtime/ADMISSION_MAJOR" &&
        url.searchParams.get("entityId") === "fixture-runtime"
      )
        return json(response, {
          fields: [
            {
              id: "runtime-text",
              code: "runtime_text",
              name: "Ghi chú thử nghiệm",
              description: null,
              group: {
                id: "basic",
                key: "basic",
                label: "Cơ bản",
                description: null,
                isSystem: true,
                displayOrder: 0,
              },
              dataType: "TEXT",
              isRequired: false,
              isSensitive: false,
              displayOrder: 0,
              options: null,
              validationRules: null,
              defaultValue: "Mặc định",
              value: null,
              canView: true,
              canEdit: true,
            },
          ],
        });
      if (path.startsWith("/api/custom-fields/runtime/"))
        return json(response, { fields: [] });
      if (path === "/api/leads")
        return json(response, {
          data: [lead(pagination(url).page)],
          pagination: pagination(url),
        });
      if (path === "/api/admissions")
        return json(response, {
          data: [profile(pagination(url).page)],
          pagination: pagination(url),
        });
      if (path === "/api/admissions/fees")
        return json(response, {
          data: [
            {
              id: "fee-1",
              admissionCode: "HS1",
              candidateName: "Ứng viên 1",
              majorName: "Ngành mẫu",
              feeStatus: "pending",
              tuitionStatus: "pending",
              monthlyRevenue: "100000",
              createdAt: "2026-10-01T00:00:00Z",
            },
          ],
          pagination: pagination(url),
        });
      if (path === "/api/admissions/statuses")
        return json(response, { data: statuses, pagination: pagination(url) });
      if (path === "/api/admissions/statuses/flow")
        return json(response, { statuses, flow });
      if (path === "/api/admissions/documents")
        return json(response, {
          data: [
            {
              id: "document-1",
              admissionCode: "HS1",
              candidateName: "Ứng viên 1",
              documentType: "Học bạ",
              status: "pending",
              fileUrl: null,
              fileName: null,
              uploadedAt: "2026-10-01T00:00:00Z",
            },
          ],
          pagination: pagination(url),
        });
      if (path === "/api/sale/assignments")
        return json(response, {
          data: [
            {
              id: "assignment-1",
              lead: lead(1),
              source,
              assignee: null,
              assignedBy: null,
              assignedAt: null,
              isMainOwner: true,
            },
          ],
          pagination: pagination(url),
        });
      if (path === "/api/automations/observability/metrics")
        return json(response, {
          totals: {
            executions: 2,
            throughputPerHour: 1,
            successRate: 0.5,
            failed: 1,
            stuck: 0,
            averageLatencyMs: 1234,
            affectedEntities: 1,
          },
          queue: {
            available: true,
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
          },
          perRule: [],
        });
      if (path === "/api/automations/observability/executions")
        return json(response, {
          data: [execution],
          pagination: pagination(url),
        });
      if (path === "/api/automations/observability/executions/execution-1")
        return json(response, execution);
      if (path === "/api/automations/rule-1/versions")
        return json(response, { data: versions });
      if (path === "/api/automations/observability/transfer-rules")
        return json(response, { data: [] });
      if (path === "/api/integrations/meta")
        return json(response, { data: [connection] });
      if (path === "/api/integrations/meta/logs")
        return json(response, { data: [] });
      unknown.push(path);
      return json(response, { message: `Unknown fixture ${path}` }, 404);
    }
    const pathToFile = path.startsWith("/assets/")
      ? resolve(outDir, "." + path)
      : resolve(outDir, "tests/react-doctor-refactor-smoke.html");
    response.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(pathToFile)
      ] ?? "application/octet-stream",
    );
    createReadStream(pathToFile)
      .on("error", () => response.writeHead(404).end())
      .pipe(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`,
    previousApi = process.env.VITE_API_URL;
  process.env.VITE_API_URL = `${origin}/api`;
  try {
    await build({
      root,
      logLevel: "error",
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: resolve(root, "tests/react-doctor-refactor-smoke.html"),
        },
      },
    });
  } finally {
    if (previousApi === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = previousApi;
  }
  browser = await openSmokeBrowser(resolve(temporary, "profile"));
  const { command, evaluate, wait, click, fill, key } = browser;
  const button = async (text, scope = "document") => {
    await wait(`Boolean(${scope})`);
    await wait(
      `[...${scope}.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)})`,
    );
    await evaluate(
      `(()=>{document.querySelector('[data-test-action]')?.removeAttribute('data-test-action');const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});b.setAttribute('data-test-action','true');})()`,
    );
    await click('[data-test-action="true"]');
  };
  const go = async (page) => {
    await command("Page.navigate", { url: `${origin}/${page}` });
    await wait("document.querySelector('#fixture-render')");
  };
  const dialog = "document.querySelector('[role=dialog]')";
  const waitRequest = async (predicate) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (requests.some(predicate)) return;
      await delay(40);
    }
    assert.fail("Thiếu request đúng bộ lọc/sort/trang ở server.");
  };
  for (const width of [375, 768, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await go("leads");
    await wait(
      "document.querySelector('[aria-label=\"Chọn lead Ứng viên 1\"]')",
    );
    await click('[aria-label="Chọn lead Ứng viên 1"]');
    await click("#fixture-render");
    assert.equal(
      await evaluate(
        "document.querySelector('[aria-label=\"Chọn lead Ứng viên 1\"]').getAttribute('aria-checked')",
      ),
      "true",
    );
    await button("Thêm ứng viên");
    await fill("#lead-full-name", "Bản nháp ứng viên");
    await evaluate("document.querySelector('#fixture-render').click()");
    assert.equal(
      await evaluate("document.querySelector('#lead-full-name').value"),
      "Bản nháp ứng viên",
    );
    await key("Escape", "Escape", 0, 27);
    await wait("!document.querySelector('[role=dialog]')");
    await button("Trang sau");
    await wait(
      "document.querySelector('[aria-label=\"Chọn lead Ứng viên 2\"]')",
    );
    assert.notEqual(
      await evaluate(
        "document.querySelector('[aria-label=\"Chọn lead Ứng viên 2\"]').getAttribute('aria-checked')",
      ),
      "true",
      "Selection phải theo lead ID.",
    );
    assert.ok(
      requests.some(
        (r) =>
          r.path === "/api/leads" &&
          r.query.page === "2" &&
          r.query.limit === "20",
      ),
    );
    const since = requests.length;
    await button("Họ và tên");
    await waitRequest(
      (r) =>
        requests.indexOf(r) >= since &&
        r.path === "/api/leads" &&
        r.query.sortBy === "fullName" &&
        r.query.page === "1",
    );
    await fill("#lead-search", "Ứng viên thử");
    await waitRequest(
      (r) =>
        requests.indexOf(r) >= since &&
        r.path === "/api/leads" &&
        r.query.search === "Ứng viên thử" &&
        r.query.page === "1" &&
        r.query.limit === "20",
    );
    await go("admissions");
    await wait("document.querySelector('[aria-label=\"Sửa hồ sơ\"]')");
    await click('[aria-label="Sửa hồ sơ"]');
    await fill("#admission-form-class", "BẢN NHÁP");
    await button("Lưu hồ sơ", dialog);
    await wait("document.body.textContent.includes('Lỗi lưu fixture')");
    assert.equal(
      await evaluate("document.querySelector('#admission-form-class').value"),
      "BẢN NHÁP",
    );
    assert.equal(writes.at(-1).path, "/api/admissions/profile-1");
    assert.equal(writes.at(-1).body.classCode, "BẢN NHÁP");
    await key("Escape", "Escape", 0, 27);
    await wait("!document.querySelector('[role=dialog]')");
    await click("#fixture-restrict");
    await wait("!document.querySelector('[aria-label=\"Sửa hồ sơ\"]')");
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
      `Bảng phải cuộn trong khung ở ${width}px.`,
    );
    console.log(
      `PASS ${width}px: Lead selection/pagination, create draft, Admission failed save + permission refresh`,
    );
  }
  await go("documents");
  await button("Duyệt");
  await fill("#document-status-note", "Đã kiểm tra bản gốc");
  await button("Cập nhật", dialog);
  await wait("document.body.textContent.includes('Lỗi lưu fixture')");
  assert.equal(
    writes.at(-1).path,
    "/api/admissions/documents/document-1/status",
  );
  assert.deepEqual(writes.at(-1).body, {
    status: "approved",
    note: "Đã kiểm tra bản gốc",
  });
  await go("fees");
  await button("Thanh toán");
  await fill("#payment-amount", "125000");
  await fill("#payment-note", "Ghi chú chưa lưu");
  await button("Lưu thanh toán", dialog);
  await wait("document.body.textContent.includes('Lỗi lưu fixture')");
  assert.equal(writes.at(-1).path, "/api/admissions/fees/fee-1/payment");
  assert.equal(writes.at(-1).body.paymentAmount, "125000");
  assert.equal(
    await evaluate("document.querySelector('#payment-note').value"),
    "Ghi chú chưa lưu",
  );
  await go("statuses");
  await wait(
    "document.querySelector('[aria-label=\"Cho phép chuyển sang Trạng thái 2\"]')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"Cho phép chuyển sang Trạng thái 2\"]').getAttribute('aria-checked')",
    ),
    "true",
  );
  await click('[aria-label="Cho phép chuyển sang Trạng thái 2"]');
  await click('[aria-label="Cho phép chuyển sang Trạng thái 3"]');
  await button("Lưu luồng xử lý");
  await wait(
    "document.querySelector('[aria-label=\"Cho phép chuyển sang Trạng thái 3\"]').getAttribute('aria-checked')==='true'",
  );
  assert.deepEqual(writes.at(-1).body, {
    fromStatusId: "status-1",
    toStatusIds: ["status-3"],
  });
  await go("automation");
  await button("Xem chi tiết");
  await wait("document.body.textContent.includes('Phiên bản 1')");
  for (const [label, suffix] of [
    ["Retry node lỗi", "/retry"],
    ["Replay execution", "/replay"],
    ["Khôi phục", "/rollback"],
  ]) {
    await button(label, dialog);
    await button(
      "Xác nhận",
      "[...document.querySelectorAll('[role=dialog]')].at(-1)",
    );
    await wait("document.querySelectorAll('[role=dialog]').length===1");
    assert.equal(
      writes.at(-1).path,
      suffix === "/rollback"
        ? "/api/automations/rule-1/versions/version-1/rollback"
        : `/api/automations/observability/executions/execution-1${suffix}`,
    );
    if (suffix === "/replay")
      assert.match(writes.at(-1).body.requestId, /^[\da-f-]{36}$/i);
  }
  await go("meta");
  await button("Kiểm tra");
  await wait(
    "document.body.textContent.includes('Page và Page Access Token đang hoạt động.')",
  );
  assert.equal(writes.at(-1).path, "/api/integrations/meta/meta-1/test");
  await click("#fixture-restrict");
  await wait(
    "![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Kết nối Facebook')",
  );
  await go("assignments");
  await click('[aria-label="Chọn Sale phụ trách cho Ứng viên 1"]');
  await click('[role="option"][data-state="unchecked"]:last-child');
  await wait("document.body.textContent.includes('Chọn Sale phụ trách')");
  assert.ok(
    writes.some(
      (r) => r.path.includes("lead-1") && r.body.assigneeId === "sale-1",
    ),
  );
  await go("runtime");
  await wait(
    "document.querySelector('#lead-custom-field-runtime-text')?.value === 'Mặc định'",
  );
  await wait(
    "JSON.parse(document.querySelector('#fixture-runtime-state').textContent).values?.['runtime-text'] === 'Mặc định'",
  );
  await fill("#lead-custom-field-runtime-text", "Bản nháp");
  await wait(
    "JSON.parse(document.querySelector('#fixture-runtime-state').textContent).values?.['runtime-text'] === 'Bản nháp'",
  );
  await click("#fixture-render");
  assert.equal(
    await evaluate(
      "document.querySelector('#lead-custom-field-runtime-text').value",
    ),
    "Bản nháp",
  );
  await fill("#lead-custom-field-runtime-text", "Sau render");
  await wait(
    "(()=>{const s=JSON.parse(document.querySelector('#fixture-runtime-state').textContent);return s.revision === 1 && s.values['runtime-text'] === 'Sau render'})()",
  );
  await go("async");
  await click("#fixture-task-fail");
  await wait(
    "JSON.parse(document.querySelector('#fixture-task-state').textContent).error === 'Lỗi thử nghiệm'",
  );
  await click("#fixture-task-success");
  await wait(
    "(()=>{const s=JSON.parse(document.querySelector('#fixture-task-state').textContent);return s.data === 'Thành công' && !s.error && !s.pending && s.settled === 2})()",
  );
  await click("#fixture-task-reset");
  await wait(
    "(()=>{const s=JSON.parse(document.querySelector('#fixture-task-state').textContent);return !s.data && !s.error && !s.pending})()",
  );
  console.log(
    "PASS runtime fields hydration, input, parent render/latest callback; async task error, retry and reset",
  );
  await go("transition");
  await click("#fixture-transition");
  await button("Hủy", dialog);
  await wait("!document.querySelector('[role=dialog]')");
  assert.equal(
    await evaluate(
      "JSON.parse(document.querySelector('#fixture-transition-result').textContent).calls",
    ),
    0,
  );
  await click("#fixture-transition");
  await button("Chuyển không ghi chú", dialog);
  await wait(
    "document.querySelector('[role=dialog]')?.textContent.includes('Lưu thất bại')",
  );
  await button("Chuyển không ghi chú", dialog);
  await wait("!document.querySelector('[role=dialog]')");
  assert.deepEqual(
    await evaluate(
      "JSON.parse(document.querySelector('#fixture-transition-result').textContent)",
    ),
    { calls: 2, result: { command: "command-1", selection: {} } },
  );
  console.log(
    "PASS transition prompt cancel, failed confirmation preserved and successful retry with original command",
  );
  assert.deepEqual(
    unknown,
    [],
    "Fixture phải mô phỏng đủ API; không được bỏ qua lỗi tải.",
  );
  console.log(
    "PASS fee failed save, status flow membership, automation retry/replay/rollback IDs, Meta permissions/actions, assignment callback",
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + "\\"));
  await rm(temporary, { recursive: true, force: true });
}
