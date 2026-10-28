import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/auth-context";
import { ActivityWorkspace } from "../src/modules/leads/pages/lead-detail-page";
import type { LeadDetail } from "../src/modules/leads/lead.types";
import { describeLeadCreation } from "../../api/src/modules/leads/lead-creation-history";
import { WebhooksPage } from "../src/modules/webhooks/pages/webhooks-page";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import "../src/index.css";

const webhookId = "12345678-abcd-1234-abcd-123456789012";
const programId = "12345678-abcd-1234-abcd-123456789014";
const sourceWebhook = { id: webhookId, name: "Facebook tuyển sinh tháng 10" };
const noAccess = new URLSearchParams(location.search).get("mode") === "no-access";
const user = { id: "fixture-user", fullName: "Người kiểm thử", email: "test@example.test", roles: [], permissions: noAccess ? [] : ["webhook.view"], accessScope: "ALL", departmentIds: [], institutionProgramIds: [programId] };
localStorage.setItem("admission-crm.selected-institution-program-id:" + user.id, programId);
const description = describeLeadCreation({ channel: "webhook", webhookName: "Facebook tuyển sinh tháng 10", requestId: "12345678-abcd-1234-abcd-123456789012", initialValues: { fullName: "Nguyễn Văn An", phone: "0901234567", email: "nguyenvanan@example.vn", note: "Đăng ký tư vấn tuyển sinh", sourceId: "12345678-abcd-1234-abcd-123456789012", sourceName: "Facebook", assigneeId: "12345678-abcd-1234-abcd-123456789013", assigneeName: "Trần Thị Mai" } }, true);
const lead = {
  id: "fixture", notes: [], files: [], assignments: [], stageHistory: [],
  activities: [{ id: "created", type: "lead_created", sourceWebhook, content: description.description, actorLabel: description.actorLabel, actor: { id: "director", fullName: "Giám đốc" }, createdAt: "2026-10-22T02:00:00Z" }],
  recentChanges: [{ id: "audit", action: "create", sourceWebhook, description: description.description, actorLabel: description.actorLabel, actor: { id: "director", fullName: "Giám đốc" }, createdAt: "2026-10-22T02:00:00Z" }],
} as unknown as LeadDetail;
window.fetch = async (input) => {
  const url = new URL(String(input), location.href);
  if (url.pathname.endsWith("/auth/refresh")) return Response.json({ accessToken: "fixture", expiresIn: 900, user });
  if (url.pathname.endsWith("/auth/me")) return Response.json({ user });
  if (url.pathname.endsWith("/institution-programs/options")) return Response.json({ data: [{ id: programId, name: "Chương trình kiểm thử", code: "TEST", institutionName: "Test" }] });
  if (url.pathname.endsWith("/settings/webhooks/metadata")) return Response.json({ targetModules: [], fields: [] });
  if (url.pathname.endsWith("/logs") || url.pathname.endsWith("/settings/webhooks")) return Response.json({ data: [], pagination: { total: 0, totalPages: 1, page: 1, limit: 20 } });
  if (url.pathname.endsWith("/settings/webhooks/" + webhookId)) return Response.json({ id: webhookId, name: sourceWebhook.name, mappings: [], targetModule: "LEAD", webhookKey: "fixture-key", webhookUrl: "/api/inbound-webhooks/fixture-key", status: "ACTIVE", duplicatePolicy: "UPDATE_EXISTING", lastReceivedAt: null, createdAt: "2026-10-28T02:00:00Z", updatedAt: "2026-10-28T02:00:00Z" });
  return Response.json({ message: "Endpoint ngoài fixture" }, { status: 404 });
};
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[location.pathname + location.search]}><AuthProvider><main className="mx-auto max-w-5xl p-4"><Routes><Route path="/quan-ly/tich-hop/webhooks" element={<InstitutionProgramProvider accessToken="fixture" userId={user.id}><WebhooksPage /></InstitutionProgramProvider>} /><Route path="*" element={<ActivityWorkspace lead={lead} canNote={false} canFile={false} accessToken="fixture" />} /></Routes></main></AuthProvider></MemoryRouter></QueryClientProvider>);
