import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { LoginPage } from "../src/modules/auth/pages/login-page";
import { ProtectedRoute } from "../src/routes/protected-route";
import { apiRequest } from "../src/services/api";
import { currentSession } from "../src/modules/auth/session-client";
import "../src/index.css";

function DraftForm() {
  const auth = useAuth();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const run = async (method: string) => {
    try { await apiRequest("/records", { method, ...(method === "POST" ? { body: JSON.stringify({ draft }) } : {}) }, auth.accessToken); setMessage("Thành công"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Lỗi"); }
  };
  return <main className="flex flex-col gap-4 p-6">
    <p id="identity">{auth.user?.email}</p>
    <label htmlFor="draft">Nội dung đang nhập</label><input id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button id="read" onClick={() => void run("GET")}>Đọc dữ liệu</button>
    <button id="save" onClick={() => void run("POST")}>Lưu nội dung</button>
    <button id="signout" onClick={() => void auth.signOut()}>Đăng xuất</button>
    <p id="message" role="status">{message}</p>
  </main>;
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
Object.assign(window, { authProbe: { currentSession, writeWithToken: (token: string) => apiRequest("/records", { method: "POST", body: "{}" }, token) } });
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes>
  <Route path="/dang-nhap" element={<LoginPage />} />
  <Route element={<ProtectedRoute />}><Route path="/work" element={<DraftForm />} /></Route>
  <Route path="*" element={<Navigate to="/work" replace />} />
</Routes></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
