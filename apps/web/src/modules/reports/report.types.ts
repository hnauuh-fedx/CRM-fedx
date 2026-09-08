export type OverviewReportResponse = {
  summary: {
    totalLeads: number;
    totalApplications: number;
    totalStudents: number;
    conversionRate: number;
    monthlyRevenue: number;
  };
  applicationsByStatus: ReportBreakdownItem[];
  studentsByFaculty: ReportBreakdownItem[];
  applicationsByMajor: ReportBreakdownItem[];
};

export type ReportBreakdownItem = {
  id: string | null;
  name: string;
  total: number;
};

export type PersonalReportModule = "MARKETING" | "SALE" | "ADMISSION" | "STUDENT";
export type PersonalReportChartType = "BAR" | "TABLE" | "KPI";
export type PersonalReportMode = "SUMMARY" | "SINGLE" | "PIVOT";
export type PersonalReportSingleDisplay = "TABLE" | "LINE";
export type PersonalReportTimePreset = "LAST_7_DAYS" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "CUSTOM";
export type PersonalReportDateGranularity = "DAY" | "WEEK" | "MONTH" | "QUARTER";
export type PersonalReportDatasetKey = "LEADS" | "ADMISSION_CANDIDATES" | "STUDENTS";
export type PersonalReportFilterCondition = {
  fieldKey: string;
  operator: "EQUALS" | "NOT_EQUALS" | "DATE_PRESET" | "DATE_BETWEEN";
  value?: string;
  fromDate?: string;
  toDate?: string;
};
export type PersonalReportDatasetField = { key: string; label: string; type: "CATEGORY" | "DATE"; allowedAsOutput: boolean; allowedAsFilter: boolean };
export type PersonalReportDatasetDefinition = {
  key: PersonalReportDatasetKey;
  label: string;
  module: PersonalReportModule;
  measure: { key: string; label: string };
  countMetricKey: string;
  primaryDateField: string;
  fields: PersonalReportDatasetField[];
  rowDimensions: PersonalReportDatasetField[];
  singleDimensions: PersonalReportDatasetField[];
  columnDimensions: PersonalReportDatasetField[];
  filterFields: PersonalReportDatasetField[];
  dateGranularities: Array<{ key: PersonalReportDateGranularity; label: string }>;
};
export type PersonalReportDefinition = {
  key: PersonalReportModule;
  label: string;
  metrics: Array<{ key: string; label: string; format: "NUMBER" | "PERCENT" | "CURRENCY" }>;
  breakdowns: Array<{ key: string; label: string }>;
};
export type PersonalReport = {
  id: string;
  ownerId: string;
  ownerName: string;
  institutionProgramId: string | null;
  name: string;
  module: PersonalReportModule;
  metricKeys: string[];
  breakdownKey: string | null;
  chartType: PersonalReportChartType;
  filters: {
    fromDate?: string;
    toDate?: string;
    mode?: PersonalReportMode;
    datasetKey?: PersonalReportDatasetKey;
    rowDimensionKey?: string;
    columnDimensionKey?: string;
    timePreset?: PersonalReportTimePreset;
    dateGranularity?: PersonalReportDateGranularity;
    singleDimensionKey?: string;
    singleDisplay?: PersonalReportSingleDisplay;
    conditions?: PersonalReportFilterCondition[];
  };
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PersonalReportInput = {
  name: string;
  module: PersonalReportModule;
  metricKeys: string[];
  breakdownKey?: string | null;
  chartType: PersonalReportChartType;
  fromDate?: string;
  toDate?: string;
  mode?: PersonalReportMode;
  datasetKey?: PersonalReportDatasetKey;
  rowDimensionKey?: string;
  columnDimensionKey?: string;
  timePreset?: PersonalReportTimePreset;
  dateGranularity?: PersonalReportDateGranularity;
  singleDimensionKey?: string;
  singleDisplay?: PersonalReportSingleDisplay;
  conditions?: PersonalReportFilterCondition[];
};
export type PersonalReportResult = {
  report: PersonalReport;
  summary: Array<{ key: string; label: string; format: "NUMBER" | "PERCENT" | "CURRENCY"; value: number }>;
  rows: Array<{ label: string; value: number; percentage?: number }>;
  single?: {
    datasetLabel: string;
    dimensionLabel: string;
    display: PersonalReportSingleDisplay;
    range: { fromDate: string; toDate: string } | null;
  } | null;
  pivot?: {
    datasetLabel: string;
    rowLabel: string;
    columnLabel: string;
    granularity: PersonalReportDateGranularity;
    range: { fromDate: string; toDate: string } | null;
    columns: Array<{ key: string; label: string }>;
    rows: Array<{ key: string; label: string; values: Record<string, number>; total: number }>;
    columnTotals: Record<string, number>;
    grandTotal: number;
  } | null;
};
export type DashboardKpiWidgetType = "COUNT" | "CONVERSION" | "TREND";
export type DashboardComparisonPeriod = "WEEK" | "MONTH" | "QUARTER";
export type DashboardKpiWidgetInput = {
  id: string;
  type: DashboardKpiWidgetType;
  title?: string;
  datasetKey: PersonalReportDatasetKey;
  conditions: PersonalReportFilterCondition[];
  sourceStageId?: string;
  targetStageId?: string;
  comparisonPeriod?: DashboardComparisonPeriod;
};
export type DashboardKpiWidgetResult = {
  id: string;
  type: DashboardKpiWidgetType;
  title: string;
  description: string;
  value: number;
  format: "NUMBER" | "PERCENT";
  trend: { direction: "UP" | "DOWN" | "FLAT"; percentageChange: number; previousLabel: string } | null;
};
export type DashboardPipelineStage = { id: string; name: string; position: number | null; pipelineId: string | null; pipelineName: string | null };
export type PersonalDashboardConfig = {
  reportIds: string[];
  maximumWidgets: number;
  maximumKpis: number;
  columnCount: number;
  kpiWidgets: DashboardKpiWidgetInput[];
  pipelineStages: DashboardPipelineStage[];
};
export type PersonalDashboardResponse = {
  widgets: Array<{ reportId: string; result: PersonalReportResult }>;
  kpiConfig: DashboardKpiWidgetInput[];
  kpiWidgets: DashboardKpiWidgetResult[];
} & Omit<PersonalDashboardConfig, "kpiWidgets">;
export type MetabaseDashboard = { key: "sale-pipeline"; name: string; description: string };
export type MetabaseGuestToken = { token: string; expiresAt: number; instanceUrl: string; dashboardKey: string };

export type ReportBreakdownWithMeta = ReportBreakdownItem & {
  color?: string | null;
  facultyName?: string | null;
};

export type OverviewReportOptions = {
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
};

export type ReportDateFilters = {
  fromDate: string;
  toDate: string;
  institutionProgramId: string;
};

export type MarketingDetailReportResponse = {
  filters: ReportDateFilters;
  summary: {
    campaignCount: number;
    trackingCount: number;
    leadCount: number;
    applicationCount: number;
    enrolledStudentCount: number;
    formCount: number;
    leadToApplicationRate: number;
  };
  topCampaigns: MarketingCampaignPerformance[];
  sourcePerformance: MarketingSourcePerformance[];
};

export type MarketingCampaignPerformance = {
  id: string | null;
  name: string;
  type: string | null;
  status: string | null;
  trackingCount: number;
  leadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
};

export type MarketingSourcePerformance = {
  id: string | null;
  name: string;
  trackingCount: number;
  leadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
};

export type SaleDetailReportResponse = {
  filters: ReportDateFilters;
  summary: {
    totalLeads: number;
    assignedLeads: number;
    unassignedLeads: number;
    activityCount: number;
    pendingReminders: number;
    overdueReminders: number;
    assignmentRate: number;
  };
  pipelineBreakdown: ReportBreakdownItem[];
  staffPerformance: SaleStaffPerformance[];
};

export type SaleStaffPerformance = {
  id: string | null;
  name: string;
  assignedLeadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
};

export type AdmissionDetailReportResponse = {
  filters: ReportDateFilters;
  summary: {
    totalApplications: number;
    enrolledStudentCount: number;
    conversionRate: number;
    monthlyRevenue: number;
    documentCount: number;
    pendingDocumentCount: number;
  };
  applicationsByStatus: ReportBreakdownWithMeta[];
  applicationsByMajor: ReportBreakdownWithMeta[];
  feeStatusBreakdown: ReportBreakdownItem[];
  tuitionStatusBreakdown: ReportBreakdownItem[];
  recentApplications: AdmissionReportApplication[];
};

export type AdmissionReportApplication = {
  id: string;
  admissionCode: string | null;
  leadName: string;
  statusName: string;
  statusColor: string | null;
  majorName: string;
  facultyName: string | null;
  applicationReceivedDate: string | null;
  feeStatus: string | null;
  tuitionStatus: string | null;
  monthlyRevenue: number;
};

export type StudentDetailReportResponse = {
  filters: ReportDateFilters;
  summary: {
    totalStudents: number;
    activeStudents: number;
    studentsWithClass: number;
    serviceRequestCount: number;
    openServiceRequestCount: number;
    classAssignmentRate: number;
  };
  studentsByStatus: ReportBreakdownItem[];
  studentsByFaculty: ReportBreakdownItem[];
  studentsByMajor: ReportBreakdownWithMeta[];
  studentsByClass: ReportBreakdownItem[];
  serviceTypes: ReportBreakdownItem[];
  recentStudents: StudentReportStudent[];
};

export type StudentReportStudent = {
  id: string;
  studentCode: string;
  leadName: string;
  status: string | null;
  majorName: string;
  facultyName: string | null;
  className: string | null;
  enrolledAt: string | null;
};
