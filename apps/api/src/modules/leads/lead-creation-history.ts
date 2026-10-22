import type { LeadInput } from "./domain/lead-input";

export type LeadCreationSource = {
  channel: "manual" | "api" | "webhook" | "public_form" | "import";
  webhookId?: string;
  webhookName?: string;
  requestId?: string;
  formId?: string;
  formName?: string;
};

export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function createLeadCreationSnapshot(input: LeadInput & { sourceName?: string; pipelineStageName?: string; assigneeName?: string; secondaryAssigneeName?: string }, source: LeadCreationSource, creatorName?: string) {
  return { ...source, creatorName: creatorName ?? null, initialValues: { ...input } };
}

const fieldLabels: Record<string, string> = {
  sourceName: "Nguồn học viên", source: "Nguồn nhận từ API", pipelineStageName: "Tiến trình", assigneeName: "Nhân viên phụ trách", secondaryAssigneeName: "Nhân viên phụ trách phụ",
  fullName: "Họ và tên", phone: "Số điện thoại", secondaryPhones: "Số điện thoại phụ", email: "Email",
  sourceId: "Nguồn học viên (mã)", originId: "Nguồn tiếp cận (mã)", institutionProgramId: "Chương trình (mã)",
  majorId: "Ngành (mã)", assigneeId: "Nhân viên phụ trách (mã)", secondaryAssigneeId: "Nhân viên phụ trách phụ (mã)",
  pipelineStageId: "Tiến trình (mã)", admissionStatusId: "Trạng thái tuyển sinh (mã)",
  gender: "Giới tính", dateOfBirth: "Ngày sinh", note: "Ghi chú", noteContent: "Nội dung ghi chú",
  temperature: "Mức độ quan tâm", birthPlace: "Nơi sinh", cccd: "CCCD", cccdIssueDate: "Ngày cấp CCCD", cccdIssuePlace: "Nơi cấp CCCD",
  nationality: "Quốc tịch", ethnicity: "Dân tộc", religion: "Tôn giáo", graduationYear: "Năm tốt nghiệp",
  graduationCertificate: "Bằng tốt nghiệp", previousGraduationCertificate: "Bằng tốt nghiệp trước đó", graduationMajor: "Ngành tốt nghiệp",
  graduationRank: "Xếp loại tốt nghiệp", diplomaIssuePlace: "Nơi cấp bằng", academicRank12: "Học lực lớp 12", conductRank12: "Hạnh kiểm lớp 12",
  highSchoolName: "Trường THPT", highSchoolProvince: "Tỉnh trường THPT", highSchoolDistrict: "Huyện trường THPT",
  currentJob: "Nghề nghiệp", companyName: "Đơn vị công tác", specificAddress: "Địa chỉ cụ thể", permanentAddress: "Địa chỉ thường trú",
  currentAddress: "Địa chỉ hiện tại", currentResidence: "Nơi cư trú", province: "Tỉnh/thành phố", district: "Quận/huyện", ward: "Phường/xã", hamlet: "Thôn/ấp",
  relative1FullName: "Họ tên người thân 1", relative1Relationship: "Quan hệ người thân 1", relative1Phone: "Điện thoại người thân 1", relative1Job: "Nghề nghiệp người thân 1", relative1Address: "Địa chỉ người thân 1",
  relative2FullName: "Họ tên người thân 2", relative2Relationship: "Quan hệ người thân 2", relative2Phone: "Điện thoại người thân 2", relative2Job: "Nghề nghiệp người thân 2", relative2Address: "Địa chỉ người thân 2",
  trainingCode: "Mã hệ đào tạo", classCode: "Mã lớp", subjectGroupCode: "Mã tổ hợp", subjectGroupName: "Tên tổ hợp",
  score1: "Điểm môn 1", score2: "Điểm môn 2", score3: "Điểm môn 3", admissionScore: "Điểm xét tuyển", enrollmentBatch: "Đợt nhập học",
  registrationStation: "Trạm đăng ký", decisionNumber: "Số quyết định", decisionSignedDate: "Ngày ký quyết định", monthlyRevenue: "Doanh thu tháng", gclid: "GCLID", tags: "Thẻ",
};

// Free text, contact details and personal information use the same permission as Lead details.
const publicFields = new Set(["sourceName", "source", "pipelineStageName", "assigneeName", "secondaryAssigneeName", "fullName", "sourceId", "originId", "institutionProgramId", "majorId", "assigneeId", "secondaryAssigneeId", "pipelineStageId", "admissionStatusId", "temperature"]);

export function describeLeadCreation(creation: unknown, canViewSensitive: boolean, fallbackActor?: string | null) {
  const data = recordObject(creation);
  const automated = ["api", "webhook", "public_form"].includes(String(data.channel));
  const actorLabel = data.channel === "public_form" ? "Biểu mẫu hệ thống" : automated ? "API / Webhook" : String(data.creatorName || fallbackActor || "Không còn thông tin người tạo");
  const name = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  let title = data.channel === "public_form"
    ? `Tạo lead từ biểu mẫu ${name(data.formName) ?? name(data.formId) ?? "không còn thông tin tên"}.`
    : automated
      ? `API đã đổ dữ liệu tạo lead${data.channel === "webhook" ? ` qua webhook ${name(data.webhookName) ?? name(data.webhookId) ?? "không còn thông tin tên"}` : ""}${data.formId ? `; biểu mẫu ${name(data.formName) ?? name(data.formId)}` : ""}.`
      : data.channel === "import" ? `${actorLabel} nhập lead từ tệp.` : `${actorLabel} tạo lead mới thủ công.`;
  if (data.channel === "unknown") title = `Ghi nhận tạo lead. Tài khoản ghi nhận: ${actorLabel}. Bản ghi cũ chưa lưu hình thức tạo.`;
  if (data.channel === "api" && name(data.webhookName)) title = `API đã đổ dữ liệu tạo lead từ ${data.webhookName}.`;
  if (data.channel === "webhook" && data.formId && !data.webhookId && !data.webhookName) title = `API đã đổ dữ liệu tạo lead qua webhook của biểu mẫu ${name(data.formName) ?? data.formId}.`;
  if (name(data.requestId)) title += ` Mã yêu cầu: ${data.requestId}.`;
  const values = recordObject(data.initialValues);
  const details = Object.entries(fieldLabels).flatMap(([key, label]) => {
    const value = values[key];
    const referenceName = { sourceId: "sourceName", pipelineStageId: "pipelineStageName", assigneeId: "assigneeName", secondaryAssigneeId: "secondaryAssigneeName" }[key];
    if (referenceName && values[referenceName]) return [];
    if ((!canViewSensitive && !publicFields.has(key)) || value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return [];
    if (typeof value !== "string" && typeof value !== "number" && !Array.isArray(value)) return [];
    return [`${label}: ${Array.isArray(value) ? value.filter(v => typeof v === "string").join(", ") : value}`];
  });
  return { actorLabel, automated, description: [title, details.length ? "Thông tin lúc tạo:" : "Bản ghi cũ không lưu chi tiết thông tin lúc tạo.", ...details].join("\n") };
}
