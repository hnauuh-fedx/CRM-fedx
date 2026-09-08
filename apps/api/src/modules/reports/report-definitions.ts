import type { AuthUser } from "../auth/auth.types";

export type PersonalReportModule = "MARKETING" | "SALE" | "ADMISSION" | "STUDENT";
export type PersonalReportChartType = "BAR" | "TABLE" | "KPI";
export type PersonalReportMode = "SUMMARY" | "SINGLE" | "PIVOT";
export type PersonalReportSingleDisplay = "TABLE" | "LINE";
export type PersonalReportTimePreset = "LAST_7_DAYS" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "CUSTOM";
export type PersonalReportDateGranularity = "DAY" | "WEEK" | "MONTH" | "QUARTER";
export type PersonalReportDatasetKey = "LEADS" | "ADMISSION_CANDIDATES" | "STUDENTS";
export type PersonalReportFilterOperator = "EQUALS" | "NOT_EQUALS" | "DATE_PRESET" | "DATE_BETWEEN";
export type PersonalReportFilterCondition = { fieldKey: string; operator: PersonalReportFilterOperator; value?: string; fromDate?: string; toDate?: string };

type MetricDefinition = { key: string; label: string; format: "NUMBER" | "PERCENT" | "CURRENCY" };
type BreakdownDefinition = { key: string; label: string };
type DatasetField = { key: string; label: string; type: "CATEGORY" | "DATE"; allowedAsOutput: boolean; allowedAsFilter: boolean };
const dateGranularities = [{ key: "DAY", label: "Theo ngày" }, { key: "WEEK", label: "Theo tuần" }, { key: "MONTH", label: "Theo tháng" }, { key: "QUARTER", label: "Theo quý" }] as const;

function dataset<TModule extends PersonalReportModule>(definition: {
  key: PersonalReportDatasetKey; label: string; module: TModule; measure: { key: string; label: string };
  countMetricKey: string; primaryDateField: string; fields: readonly DatasetField[];
}) {
  return {
    ...definition,
    rowDimensions: definition.fields.filter((field) => field.allowedAsOutput),
    singleDimensions: definition.fields.filter((field) => field.allowedAsOutput),
    columnDimensions: definition.fields.filter((field) => field.allowedAsOutput),
    filterFields: definition.fields.filter((field) => field.allowedAsFilter),
    dateGranularities,
  };
}

export const personalReportDatasetDefinitions = {
  LEADS: dataset({
    key: "LEADS", label: "Khách hàng tiềm năng", module: "SALE", countMetricKey: "totalLeads", primaryDateField: "CREATED_DATE",
    measure: { key: "LEAD_COUNT", label: "Số lượng khách hàng" },
    fields: [
      { key: "SOURCE", label: "Nguồn khách hàng", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "ASSIGNEE", label: "Nhân viên phụ trách", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "PIPELINE_STAGE", label: "Giai đoạn pipeline", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "STATUS", label: "Trạng thái khách hàng", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "CREATED_DATE", label: "Ngày tạo", type: "DATE", allowedAsOutput: true, allowedAsFilter: true },
    ],
  }),
  ADMISSION_CANDIDATES: dataset({
    key: "ADMISSION_CANDIDATES", label: "Ứng viên / hồ sơ tuyển sinh", module: "ADMISSION", countMetricKey: "totalApplications", primaryDateField: "RECEIVED_DATE",
    measure: { key: "APPLICATION_COUNT", label: "Số lượng ứng viên" },
    fields: [
      { key: "ADMISSION_STATUS", label: "Trạng thái hồ sơ", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "MAJOR", label: "Ngành đăng ký", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "FEE_STATUS", label: "Trạng thái lệ phí", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "TUITION_STATUS", label: "Trạng thái học phí", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "RECEIVED_DATE", label: "Ngày tiếp nhận hồ sơ", type: "DATE", allowedAsOutput: true, allowedAsFilter: true },
    ],
  }),
  STUDENTS: dataset({
    key: "STUDENTS", label: "Sinh viên", module: "STUDENT", countMetricKey: "totalStudents", primaryDateField: "ENROLLED_DATE",
    measure: { key: "STUDENT_COUNT", label: "Số lượng sinh viên" },
    fields: [
      { key: "STATUS", label: "Trạng thái sinh viên", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "FACULTY", label: "Khoa", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "MAJOR", label: "Ngành", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "CLASS", label: "Lớp", type: "CATEGORY", allowedAsOutput: true, allowedAsFilter: true },
      { key: "ENROLLED_DATE", label: "Ngày nhập học", type: "DATE", allowedAsOutput: true, allowedAsFilter: true },
    ],
  }),
} as const;

