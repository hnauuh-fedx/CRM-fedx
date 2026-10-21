import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/modules/auth/auth-context";
import { LeadsListPage } from "../src/modules/leads/pages/leads-list-page";
import { AdmissionsListPage } from "../src/modules/admissions/pages/admissions-list-page";
import { AdmissionFeesPage } from "../src/modules/admissions/pages/admission-fees-page";
import { AdmissionDocumentsPage } from "../src/modules/admissions/pages/admission-documents-page";
import { AdmissionStatusesPage } from "../src/modules/admissions/pages/admission-statuses-page";
import { AutomationMonitoringPage } from "../src/modules/automations/pages/automation-monitoring-page";
import { MetaConnectionPage } from "../src/modules/marketing/pages/meta-connection-page";
import { LeadAssignmentsPage } from "../src/modules/sale/pages/lead-assignments-page";
import { PermissionsAccessPage } from "../src/modules/management/pages/permissions-access-page";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import "../src/index.css";
import { RuntimeCustomFieldsSection } from "../src/modules/custom-fields/runtime-custom-fields-section";
import { useAsyncTask } from "../src/hooks/use-async-task";
import { useTransitionNotePrompt } from "../src/modules/leads/components/transition-note-dialog";

function TransitionFixture() {
  const [calls, setCalls] = useState(0);
  const [result, setResult] = useState<object>({});
  const prompt = useTransitionNotePrompt<string>(async (command, selection) => {
    setCalls((count) => count + 1);
    if (calls === 0) throw new Error("Lưu thất bại");
    setResult({ command, selection });
  });
  return (
    <section>
      <button
        id="fixture-transition"
        disabled={prompt.isPending}
        onClick={() => prompt.request("lead-1", "stage-2", "command-1")}
      >
        Chuyển
      </button>
      <output id="fixture-transition-result">
        {JSON.stringify({ calls, result })}
      </output>
      {prompt.dialog}
    </section>
  );
}

function RuntimeFixture({ revision }: { revision: number }) {
  const [result, setResult] = useState<object>({});
  return (
    <section>
      <RuntimeCustomFieldsSection
        entityType="ADMISSION_MAJOR"
        entityId="fixture-runtime"
        onChange={(values) => setResult({ values, revision })}
      />
      <output id="fixture-runtime-state">{JSON.stringify(result)}</output>
    </section>
  );
}

function AsyncFixture() {
  const [settled, setSettled] = useState(0);
  const task = useAsyncTask({
    task: async (fail: boolean) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (fail) throw new Error("Lỗi thử nghiệm");
      return "Thành công";
    },
    onSettled: () => setSettled((count) => count + 1),
  });
  return (
    <section>
      <button
        id="fixture-task-fail"
        disabled={task.isPending}
        onClick={() => task.run(true)}
      >
        Thử lỗi
      </button>
      <button
        id="fixture-task-success"
        disabled={task.isPending}
        onClick={() => task.run(false)}
      >
        Thử lại
      </button>
      <button id="fixture-task-reset" onClick={task.reset}>
        Đặt lại
      </button>
      <output id="fixture-task-state">
        {JSON.stringify({
          data: task.data,
          error: task.error?.message,
          pending: task.isPending,
          settled,
        })}
      </output>
    </section>
  );
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function Fixture() {
  const [revision, setRevision] = useState(0);
  return (
    <>
      <nav className="flex flex-wrap gap-3 p-3">
        {[
          "leads",
          "admissions",
          "fees",
          "statuses",
          "automation",
          "meta",
          "assignments",
        ].map((page) => (
          <Link key={page} id={`fixture-${page}`} to={`/${page}`}>
            {page}
          </Link>
        ))}
        <button
          id="fixture-render"
          onClick={() => setRevision((current) => current + 1)}
        >
          Render {revision}
        </button>
        <button id="fixture-refetch" onClick={() => client.invalidateQueries()}>
          Refetch
        </button>
        <button
          id="fixture-restrict"
          onClick={() =>
            client.setQueryData(
              ["auth", "me", "fixture"],
              (previous: { user: object }) => ({
                user: { ...previous.user, permissions: [] },
              }),
            )
          }
        >
          Bỏ quyền
        </button>
      </nav>
      <Routes>
        <Route path="/transition" element={<TransitionFixture />} />
        <Route
          path="/runtime"
          element={<RuntimeFixture revision={revision} />}
        />
        <Route path="/async" element={<AsyncFixture />} />
        <Route path="/leads" element={<LeadsListPage />} />
        <Route path="/admissions" element={<AdmissionsListPage />} />
        <Route path="/fees" element={<AdmissionFeesPage />} />
        <Route path="/documents" element={<AdmissionDocumentsPage />} />
        <Route path="/statuses" element={<AdmissionStatusesPage />} />
        <Route path="/automation" element={<AutomationMonitoringPage />} />
        <Route path="/meta" element={<MetaConnectionPage />} />
        <Route path="/assignments" element={<LeadAssignmentsPage />} />
        <Route path="/permissions" element={<PermissionsAccessPage />} />
      </Routes>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <InstitutionProgramProvider accessToken="fixture-only">
        <BrowserRouter>
          <Fixture />
        </BrowserRouter>
      </InstitutionProgramProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
