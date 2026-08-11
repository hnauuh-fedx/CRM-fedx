import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/modules/auth/auth-context";
import { InstitutionProgramProvider, useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getActiveNavigationSection, getNavigationSections } from "./navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function MainLayout() {
  const auth = useAuth();
  return (
    <InstitutionProgramProvider accessToken={auth.accessToken!}>
      <MainLayoutContent />
    </InstitutionProgramProvider>
  );
}

function MainLayoutContent() {
  const auth = useAuth();
  const programContext = useInstitutionProgram();
  const location = useLocation();
  const user = auth.user!;
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navigationSections = getNavigationSections(user.permissions);
  const activeSection = getActiveNavigationSection(location.pathname, navigationSections);
  const navigationItems = activeSection?.items ?? [];

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-50 -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-transform focus:translate-y-0"
      >
        Chuyển đến nội dung chính
      </a>

      <Sidebar
        items={navigationItems}
        sectionLabel={activeSection?.label ?? "Chức năng"}
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh"
        isCollapsed={isSidebarCollapsed}
        onExpand={() => setIsSidebarCollapsed(false)}
      />

      {isNavigationOpen && (
        <div id="mobile-navigation" className="fixed inset-0 z-30 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/45 backdrop-blur-sm"
            aria-label="Đóng menu điều hướng"
            onClick={() => setIsNavigationOpen(false)}
          />
          <Sidebar
            items={navigationItems}
            sectionLabel={activeSection?.label ?? "Chức năng"}
            className="relative z-10 shadow-2xl"
            onNavigate={() => setIsNavigationOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top_right,var(--color-accent),transparent_34rem)]">
        <Topbar
          user={user}
          accessToken={auth.accessToken!}
          navigationSections={navigationSections}
          activeSectionId={activeSection?.id}
          isNavigationOpen={isNavigationOpen}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleNavigation={() => setIsNavigationOpen((open) => !open)}
          onToggleSidebar={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          onSignOut={auth.signOut}
        />

        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-8" tabIndex={-1}>
          {programContext.hasSelectedProgram ? (
            <Outlet />
          ) : (
            <p role="status" className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
              {programContext.isLoading
                ? "Đang tải danh sách chương trình..."
                : "Chưa có chương trình hoạt động để làm việc."}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
