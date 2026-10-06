export type DirectorDashboardResponse = {
  summary: {
    totalData: number;
    qualifiedLeads: number;
    registeredLeads: number;
    registeredConversionRate: number;
    totalStudents: number;
    studentConversionRate: number;
    totalLeads: number;
    totalApplications: number;
    enrolledStudents: number;
    leadToApplicationRate: number;
    applicationToStudentRate: number;
    conversionRate: number;
    monthlyRevenue: number;
  };
  filterOptions: {
    majors: Array<{ id: string; name: string }>;
    sources: Array<{ id: string; name: string }>;
    assignees: Array<{ id: string; name: string }>;
    stages: Array<{ id: string; name: string }>;
  };
  leadPipelineMatrix: {
    columns: Array<{ key: string; id: string | null; name: string; total: number }>;
    rows: Array<{
      id: string | null;
      name: string;
      values: Record<string, number>;
      total: number;
    }>;
    total: number;
  };
  leadSourceBreakdown: {
    rows: Array<{
      id: string | null;
      name: string;
      total: number;
      percentage: number;
    }>;
    total: number;
  };
  leadsBySource: Array<{ id: string; name: string; total: number }>;
  leadsByStage: Array<{ id: string | null; name: string; total: number }>;
  leadsByDepartment: Array<{ id: string; name: string; total: number }>;
  staffKpi: Array<{ id: string; fullName: string; assignedLeads: number }>;
  admissionFunnel: Array<{ id: string | null; name: string; total: number }>;
};

export type DirectorDashboardFilters = {
  majorId?: string;
  sourceId?: string;
  assigneeId?: string;
  pipelineStageId?: string;
  filterOperator?: "EQUALS" | "NOT_EQUALS";
  timePreset?: "LAST_7_DAYS" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "CUSTOM";
  fromDate?: string;
  toDate?: string;
};
