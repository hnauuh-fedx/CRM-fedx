import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { RerunLeadRuleDialog } from "../src/modules/leads/components/rerun-lead-rule-dialog";
import "../src/index.css";

const scenario = new URLSearchParams(location.search).get("scenario") ?? "selected";
const requests: Array<{ url: string; body: Record<string, unknown> | null; requestId: string | null }> = [];
Object.assign(window, { mockRequests: requests });
const rule = { id: "00000000-0000-4000-8000-000000000001", name: "Chia sale tuyển sinh", isActive: true };
window.fetch = async (input, init) => {
  const url = String(input);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ url, body, requestId: new Headers(init?.headers).get("Idempotency-Key") });
  const total = body?.target === "selected" ? 2 : scenario === "filtered" ? 63 : 2620;
  let data: unknown = { data: [rule], pagination: { total: 1, totalPages: 1, page: 1 } };
  if (url.includes("bulk-preview")) data = { total, sample: [{ id: "lead", fullName: "Nguyễn Văn An" }], actions: [] };
  if (url.includes("bulk-run")) data = { id: "job", status: url.includes("bulk-runs/") ? "completed" : "processing", totalCount: total, processedCount: url.includes("bulk-runs/") ? total : 0, failedCount: 0, errorMessage: null };
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};
function Harness() {
  const [open, setOpen] = useState(true);
  return open ? <RerunLeadRuleDialog
    filteredCount={scenario === "filtered" ? 63 : 2620}
    leadIds={scenario === "selected" ? ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"] : []}
    filters={{ search: scenario === "filtered" ? "Match" : "", pipelineStageId: "", sourceId: "", majorId: "", assigneeId: "", fromDate: "", toDate: "", filterConditions: scenario === "filtered" ? JSON.stringify([{ field: "fullName", operator: "CONTAINS", value: "Match" }]) : "" }}
    audience="all" accessToken="fixture" onClose={() => setOpen(false)}
  /> : <p>Đã đóng</p>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
