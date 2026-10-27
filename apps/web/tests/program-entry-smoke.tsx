import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { LoginPage } from "../src/modules/auth/pages/login-page";
import { MainLayout } from "../src/components/layout/main-layout";
import { ProtectedRoute } from "../src/routes/protected-route";
import { useInstitutionProgram } from "../src/modules/institutions/institution-program-context";
import { apiRequest } from "../src/services/api";
import "../src/index.css";

function Work() {
  const auth = useAuth();
  const context = useInstitutionProgram();
  const [draft, setDraft] = useState("");
  // Deliberately reuse a key to verify switching clears older scoped data.
  const data = useQuery({ queryKey: ["fixture-record"], queryFn: () => apiRequest<{ programId: string }>("/records", {}, auth.accessToken) });
  return <section className="flex flex-col gap-4">
    <h1>Không gian làm việc kiểm thử</h1>
    <output id="selected-program">{context.selectedProgramId}</output>
    <output id="record-program">{data.data?.programId}</output>
    <output id="program-permission">{auth.can("lead.update_assigned") ? "edit" : "read"}</output>
    <label htmlFor="draft">Nội dung đang nhập</label>
    <input id="draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <button id="signout" onClick={() => void auth.signOut()}>Đăng xuất kiểm thử</button>
  </section>;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><AuthProvider><Routes>
  <Route path="/dang-nhap" element={<LoginPage />} />
  <Route element={<ProtectedRoute />}><Route element={<MainLayout />}>
    <Route element={<ProtectedRoute anyPermissions={["lead.view_assigned"]} />}><Route path="/work" element={<Work />} /></Route>
    <Route path="/khong-co-quyen" element={<p id="forbidden">Không có quyền</p>} />
  </Route></Route>
  <Route path="*" element={<Navigate to="/work" replace />} />
</Routes></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
