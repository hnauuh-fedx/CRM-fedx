import { leadFormFieldCatalog, type LeadSystemField } from "@admission-crm/shared/lead-form-field-catalog";

const extraFields: LeadSystemField[] = [
  { key: "secondaryPhones", label: "Số điện thoại phụ", dataType: "MULTI_SELECT", storage: "leads.secondary_phones", isSensitive: true },
  { key: "originId", label: "Nguồn tiếp cận", dataType: "SELECT", storage: "leads.origin_id" },
  { key: "leadScore", label: "Điểm Lead", dataType: "NUMBER", storage: "leads.lead_score" },
  { key: "leadCode", label: "Mã Lead", dataType: "TEXT", storage: "leads.lead_code" },
  { key: "assigneeId", label: "Sale phụ trách", dataType: "SELECT", storage: "leads.assigned_to" },
  { key: "secondaryAssigneeId", label: "Sale phụ trách phụ", dataType: "SELECT", storage: "leads.secondary_assigned_to" },
  { key: "admissionCode", label: "Mã hồ sơ", dataType: "TEXT", storage: "admission_profiles.admission_code" },
  { key: "trainingType", label: "Loại hình đào tạo", dataType: "TEXT", storage: "admission_profiles.training_type" },
  { key: "applicationReceivedDate", label: "Ngày nhận hồ sơ", dataType: "DATE", storage: "admission_profiles.application_received_date" },
  { key: "telesaleReceivedDate", label: "Ngày Telesale tiếp nhận", dataType: "DATE", storage: "admission_profiles.telesale_received_date" },
  { key: "admissionExpiresAt", label: "Ngày hết hạn hồ sơ", dataType: "DATE", storage: "admission_profiles.expires_at" },
  { key: "studentCardStatus", label: "Trạng thái thẻ sinh viên", dataType: "TEXT", storage: "admission_profiles.student_card_status" },
  { key: "feeStatus", label: "Trạng thái lệ phí", dataType: "TEXT", storage: "admission_profiles.fee_status" },
  { key: "tuitionStatus", label: "Trạng thái học phí", dataType: "TEXT", storage: "admission_profiles.tuition_status" },
];

export const leadInformationSystemFields = [
  ...leadFormFieldCatalog.flatMap((group) => group.fields.map((field) => ({ ...field, groupKey: group.id, groupLabel: group.label }))),
  ...extraFields.map((field) => ({ ...field, groupKey: field.storage.startsWith("admission_profiles.") ? "admission" : "basic", groupLabel: field.storage.startsWith("admission_profiles.") ? "Thông tin tuyển sinh" : "Thông tin cơ bản" })),
];

export const informationReadOnlyReasons: Record<string, string> = {
  pipelineStageId: "Dùng node Cập nhật Pipeline để giữ lịch sử giai đoạn và ghi chú chuyển bước.",
  admissionStatusId: "Dùng node Cập nhật trạng thái hồ sơ để kiểm tra luồng duyệt và nhập học.",
  institutionProgramId: "Chuyển chương trình qua chức năng quản lý hồ sơ để kiểm tra lại toàn bộ dữ liệu liên quan.",
  assigneeId: "Dùng node Phân công Sale hoặc Chia Lead tự động để ghi nhận phân công và thông báo.",
  secondaryAssigneeId: "Thay đổi Sale phụ trách phụ qua chức năng phân công Lead.",
  leadCode: "Mã Lead do hệ thống quản lý.",
  feeStatus: "Cập nhật qua chức năng thanh toán lệ phí để giữ lịch sử tài chính.",
  tuitionStatus: "Cập nhật qua chức năng thanh toán học phí để giữ lịch sử tài chính.",
};

export function informationFieldRules(key: string): Record<string, unknown> {
  if (key === "graduationYear") return { integer: true, min: 0, max: 2100 };
  if (key === "leadScore") return { integer: true, min: 0, max: 2147483647 };
  if (["score1", "score2", "score3", "admissionScore"].includes(key)) return { min: 0, max: 999.99, decimalPlaces: 2 };
  if (key === "monthlyRevenue") return { min: 0, max: 9999999999999.99, decimalPlaces: 2 };
  if (key === "secondaryPhones") return { phone: true, maxItems: 5, maxLength: 30 };
  if (key === "tags") return { maxItems: 20, maxLength: 100 };
  if (["cccd", "phone"].includes(key)) return { maxLength: 30 };
  if (key === "temperature") return { maxLength: 50 };
  if (key === "note") return { maxLength: 2000 };
  if (key === "gclid" || key.endsWith("Address") || key === "currentResidence") return { maxLength: 1000 };
  if (["nationality", "ethnicity", "religion", "graduationRank", "academicRank12", "conductRank12", "trainingCode", "classCode", "subjectGroupCode", "admissionCode", "studentCardStatus"].includes(key) || key.endsWith("Relationship")) return { maxLength: 100 };
  if (["province", "district", "ward", "hamlet", "highSchoolProvince", "highSchoolDistrict", "enrollmentBatch", "registrationStation", "decisionNumber", "trainingType"].includes(key)) return { maxLength: 150 };
  return { maxLength: 255, ...(key === "fullName" ? { minLength: 2 } : {}) };
}
