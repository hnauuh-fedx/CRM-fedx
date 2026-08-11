import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { MainLayout } from "@/components/layout/main-layout";
import { Spinner } from "@/components/ui/spinner";
import { LoginPage } from "@/modules/auth/pages/login-page";
import { WorkspacePage } from "@/modules/dashboard/pages/workspace-page";
import { ForbiddenPage } from "@/pages/forbidden-page";
import { ProtectedRoute } from "./protected-route";

const UsersAccessPage = lazy(() =>
  import("@/modules/management/pages/users-access-page").then((module) => ({
    default: module.UsersAccessPage,
  })),
);
const RolesAccessPage = lazy(() =>
  import("@/modules/management/pages/roles-access-page").then((module) => ({
    default: module.RolesAccessPage,
  })),
);
const PermissionsAccessPage = lazy(() =>
  import("@/modules/management/pages/permissions-access-page").then((module) => ({
    default: module.PermissionsAccessPage,
  })),
);
const DepartmentsAccessPage = lazy(() =>
  import("@/modules/management/pages/departments-access-page").then((module) => ({
    default: module.DepartmentsAccessPage,
  })),
);
const PipelinesAccessPage = lazy(() =>
  import("@/modules/management/pages/pipelines-access-page").then((module) => ({
    default: module.PipelinesAccessPage,
  })),
);
const SystemSettingsPage = lazy(() =>
  import("@/modules/management/pages/system-settings-page").then((module) => ({
    default: module.SystemSettingsPage,
  })),
);
const InstitutionProgramsManagementPage = lazy(() =>
  import("@/modules/institutions/pages/institution-programs-management-page").then((module) => ({
    default: module.InstitutionProgramsManagementPage,
  })),
);
const LeadsListPage = lazy(() =>
  import("@/modules/leads/pages/leads-list-page").then((module) => ({
    default: module.LeadsListPage,
  })),
);
const LeadDetailPage = lazy(() =>
  import("@/modules/leads/pages/lead-detail-page").then((module) => ({
    default: module.LeadDetailPage,
  })),
);
const LeadAssignmentsPage = lazy(() =>
  import("@/modules/sale/pages/lead-assignments-page").then((module) => ({
    default: module.LeadAssignmentsPage,
  })),
);
const SaleActivitiesPage = lazy(() =>
  import("@/modules/sale/pages/sale-activities-page").then((module) => ({
    default: module.SaleActivitiesPage,
  })),
);
const SaleRemindersPage = lazy(() =>
  import("@/modules/sale/pages/sale-reminders-page").then((module) => ({
    default: module.SaleRemindersPage,
  })),
);
const SaleKpiPage = lazy(() =>
  import("@/modules/sale/pages/sale-kpi-page").then((module) => ({
    default: module.SaleKpiPage,
  })),
);
const AdmissionsListPage = lazy(() =>
  import("@/modules/admissions/pages/admissions-list-page").then((module) => ({
    default: module.AdmissionsListPage,
  })),
);
const AdmissionDocumentsPage = lazy(() =>
  import("@/modules/admissions/pages/admission-documents-page").then((module) => ({
    default: module.AdmissionDocumentsPage,
  })),
);
const AdmissionStatusesPage = lazy(() =>
  import("@/modules/admissions/pages/admission-statuses-page").then((module) => ({
    default: module.AdmissionStatusesPage,
  })),
);
const AdmissionFeesPage = lazy(() =>
  import("@/modules/admissions/pages/admission-fees-page").then((module) => ({
    default: module.AdmissionFeesPage,
  })),
);
const MajorsManagementPage = lazy(() =>
  import("@/modules/admissions/pages/majors-management-page").then((module) => ({
    default: module.MajorsManagementPage,
  })),
);
const StudentsListPage = lazy(() =>
  import("@/modules/students/pages/students-list-page").then((module) => ({
    default: module.StudentsListPage,
  })),
);
const StudentServicesPage = lazy(() =>
  import("@/modules/students/pages/student-services-page").then((module) => ({
    default: module.StudentServicesPage,
  })),
);
const StudentSupportHistoryPage = lazy(() =>
  import("@/modules/students/pages/student-support-history-page").then((module) => ({
    default: module.StudentSupportHistoryPage,
  })),
);
const OverviewReportPage = lazy(() =>
  import("@/modules/reports/pages/overview-report-page").then((module) => ({
    default: module.OverviewReportPage,
  })),
);
const MarketingDetailReportPage = lazy(() =>
  import("@/modules/reports/pages/marketing-detail-report-page").then((module) => ({
    default: module.MarketingDetailReportPage,
  })),
);
const SaleDetailReportPage = lazy(() =>
  import("@/modules/reports/pages/sale-detail-report-page").then((module) => ({
    default: module.SaleDetailReportPage,
  })),
);
const AdmissionDetailReportPage = lazy(() =>
  import("@/modules/reports/pages/admission-detail-report-page").then((module) => ({
    default: module.AdmissionDetailReportPage,
  })),
);
const StudentDetailReportPage = lazy(() =>
  import("@/modules/reports/pages/student-detail-report-page").then((module) => ({
    default: module.StudentDetailReportPage,
  })),
);
const CampaignsListPage = lazy(() =>
  import("@/modules/marketing/pages/campaigns-list-page").then((module) => ({
    default: module.CampaignsListPage,
  })),
);
const LeadSourcesPage = lazy(() =>
  import("@/modules/marketing/pages/lead-sources-page").then((module) => ({
    default: module.LeadSourcesPage,
  })),
);
const UtmTrackingsPage = lazy(() =>
  import("@/modules/marketing/pages/utm-trackings-page").then((module) => ({
    default: module.UtmTrackingsPage,
  })),
);
const MarketingFormsPage = lazy(() =>
  import("@/modules/marketing/pages/marketing-forms-page").then((module) => ({
    default: module.MarketingFormsPage,
  })),
);
const MarketingFormDetailPage = lazy(() =>
  import("@/modules/marketing/pages/marketing-forms-page").then((module) => ({
    default: module.MarketingFormDetailPage,
  })),
);
const PublicMarketingFormPage = lazy(() =>
  import("@/modules/marketing/pages/public-marketing-form-page").then((module) => ({
    default: module.PublicMarketingFormPage,
  })),
);
const AuditLogsPage = lazy(() =>
  import("@/modules/audit/pages/audit-logs-page").then((module) => ({
    default: module.AuditLogsPage,
  })),
);
const AutomationRulesPage = lazy(() =>
  import("@/modules/automations/pages/automation-rules-page").then((module) => ({
    default: module.AutomationRulesPage,
  })),
);
const AutomationBuilderPage = lazy(() =>
  import("@/modules/automations/pages/automation-builder-page").then((module) => ({
    default: module.AutomationBuilderPage,
  })),
);

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <output className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Spinner aria-label="Đang tải chức năng" />
          Đang tải chức năng&hellip;
        </output>
      }
    >
      <Routes>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/forms/:publicKey" element={<PublicMarketingFormPage />} />
        <Route path="/bieu-mau/:publicKey" element={<PublicMarketingFormPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/tong-quan" element={<WorkspacePage />} />
            <Route path="/khong-co-quyen" element={<ForbiddenPage />} />

            <Route element={<ProtectedRoute anyPermissions={["user.manage"]} />}>
              <Route path="/quan-ly/nguoi-dung" element={<UsersAccessPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["role.manage"]} />}>
              <Route path="/quan-ly/vai-tro" element={<RolesAccessPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["permission.manage"]} />}>
              <Route path="/quan-ly/quyen-han" element={<PermissionsAccessPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["department.manage"]} />}>
              <Route path="/quan-ly/phong-ban" element={<DepartmentsAccessPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["pipeline.manage"]} />}>
              <Route path="/quan-ly/pipeline" element={<PipelinesAccessPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["system.manage"]} />}>
              <Route path="/quan-ly/cau-hinh" element={<SystemSettingsPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["institution_program.manage"]} />}>
              <Route path="/quan-ly/chuong-trinh" element={<InstitutionProgramsManagementPage />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  anyPermissions={["lead.view_all", "lead.view_department", "lead.view_assigned"]}
                />
              }
            >
              <Route path="/sale/leads" element={<LeadsListPage />} />
              <Route path="/sale/leads/:leadId" element={<LeadDetailPage />} />
              <Route path="/sale/phan-cong" element={<LeadAssignmentsPage />} />
              <Route path="/sale/hoat-dong" element={<SaleActivitiesPage />} />
              <Route path="/sale/nhac-viec" element={<SaleRemindersPage />} />
              <Route path="/sale/kpi" element={<SaleKpiPage />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["admission.view_all", "admission.view", "admission_document.view"]} />}>
              <Route path="/tuyen-sinh/ho-so" element={<AdmissionsListPage />} />
              <Route path="/tuyen-sinh/tai-lieu-ho-so" element={<AdmissionDocumentsPage />} />
              <Route path="/tuyen-sinh/trang-thai-ho-so" element={<AdmissionStatusesPage />} />
              <Route path="/tuyen-sinh/phi-hoc-phi" element={<AdmissionFeesPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["admission_major.manage"]} />}>
              <Route path="/tuyen-sinh/nganh" element={<MajorsManagementPage />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["student.view_all", "student.view"]} />}>
              <Route path="/sinh-vien/danh-sach" element={<StudentsListPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["student.view_all", "student_service.view", "student_service.create", "student_service.update"]} />}>
              <Route path="/sinh-vien/dich-vu" element={<StudentServicesPage />} />
              <Route path="/sinh-vien/lich-su-ho-tro" element={<StudentSupportHistoryPage />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["report.view_all"]} />}>
              <Route path="/bao-cao/tong-hop" element={<OverviewReportPage />} />
              <Route path="/bao-cao/tuyen-sinh" element={<AdmissionDetailReportPage />} />
              <Route path="/bao-cao/sinh-vien" element={<StudentDetailReportPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["report.view_all", "report.marketing.view", "report.marketing.view_own"]} />}>
              <Route path="/bao-cao/marketing" element={<MarketingDetailReportPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["report.view_all", "report.sale.view_department"]} />}>
              <Route path="/bao-cao/sale" element={<SaleDetailReportPage />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["campaign.view_all", "campaign.view", "campaign.view_own"]} />}>
              <Route path="/marketing/chien-dich" element={<CampaignsListPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["campaign.view_all", "lead_source.manage"]} />}>
              <Route path="/marketing/nguon-lead" element={<LeadSourcesPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["campaign.view_all", "utm.view", "utm.view_own"]} />}>
              <Route path="/marketing/utm" element={<UtmTrackingsPage />} />
            </Route>
            <Route element={<ProtectedRoute anyPermissions={["campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"]} />}>
              <Route path="/marketing/form-survey" element={<MarketingFormsPage />} />
              <Route path="/marketing/form-survey/:formId" element={<MarketingFormDetailPage />} />
              <Route path="/marketing/bieu-mau" element={<Navigate to="/marketing/form-survey" replace />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["audit.view"]} />}>
              <Route path="/he-thong/nhat-ky" element={<AuditLogsPage />} />
            </Route>

            <Route element={<ProtectedRoute anyPermissions={["automation.manage"]} />}>
              <Route path="/automations" element={<AutomationRulesPage />} />
            </Route>
          </Route>
        </Route>

        {/* Automation Builder — full-screen, outside MainLayout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<ProtectedRoute anyPermissions={["automation.manage"]} />}>
            <Route path="/automations/:id/builder" element={<AutomationBuilderPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/tong-quan" replace />} />
        <Route path="*" element={<Navigate to="/tong-quan" replace />} />
      </Routes>
    </Suspense>
  );
}
