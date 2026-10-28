import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import { DisplayLayoutOwnerPicker } from "../src/modules/management/display-layout/display-layout-owner-picker";
import "../src/index.css";
function Demo() {
  const [value, setValue] = useState("");
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <h1 className="text-xl font-semibold">Phòng ban sở hữu mẫu</h1>
      <DisplayLayoutOwnerPicker
        value={value}
        disabled={false}
        onChange={setValue}
      />
      <output id="owner-value">{value}</output>
    </main>
  );
}
function Workspace() {
  const auth = useAuth();
  return auth.accessToken ? (
    <InstitutionProgramProvider accessToken={auth.accessToken}>
      <Demo />
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
