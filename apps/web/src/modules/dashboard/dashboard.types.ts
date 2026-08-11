export type DirectorDashboardResponse = {
  summary: {
    totalLeads: number;
    totalApplications: number;
    enrolledStudents: number;
    leadToApplicationRate: number;
    applicationToStudentRate: number;
    conversionRate: number;
    monthlyRevenue: number;
  };
  leadsBySource: Array<{ id: string; name: string; total: number }>;
  leadsByStage: Array<{ id: string | null; name: string; total: number }>;
  leadsByDepartment: Array<{ id: string; name: string; total: number }>;
  staffKpi: Array<{ id: string; fullName: string; assignedLeads: number }>;
  admissionFunnel: Array<{ id: string | null; name: string; total: number }>;
};
