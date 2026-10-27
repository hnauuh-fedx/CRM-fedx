import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Link } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider, useInstitutionProgram } from "../src/modules/institutions/institution-program-context";
import { MarketingFormDetailPage } from "../src/modules/marketing/pages/marketing-forms-page";
import { MarketingFormFill } from "../src/modules/marketing/marketing-form-fill";
import { apiRequest } from "../src/services/api";
import type { PublicMarketingFormConfig } from "../src/modules/marketing/marketing-reference.types";
import "../src/index.css";

localStorage.setItem("admission-crm.selected-institution-program-id:fixture", "11111111-1111-4111-8111-111111111111");
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Shell() {
  const scope = useInstitutionProgram();
  return <><div className="flex flex-wrap gap-3 p-3"><Link id="fixture-builder" to="/marketing/form-survey/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">Builder</Link><Link id="fixture-public" to="/fixture-public">Public</Link><button id="fixture-program" onClick={() => scope.selectProgram("22222222-2222-4222-8222-222222222222")}>Đổi chương trình</button><output id="fixture-scope">{scope.selectedProgramId}</output></div><Outlet /></>;
}
function PublicFixture() {
  const query = useQuery({ queryKey: ["fixture-public"], queryFn: () => apiRequest<PublicMarketingFormConfig>("/fixture/public") });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  if (!query.data) return <p>Đang tải fixture</p>;
  if (done) return <p id="fixture-submitted">Đã gửi fixture</p>;
  return <MarketingFormFill mode="public" form={query.data} isPending={pending} error={error} onSubmit={async values => {
    setPending(true); setError("");
    try { await apiRequest("/fixture/submit", { method: "POST", body: JSON.stringify(values) }); setDone(true); }
    catch { setError("Lỗi mạng fixture. Vui lòng thử lại."); }
    finally { setPending(false); }
  }} />;
}
const router = createBrowserRouter([{ element: <Shell />, children: [
  { path: "/marketing/form-survey/:formId", element: <MarketingFormDetailPage /> },
  { path: "/marketing/form-survey", element: <p id="fixture-list">Danh sách fixture</p> },
  { path: "/tong-quan", element: <p id="fixture-home">Tổng quan fixture</p> },
  { path: "/fixture-public", element: <PublicFixture /> },
] }]);
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><AuthProvider><InstitutionProgramProvider accessToken="fixture-only"><RouterProvider router={router} /></InstitutionProgramProvider></AuthProvider></QueryClientProvider>);
