import React, { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { PageLoadingBoundary, PageLoadingState, type PageSkeletonVariant } from "../src/components/shared/page-loading-state";
import { RouteLoadingState } from "../src/routes/route-loading-state";
import { getPageSkeletonVariant } from "../src/routes/page-skeleton-config";
import "../src/index.css";

const variants: PageSkeletonVariant[] = ["list", "lead-list", "detail", "dashboard", "settings", "cards", "builder", "public-form", "session"];
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

function Content() {
  const [draft, setDraft] = useState("");
  return (
    <section>
      <label htmlFor="draft">Nội dung đang nhập</label>
      <input id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <p id="ready">Dữ liệu đã tải</p>
    </section>
  );
}

function QueryFixture({ mode = "normal" }: { mode?: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["page-loading-fixture", mode, page],
    queryFn: async () => {
      const response = await fetch(`/fixture-data?mode=${mode}&page=${page}`);
      if (!response.ok) throw new Error("Không thể tải dữ liệu");
      return response.json();
    },
    enabled: mode !== "disabled",
  });
  const optionalQuery = useQuery({ queryKey: ["optional"], queryFn: async () => "optional", enabled: false });
  return (
    <>
      <div className="flex gap-4">
        <button id="next" onClick={() => setPage((value) => value + 1)}>Trang tiếp</button>
        <button id="refresh" onClick={() => void query.refetch()}>Làm mới</button>
      </div>
      <PageLoadingBoundary queries={[query, optionalQuery]} variant="lead-list">
        {query.isError ? <p id="error" role="alert">Không thể tải dữ liệu</p> : <Content />}
        {query.isFetching && <span id="fetching">Đang cập nhật</span>}
      </PageLoadingBoundary>
    </>
  );
}

const LazyPage = lazy(async () => {
  await fetch("/fixture-lazy");
  return { default: () => <QueryFixture mode="lazy" /> };
});

function Shell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="p-4">
      <aside id="sidebar" data-collapsed={collapsed}>
        <button id="collapse" onClick={() => setCollapsed((value) => !value)}>Thu gọn</button>
        <Link id="to-lazy" to="/sale/leads">Danh sách lead</Link>
        <Link id="to-cached" to="/cached">Dữ liệu có sẵn</Link>
      </aside>
      <header id="topbar">Thanh điều hướng</header>
      <main id="main-content">
        <Suspense key={location.pathname} fallback={<RouteLoadingState />}><Outlet /></Suspense>
      </main>
    </div>
  );
}

function Gallery() {
  return <div className="flex flex-col gap-6 p-4">{variants.map((variant) => <PageLoadingState key={variant} variant={variant} />)}</div>;
}

client.setQueryData(["page-loading-fixture", "cached", 1], { ready: true });
Object.assign(window, { classifySkeleton: getPageSkeletonVariant });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <Routes>
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/forms/:key" element={<Suspense fallback={<RouteLoadingState />}><LazyPage /></Suspense>} />
        <Route element={<Shell />}>
          <Route path="/sale/leads" element={<LazyPage />} />
          <Route path="/cached" element={<QueryFixture key="cached" mode="cached" />} />
          <Route path="/disabled" element={<QueryFixture key="disabled" mode="disabled" />} />
          <Route path="/error" element={<QueryFixture key="error" mode="error" />} />
          <Route path="*" element={<QueryFixture key="normal" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