export const personalReportDefinitions: Record<PersonalReportModule, { label: string; metrics: MetricDefinition[]; breakdowns: BreakdownDefinition[] }> = {
  MARKETING: { label: "Marketing", metrics: [{ key: "campaignCount", label: "Số chiến dịch", format: "NUMBER" }, { key: "trackingCount", label: "Lượt UTM", format: "NUMBER" }, { key: "leadCount", label: "Lead phát sinh", format: "NUMBER" }, { key: "applicationCount", label: "Hồ sơ tuyển sinh", format: "NUMBER" }, { key: "enrolledStudentCount", label: "Sinh viên nhập học", format: "NUMBER" }, { key: "leadToApplicationRate", label: "Tỷ lệ vào hồ sơ", format: "PERCENT" }], breakdowns: [{ key: "sourcePerformance", label: "Theo nguồn UTM" }, { key: "topCampaigns", label: "Theo chiến dịch" }] },
  SALE: { label: "Sale / Telesale", metrics: [{ key: "totalLeads", label: "Lead trong kỳ", format: "NUMBER" }, { key: "assignedLeads", label: "Lead đã phân công", format: "NUMBER" }, { key: "unassignedLeads", label: "Lead chưa phân công", format: "NUMBER" }, { key: "assignmentRate", label: "Tỷ lệ phân công", format: "PERCENT" }, { key: "activityCount", label: "Hoạt động chăm sóc", format: "NUMBER" }, { key: "pendingReminders", label: "Nhắc việc chờ xử lý", format: "NUMBER" }, { key: "overdueReminders", label: "Nhắc việc quá hạn", format: "NUMBER" }], breakdowns: [{ key: "pipelineBreakdown", label: "Theo giai đoạn pipeline" }] },
  ADMISSION: { label: "Tuyển sinh", metrics: [{ key: "totalApplications", label: "Tổng hồ sơ", format: "NUMBER" }, { key: "enrolledStudentCount", label: "Sinh viên nhập học", format: "NUMBER" }, { key: "conversionRate", label: "Tỷ lệ nhập học", format: "PERCENT" }, { key: "monthlyRevenue", label: "Doanh thu tháng", format: "CURRENCY" }, { key: "documentCount", label: "Tài liệu hồ sơ", format: "NUMBER" }, { key: "pendingDocumentCount", label: "Tài liệu cần xử lý", format: "NUMBER" }], breakdowns: [{ key: "applicationsByStatus", label: "Theo trạng thái hồ sơ" }, { key: "applicationsByMajor", label: "Theo ngành" }, { key: "feeStatusBreakdown", label: "Theo trạng thái lệ phí" }, { key: "tuitionStatusBreakdown", label: "Theo trạng thái học phí" }] },
  STUDENT: { label: "Sinh viên", metrics: [{ key: "totalStudents", label: "Tổng sinh viên", format: "NUMBER" }, { key: "activeStudents", label: "Sinh viên đang học", format: "NUMBER" }, { key: "studentsWithClass", label: "Sinh viên đã xếp lớp", format: "NUMBER" }, { key: "classAssignmentRate", label: "Tỷ lệ xếp lớp", format: "PERCENT" }, { key: "serviceRequestCount", label: "Yêu cầu dịch vụ", format: "NUMBER" }, { key: "openServiceRequestCount", label: "Dịch vụ đang mở", format: "NUMBER" }], breakdowns: [{ key: "studentsByStatus", label: "Theo trạng thái sinh viên" }, { key: "studentsByFaculty", label: "Theo khoa" }, { key: "studentsByMajor", label: "Theo ngành" }, { key: "studentsByClass", label: "Theo lớp" }, { key: "serviceTypes", label: "Theo loại dịch vụ" }] },
};

const modulePermissions: Record<PersonalReportModule, string[]> = {
  MARKETING: ["report.view_all", "report.marketing.view", "report.marketing.view_own", "campaign.view_all", "campaign.view", "campaign.view_own"],
  SALE: ["report.view_all", "report.sale.view_department", "report.sale.view_assigned", "lead.view_all", "lead.view_department", "lead.view_assigned"],
  ADMISSION: ["report.view_all", "report.admission.view", "admission.view_all", "admission.view"],
  STUDENT: ["report.view_all", "report.student.view", "student.view_all", "student.view"],
};

export function canUseReportModule(user: AuthUser, module: PersonalReportModule) { const granted = new Set(user.permissions); return modulePermissions[module].some((permission) => granted.has(permission)); }
export function getPersonalReportOptions(user: AuthUser) {
  const modules = (Object.entries(personalReportDefinitions) as [PersonalReportModule, typeof personalReportDefinitions[PersonalReportModule]][]).filter(([module]) => canUseReportModule(user, module)).map(([key, definition]) => ({ key, ...definition }));
  const datasets = Object.values(personalReportDatasetDefinitions).filter((item) => canUseReportModule(user, item.module));
  return { modules, datasets };
}
