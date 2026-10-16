import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import { LeadForm } from "../src/modules/leads/components/lead-form";
import { LeadDetailLayout } from "../src/modules/leads/components/lead-detail-layout";
import { emptyLeadForm } from "../src/modules/leads/lead.schema";
import type {
  LeadDetail,
  LeadFormInput,
} from "../src/modules/leads/lead.types";
import "../src/index.css";
const programId = "00000000-0000-4000-8000-000000000001";
const defaults = {
  ...emptyLeadForm,
  institutionProgramId: programId,
  fullName: "Nguyễn Kiểm Thử",
  phone: "0901234567",
  sourceId: "source-1",
  email: "invalid-email",
  note: "Giá trị ẩn cần giữ",
  majorId: "major-1",
};
const createDefaults = { ...defaults, email: "", fullName: "", phone: "" };
const options = {
  sources: [{ id: "source-1", name: "Nguồn mẫu" }],
  stages: [],
  telesales: [],
  institutionPrograms: [
    {
      id: programId,
      name: "Chương trình mẫu",
      code: "TEST",
      institutionName: "Trường mẫu",
    },
  ],
  majors: [{ id: "major-1", name: "Ngành mẫu" }],
  admissionStatuses: [],
  tags: [],
  systemFieldRequirements: { majorId: true },
};
const detail = {
  ...defaults,
  id: "lead-1",
  source: options.sources[0],
  assignee: null,
  pipelineStage: null,
  institutionProgram: options.institutionPrograms[0],
  majorName: "Ngành mẫu",
  admissionStatusName: null,
} as unknown as LeadDetail;
function Surfaces() {
  const [submitted, setSubmitted] = useState<LeadFormInput | null>(null);
  const [mode, setMode] = useState("edit");
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <button id="create-mode" onClick={() => setMode("create")}>
        Thử tạo lead
      </button>
      <LeadDetailLayout lead={detail} enabled>
        <p>Chi tiết mặc định</p>
      </LeadDetailLayout>
      <LeadForm
        key={mode}
        useDisplayLayout
        leadId={mode === "edit" ? "lead-1" : undefined}
        defaultValues={mode === "edit" ? defaults : createDefaults}
        options={options}
        submitLabel="Lưu kiểm thử"
        isPending={false}
        onSubmit={setSubmitted}
      />
      <output id="submitted">
        {submitted ? JSON.stringify(submitted) : ""}
      </output>
    </main>
  );
}
function Workspace() {
  const auth = useAuth();
  return auth.accessToken ? (
    <InstitutionProgramProvider accessToken={auth.accessToken}>
      <Surfaces />
    </InstitutionProgramProvider>
  ) : (
    <p>Đang đăng nhập…</p>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <AuthProvider>
      <Workspace />
    </AuthProvider>
  </QueryClientProvider>,
);
