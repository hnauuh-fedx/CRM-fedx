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
    totalBudget: number;
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
  budget: number;
  trackingCount: number;
  leadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
  costPerLead: number | null;
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
