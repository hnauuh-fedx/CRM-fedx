import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import App from "./App";
import { ErrorState } from "./components/shared/error-state";
import { AuthProvider } from "./modules/auth/auth-context";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function RootRouteError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-xl rounded-xl border bg-background shadow-sm">
        <ErrorState
          title="Không thể hiển thị trang"
          description="Đã xảy ra lỗi ngoài dự kiến. Vui lòng tải lại trang để tiếp tục."
          onReload={() => window.location.reload()}
        />
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
    errorElement: <RootRouteError />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
