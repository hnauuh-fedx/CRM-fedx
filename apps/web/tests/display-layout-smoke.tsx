import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryRouter,
  RouterProvider,
  Link,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "../src/modules/auth/auth-context";
import { InstitutionProgramProvider } from "../src/modules/institutions/institution-program-context";
import { DisplayLayoutsPage } from "../src/modules/management/pages/display-layouts-page";
import { LeadsListPage } from "../src/modules/leads/pages/leads-list-page";
import { CustomerListDetailPage } from "../src/modules/marketing/pages/customer-list-management-page";
import "../src/index.css";
function Workspace() {
  const auth = useAuth();
  if (!auth.accessToken) return <p>Đang đăng nhập kiểm thử…</p>;
  return (
    <InstitutionProgramProvider accessToken={auth.accessToken}>
      <main className="mx-auto max-w-7xl p-4">
        <nav className="mb-4 flex gap-4">
          <Link id="fixture-leads" to="/sale/leads">
            Danh sách lead
          </Link>
          <Link id="fixture-customers" to="/marketing/danh-sach-khach-hang">Danh sách khách hàng</Link>
          <Link id="fixture-customer-list" to="/marketing/quan-ly-danh-sach/list-1">Khách hàng trong danh sách</Link>
          <Link
            id="fixture-layouts"
            to="/quan-ly/cau-hinh-hien-thi?template=layout-1"
          >
            Cấu hình hiển thị
          </Link>
        </nav>
        <Outlet />
      </main>
    </InstitutionProgramProvider>
  );
}
const router = createMemoryRouter(
  [
    {
      element: (
        <AuthProvider>
          <Workspace />
        </AuthProvider>
      ),
      children: [
        { path: "/quan-ly/cau-hinh-hien-thi", element: <DisplayLayoutsPage /> },
        { path: "/sale/leads", element: <LeadsListPage /> },
        { path: "/marketing/danh-sach-khach-hang", element: <LeadsListPage title="Danh sách khách hàng" detailBasePath="/marketing/danh-sach-khach-hang" enableCustomerListAssignment showLeadCreationActions={false} /> },
        { path: "/marketing/quan-ly-danh-sach/:customerListId", element: <CustomerListDetailPage /> },
      ],
    },
  ],
  { initialEntries: ["/quan-ly/cau-hinh-hien-thi?template=layout-1"] },
);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
