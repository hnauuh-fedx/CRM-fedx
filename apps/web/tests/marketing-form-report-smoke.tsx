import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketingFormReport } from "../src/modules/marketing/marketing-form-report";
import "../src/index.css";

const qa = window as typeof window & { reportSmoke: { requests: Array<{ path: string; program: string | null }>; fail: boolean } };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
qa.reportSmoke = { requests: [], fail: false };
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const program = new Headers(init?.headers).get("X-Institution-Program-Id");
  qa.reportSmoke.requests.push({ path: url.pathname + url.search, program });
  if (qa.reportSmoke.fail) return new Response(JSON.stringify({ message: "Lỗi fixture" }), { status: 503 });
  if (url.pathname.endsWith("/export")) return new Response("metric,count\ntotal,10", { headers: { "Content-Disposition": 'attachment; filename="fixture.csv"' } });
  return new Response(JSON.stringify({
    summary: { total: program === "program-a" ? 10 : 20, accepted: 8, failed: 2, duplicate: 3, needsReview: 1, newLeads: 4, updatedLeads: 2 },
    pipeline: [{ stageId: "stage", name: "Đang tư vấn", leadCount: 4 }], pipelineVisible: true,
    pagination: { totalPages: 1 }, definitions: "Pipeline hiện tại đếm Lead duy nhất. Không đo opened/start.",
  }));
};
function Fixture() {
  const [program, setProgram] = useState("program-a");
  const [permissionMode, setPermissionMode] = useState("full");
  const permissions = permissionMode === "none" ? [] : ["report.marketing.view", ...(permissionMode === "full" ? ["report.personal.export"] : [])];
  return <QueryClientProvider client={queryClient}>
    <div className="flex flex-col gap-3 p-3"><div className="flex flex-wrap gap-2"><button id="change-program" onClick={() => setProgram("program-b")}>Đổi chương trình</button><button id="remove-export" onClick={() => setPermissionMode("view")}>Bỏ quyền xuất</button><button id="remove-view" onClick={() => setPermissionMode("none")}>Bỏ quyền xem</button></div>
    <MarketingFormReport key={program} formId="fixture-form" programId={program} accessToken="fixture-only" permissions={permissions} /></div>
  </QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
