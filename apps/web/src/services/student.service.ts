import type {
  StudentDetail,
  StudentFilterOptions,
  StudentListFilters,
  StudentListResponse,
  StudentServiceInput,
  StudentServiceOptions,
  StudentServiceUpdateInput,
  StudentSortField,
  StudentUpdateInput,
} from "@/modules/students/student.types";
import type {
  BusinessRecordListParams,
  BusinessRecordListResponse,
} from "@/components/shared/business-records.types";
import { apiRequest } from "./api";

type StudentListParams = {
  page: number;
  limit: number;
  sortBy: StudentSortField;
  sortOrder: "asc" | "desc";
} & StudentListFilters;

export function getStudents(params: StudentListParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status,
    majorId: params.majorId,
    facultyId: params.facultyId,
    classId: params.classId,
  });

  return apiRequest<StudentListResponse>(`/students?${query.toString()}`, {}, accessToken);
}

export function getStudentFilterOptions(accessToken: string) {
  return apiRequest<StudentFilterOptions>("/students/options", {}, accessToken);
}

export function getStudentDetail(id: string, accessToken: string) {
  return apiRequest<StudentDetail>(`/students/${id}`, {}, accessToken);
}

export function updateStudentAcademicInfo(id: string, input: StudentUpdateInput, accessToken: string) {
  return apiRequest<StudentDetail>(
    `/students/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export type StudentServiceSortField = "createdAt" | "type" | "status";

export function getStudentServices(
  params: BusinessRecordListParams<StudentServiceSortField>,
  accessToken: string,
) {
  return apiRequest<BusinessRecordListResponse<StudentServiceSortField>>(
    `/students/services?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getStudentServiceOptions(accessToken: string) {
  return apiRequest<StudentServiceOptions>("/students/services/options", {}, accessToken);
}

export function createStudentService(input: StudentServiceInput, accessToken: string) {
  return apiRequest<{ id: string }>(
    "/students/services",
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function updateStudentService(id: string, input: StudentServiceUpdateInput, accessToken: string) {
  return apiRequest<{ id: string }>(
    `/students/services/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export function getStudentSupportHistory(
  params: BusinessRecordListParams<StudentServiceSortField> & { studentId?: string },
  accessToken: string,
) {
  return apiRequest<BusinessRecordListResponse<StudentServiceSortField>>(
    `/students/support-history?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

function toBusinessQuery<TSort extends string>(params: BusinessRecordListParams<TSort>) {
  return new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    type: params.type ?? "",
    status: params.status ?? "",
    studentId: "studentId" in params ? String(params.studentId ?? "") : "",
  }).toString();
}
