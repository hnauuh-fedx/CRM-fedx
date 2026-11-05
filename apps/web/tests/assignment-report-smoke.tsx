import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import { AssignmentReportPanel } from "../src/modules/reports/components/assignment-report-panel";
import "../src/index.css";

declare global { interface Window { assignmentRequests: string[]; assignmentMode: string; } }
const programId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000002";
const departmentId = "00000000-0000-4000-8000-000000000003";
const ruleId = "00000000-0000-4000-8000-000000000004";
window.assignmentRequests = [];
window.assignmentMode = new URLSearchParams(location.search).get("mode") ?? "normal";
const user = { id: personId, fullName: "Người kiểm thử", email: "test@example.test", roles: [], permissions: window.assignmentMode === "denied" ? [] : ["report.view_all", "lead.view_all"], accessScope: "ALL", departmentIds: [departmentId], institutionProgramIds: [programId] };
localStorage.setItem("admission-crm.selected-institution-program-id:" + personId, programId);
window.fetch = async (input) => {
  const url = new URL(String(input), location.href);
  if (url.pathname.endsWith("/auth/refresh")) return Response.json({ accessToken: "fixture", expiresIn: 900, user });
  if (url.pathname.endsWith("/auth/me")) return Response.json({ user });
  if (url.pathname.endsWith("/institution-programs/options")) return Response.json({ data: [{ id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Test" }] });
  window.assignmentRequests.push(url.pathname + url.search);
  if (window.assignmentMode === "error") return Response.json({ message: "Lỗi kiểm thử" }, { status: 500 });
  if (url.pathname.endsWith("/assignments/options")) {
    const kind = url.searchParams.get("kind");
    const option = kind === "department" ? { id: departmentId, name: "Nhóm tuyển sinh" } : kind === "rule" ? { id: ruleId, name: "Chia lead tháng này" } : { id: personId, name: "Nguyễn An" };
    return Response.json({ items: [option], hasMore: false });
  }
  if (url.pathname.endsWith("/assignments/events")) return Response.json({ rows: [{ id: "event", occurredAt: "2026-11-05T02:00:00Z", type: "ASSIGNED", assigneeName: "Nguyễn An", leadId: null, leadCode: null, leadName: null, sourceName: "Facebook", campaignNames: ["Tuyển sinh tháng 11"], method: "AUTOMATIC", ruleName: "Chia lead tháng này", nodeId: "assign", reason: "Giao lead" }], pagination: { page: Number(url.searchParams.get("page")), total: 1, limit: 20 } });
  const types = (url.searchParams.get("eventTypes") ?? "ASSIGNED,WARNING_1,WARNING_2,WITHDRAWN").split(",");
  const counts = { ASSIGNED: types.includes("ASSIGNED") ? 45 : 0, WARNING_1: types.includes("WARNING_1") ? 9 : 0, WARNING_2: types.includes("WARNING_2") ? 2 : 0, WITHDRAWN: types.includes("WITHDRAWN") ? 3 : 0 };
  return Response.json({ summary: counts, rows: window.assignmentMode === "empty" ? [] : [{ assigneeId: personId, name: "Nguyễn An", ...counts }], pagination: { page: Number(url.searchParams.get("page")), limit: Number(url.searchParams.get("limit")), total: window.assignmentMode === "empty" ? 0 : 1 }, recordedFrom: "2026-11-05T00:00:00Z" });
};
function Harness() {
  const auth = useAuth();
  if (!auth.accessToken) return <p>Đang tải phiên kiểm thử…</p>;
  return <InstitutionProgramProvider accessToken={auth.accessToken} userId={user.id} allowedProgramIds={user.institutionProgramIds}>
    <main data-ready className="mx-auto flex max-w-7xl flex-col gap-4 p-4"><h1>Tổng quan</h1><AssignmentReportPanel /></main>
  </InstitutionProgramProvider>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrowserRouter><AuthProvider><Harness /></AuthProvider></BrowserRouter></QueryClientProvider>);
