import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/auth-context";
import { ActivityWorkspace } from "../src/modules/leads/pages/lead-detail-page";
import type { LeadDetail } from "../src/modules/leads/lead.types";
import { describeLeadCreation } from "../../api/src/modules/leads/lead-creation-history";
import "../src/index.css";

const description = describeLeadCreation({ channel: "webhook", webhookName: "Facebook tuyển sinh tháng 10", requestId: "12345678-abcd-1234-abcd-123456789012", initialValues: { fullName: "Nguyễn Văn An", phone: "0901234567", email: "nguyenvanan@example.vn", note: "Đăng ký tư vấn tuyển sinh", sourceId: "12345678-abcd-1234-abcd-123456789012" } }, true);
const lead = {
  id: "fixture", notes: [], files: [], assignments: [], stageHistory: [],
  activities: [{ id: "created", type: "lead_created", content: description.description, actorLabel: description.actorLabel, actor: { id: "director", fullName: "Giám đốc" }, createdAt: "2026-10-22T02:00:00Z" }],
  recentChanges: [{ id: "audit", action: "create", description: description.description, actorLabel: description.actorLabel, actor: { id: "director", fullName: "Giám đốc" }, createdAt: "2026-10-22T02:00:00Z" }],
} as unknown as LeadDetail;
window.fetch = async () => new Response(JSON.stringify({ message: "Chưa đăng nhập" }), { status: 401, headers: { "Content-Type": "application/json" } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AuthProvider><main className="mx-auto max-w-5xl p-4"><ActivityWorkspace lead={lead} canNote={false} canFile={false} accessToken="fixture" /></main></AuthProvider></MemoryRouter></QueryClientProvider>);
