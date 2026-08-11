export type StudentSortField = "enrolledAt" | "studentCode" | "status";

export type StudentListFilters = {
  search: string;
  status: string;
  majorId: string;
  facultyId: string;
  classId: string;
};

export type StudentListItem = {
  id: string;
  studentCode: string;
  status: string | null;
  enrolledAt: string | null;
  createdAt: string | null;
  lead: { id: string; leadCode: string | null; fullName: string } | null;
  admissionProfile: { id: string; admissionCode: string | null } | null;
  institutionProgram: { id: string; name: string; institutionName: string } | null;
  major: { id: string; name: string } | null;
  faculty: { id: string; name: string } | null;
  studentClass: { id: string; name: string } | null;
};

export type StudentDetail = StudentListItem & {
  lead: (StudentListItem["lead"] & {
    gender: string | null;
    dateOfBirth: string | null;
    profile: {
      highSchoolName: string | null;
      graduationYear: number | null;
      nationality: string | null;
      ethnicity: string | null;
    } | null;
  }) | null;
  admissionProfile: (StudentListItem["admissionProfile"] & {
    trainingType: string | null;
    enrollmentBatch: string | null;
    feeStatus: string | null;
    tuitionStatus: string | null;
  }) | null;
  studentClass: {
    id: string;
    name: string;
    code: string | null;
    faculty: { id: string; name: string } | null;
  } | null;
  recentServices: Array<{
    id: string;
    type: string | null;
    content: string | null;
    createdAt: string | null;
    handledBy: { id: string; fullName: string } | null;
  }>;
};

export type StudentUpdateInput = {
  status: string;
  facultyId?: string;
  classId?: string;
};

export type StudentServiceStatus = "open" | "in_progress" | "resolved" | "closed" | "cancelled";

export type StudentServiceInput = {
  studentId: string;
  type: string;
  content: string;
  handledBy?: string;
  status?: StudentServiceStatus;
};

export type StudentServiceUpdateInput = {
  type?: string;
  content?: string;
  handledBy?: string | null;
  status?: StudentServiceStatus;
};

export type StudentServiceOptions = {
  types: string[];
  statuses: string[];
  students: Array<{ id: string; studentCode: string; fullName: string | null }>;
  assignees: Array<{ id: string; fullName: string }>;
};

export type StudentListResponse = {
  data: StudentListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: StudentSortField; sortOrder: "asc" | "desc" };
  filters: StudentListFilters;
};

export type StudentFilterOptions = {
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  majors: Array<{ id: string; name: string }>;
  faculties: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string; facultyName: string | null }>;
  statuses: string[];
};
