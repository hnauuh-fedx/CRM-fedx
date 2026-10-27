import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider, useInstitutionProgram } from "../src/modules/institutions/institution-program-context";
import { SystemSettingsPage } from "../src/modules/management/pages/system-preferences-page";
import { defaultSystemPreferences, preferenceSections } from "@admission-crm/shared/system-preferences";
import "../src/index.css";

const programA = "00000000-0000-4000-8000-000000000001";
const programB = "00000000-0000-4000-8000-000000000002";
const user = { id: "user", email: "test@local.test", fullName: "Quản trị test", roles: [], permissions: ["system.manage", "audit.view", "automation.view_logs"], institutionProgramIds: [programA, programB], workingInstitutionProgramId: programA, departmentIds: [], accessScope: "ALL", avatarUrl: null };
const documents = new Map([programA, programB].map(id => [id, preferenceSections.map(section => ({ section, value: structuredClone(defaultSystemPreferences[section]), revision: "0".repeat(64), updatedAt: null as string | null, updatedBy: null as string | null }))]));
declare global { interface Window { preferenceSaves: unknown[]; conflictNext: boolean } }
window.preferenceSaves = []; window.conflictNext = false;
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const headers = new Headers(init?.headers);
  const programId = headers.get("X-Institution-Program-Id") ?? programA;
  if (url.pathname.endsWith("/auth/refresh")) return Response.json({ accessToken: "test", expiresIn: 3600, rememberDevice: false, user });
  if (url.pathname.endsWith("/auth/me")) return Response.json({ user });
  if (url.pathname.endsWith("/institution-programs/options")) return Response.json({ data: [programA, programB].map((id, index) => ({ id, name: `Chương trình ${index ? "B" : "A"}`, code: `TEST_${index}`, institutionName: "Trường test" })) });
  if (url.pathname.endsWith("/system/preferences")) return Response.json({ institutionProgramId: programId, sections: documents.get(programId) });
  if (url.pathname.endsWith("/system/lead-form")) return Response.json({ requirements: { email: false }, revision: "0".repeat(64) });
  if (url.pathname.endsWith("/system/note-templates")) return Response.json([{ target: "FAIL", label: "Fail", pipelineName: null, templates: [], revision: "0".repeat(64) }]);
  if (url.pathname.includes("/system/preferences/") && init?.method === "PUT") {
    if (window.conflictNext) { window.conflictNext = false; return Response.json({ message: "Cấu hình đã được người khác thay đổi. Tải lại dữ liệu trước khi lưu." }, { status: 409 }); }
    const section = url.pathname.split("/").at(-1);
    const snapshot = documents.get(programId)!.find(item => item.section === section)!;
    const body = JSON.parse(String(init.body));
    window.preferenceSaves.push({ programId, section, ...body });
    Object.assign(snapshot, { value: body.value, revision: "1".repeat(64), updatedAt: new Date().toISOString(), updatedBy: user.fullName });
    return Response.json(snapshot);
  }
  return Response.json({ message: "Test endpoint unavailable" }, { status: 404 });
};

function Shell() {
  const { selectProgram } = useInstitutionProgram();
  return <main className="flex flex-col gap-5 p-4"><div className="flex flex-wrap gap-4"><button onClick={() => selectProgram(programB)}>Chuyển chương trình B</button><Link to="/other">Rời trang kiểm thử</Link></div><SystemSettingsPage /></main>;
}
const router = createMemoryRouter([{ path: "/", element: <Shell /> }, { path: "/other", element: <p>Trang kiểm thử khác</p> }]);
function AuthenticatedHarness() {
  const { accessToken } = useAuth();
  return accessToken ? <InstitutionProgramProvider accessToken={accessToken}><RouterProvider router={router} /></InstitutionProgramProvider> : <p>Đang đăng nhập kiểm thử…</p>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><AuthProvider><AuthenticatedHarness /></AuthProvider></QueryClientProvider>);
