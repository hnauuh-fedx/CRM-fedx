import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/auth-context";
import { ReleasesPage } from "../src/modules/management/pages/releases-page";
import "../src/index.css";

const mode = new URLSearchParams(location.search).get("mode");
const user = { id: "00000000-0000-4000-8000-000000000001", fullName: "Quản trị kiểm thử", email: "test@example.test", avatarUrl: null, roles: [], permissions: mode === "viewer" ? ["release.view"] : ["release.view", "release.deploy"], accessScope: mode === "scoped" ? "DEPARTMENT" : "ALL", departmentIds: [], institutionProgramIds: [] };
const releases = [2, 1].map(n => ({ id: `00000000-0000-4000-8000-00000000000${n + 1}`, commit: String(n).repeat(40), version: `v1.0.${n}`, notes: n === 2 ? "Cập nhật nhập lead và báo cáo tuyển sinh." : "Bản đang vận hành ổn định.", apiImage: "", webImage: "", schemaGeneration: "g1", buildUrl: "https://github.com/example/crm/actions/runs/1", createdAt: "2026-10-28T02:00:00Z" }));
declare global { interface Window { releaseRequests: any[]; failNextRelease: boolean; } }
window.releaseRequests = []; window.failNextRelease = true;
const deployments: any[] = [];
const json = (data: unknown) => Response.json(data);
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  if (url.pathname.endsWith("/auth/refresh")) return json({ accessToken: "fixture", expiresIn: 900, user });
  if (url.pathname.endsWith("/auth/me")) return json({ user });
  if (mode === "offline" && url.pathname.includes("/system/releases")) return Response.json({ message: "Không thể kết nối dịch vụ triển khai." }, { status: 503 });
  if (url.pathname.endsWith("/overview")) return json({ configured: mode !== "unconfigured", environments: mode === "unconfigured" ? [] : ["staging", "production"].map(name => ({ name, schemaGeneration: "g1", version: "v1.0.1", currentReleaseId: releases[1].id, blocked: false, activeDeploymentId: null })) });
  if (url.pathname.endsWith("/releases/releases")) return json({ data: releases.filter(row => row.version.includes(url.searchParams.get("search") ?? "")), pagination: { page: 1, totalPages: 1, total: 2 } });
  if (url.pathname.endsWith("/deployments") && init?.method === "POST") {
    const body = JSON.parse(String(init.body)); window.releaseRequests.push(body);
    if (window.failNextRelease) { window.failNextRelease = false; return Response.json({ message: "Chưa xác nhận máy chủ đã nhận yêu cầu. Thử lại cùng yêu cầu." }, { status: 503 }); }
    const result = { ...body, id: body.requestId, version: releases.find(row => row.id === body.releaseId)?.version, status: "SUCCEEDED", message: "Triển khai thành công.", actorName: user.fullName, createdAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
    deployments.unshift(result); return json(result);
  }
  if (url.pathname.endsWith("/deployments")) return json({ data: deployments, pagination: { page: 1, totalPages: 1, total: deployments.length } });
  if (url.pathname.endsWith("/events")) return json({ data: [{ id: "1", message: "Kiểm tra kết nối và mã phiên bản thành công.", createdAt: "2026-10-28T02:00:00Z" }] });
  return Response.json({ message: "Endpoint ngoài fixture" }, { status: 404 });
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><MemoryRouter><AuthProvider><main className="min-w-0 p-4"><ReleasesPage /></main></AuthProvider></MemoryRouter></QueryClientProvider>);
