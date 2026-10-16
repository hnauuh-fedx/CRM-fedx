import { leadFormFieldCatalog } from "./lead-form-field-catalog.js";

/** Layout is presentation only. Business data authorization remains on the API. */
export const listLayoutScreens = ["LEAD_LIST", "CUSTOMER_LIST"] as const;
export type ListLayoutScreen = (typeof listLayoutScreens)[number];
export const layoutScreens = [
  ...listLayoutScreens,
  "LEAD_DETAIL",
  "LEAD_FORM",
] as const;
export type LayoutScreen = (typeof layoutScreens)[number];
export const layoutScreenLabels: Record<LayoutScreen, string> = {
  LEAD_LIST: "Danh sách lead",
  CUSTOMER_LIST: "Danh sách khách hàng",
  LEAD_DETAIL: "Chi tiết lead",
  LEAD_FORM: "Tạo và sửa lead",
};
export function isListLayoutScreen(
  screen: LayoutScreen,
): screen is ListLayoutScreen {
  return screen === "LEAD_LIST" || screen === "CUSTOMER_LIST";
}
export function getDisplayFields(screen: LayoutScreen): DisplayField[] {
  if (isListLayoutScreen(screen)) return leadDisplayFields;
  return [
    ...leadFormFieldCatalog
      .flatMap((group) => group.fields)
      .map((field) => ({
        key: field.key,
        label: field.label,
        locked:
          field.key === "fullName" ||
          (screen === "LEAD_FORM" &&
            (Boolean(field.requiredLocked) ||
              field.key === "institutionProgramId")),
      })),
    { key: "assigneeId", label: "Sale phụ trách" },
  ];
}
export type DisplayField = {
  key: string;
  label: string;
  locked?: boolean;
  isNew?: boolean;
};
export type LayoutTarget = {
  type: "DEFAULT" | "DEPARTMENT" | "USER";
  id: string;
};
export type LayoutDraft = {
  name: string;
  visibleFields: string[];
  targets: LayoutTarget[];
  knownFields?: string[];
  pinnedFields?: string[];
  columnWidths?: Record<string, number>;
  personalization?: PersonalizationPolicy;
};
export type DisplayLayout = {
  id: string;
  screen?: LayoutScreen;
  revision: number;
  managementDepartmentId: string | null;
  draft: LayoutDraft;
  published: LayoutDraft | null;
  publishedVersion: number;
};
export type LayoutVersion = {
  version: number;
  name: string;
  visibleFields: string[];
  createdAt: string;
  actorName: string;
  pinnedFields?: string[];
  columnWidths?: Record<string, number>;
  personalization?: PersonalizationPolicy;
};
export type LayoutImpact = {
  departments: number;
  users: number;
  overriddenUsers: number;
  replacedAssignments: number;
  assignmentRevision: number;
  replacedTemplates: Array<{ name: string; assignments: number }>;
};
export type EffectiveLayout = {
  visibleFields: string[];
  name: string;
  source: "USER" | "DEPARTMENT" | "DEFAULT" | "SYSTEM";
  ambiguousDepartment: boolean;
  pinnedFields: string[];
  columnWidths: Record<string, number>;
  policy: PersonalizationPolicy;
  baseTemplateId: string | null;
  baseVersion: number;
  personalRevision: number;
  personalized: boolean;
  personalizationStale: boolean;
  inherited: LayoutPresentation;
};

export type PersonalizationPolicy = {
  visibility: boolean;
  order: boolean;
  pinning: boolean;
  widths: boolean;
};
export type LayoutPresentation = {
  visibleFields: string[];
  pinnedFields: string[];
  columnWidths: Record<string, number>;
};
export type PersonalLayoutWrite = {
  revision: number;
  baseTemplateId: string;
  baseVersion: number;
  presentation: LayoutPresentation;
};
export const lockedPersonalization: PersonalizationPolicy = {
  visibility: false,
  order: false,
  pinning: false,
  widths: false,
};
export const defaultDisplayColumnWidth = 220;
export const minDisplayColumnWidth = 120;
export const maxDisplayColumnWidth = 600;
export const maxPinnedDisplayFields = 3;

export function presentationIssues(
  value: LayoutPresentation,
  allowedFields: string[],
): string[] {
  const allowed = new Set(allowedFields);
  const visible = new Set(value.visibleFields);
  const issues: string[] = [];
  if (
    visible.size !== value.visibleFields.length ||
    value.visibleFields.some((key) => !allowed.has(key))
  )
    issues.push("Có cột trùng hoặc nằm ngoài mẫu được giao.");
  if (!visible.has("fullName"))
    issues.push("Cần giữ cột Họ và tên để nhận diện lead.");
  if (
    value.pinnedFields.length > maxPinnedDisplayFields ||
    new Set(value.pinnedFields).size !== value.pinnedFields.length ||
    value.pinnedFields.some((key) => !visible.has(key))
  )
    issues.push("Chỉ được ghim tối đa 3 cột đang hiển thị, không trùng nhau.");
  if (
    Object.entries(value.columnWidths).some(
      ([key, width]) =>
        !visible.has(key) ||
        !Number.isInteger(width) ||
        width < minDisplayColumnWidth ||
        width > maxDisplayColumnWidth,
    )
  )
    issues.push(
      "Độ rộng của cột đang hiển thị cần là số nguyên từ 120 đến 600 px.",
    );
  return issues;
}

export function normalizePresentation(
  draft: Pick<LayoutDraft, "visibleFields" | "pinnedFields" | "columnWidths">,
  fields: DisplayField[] = leadDisplayFields,
): LayoutPresentation {
  const visibleFields = normalizeVisibleFields(draft.visibleFields, fields);
  const visible = new Set(visibleFields);
  return {
    visibleFields,
    pinnedFields: [...new Set(draft.pinnedFields ?? [])]
      .filter((key) => visible.has(key))
      .slice(0, maxPinnedDisplayFields),
    columnWidths: Object.fromEntries(
      Object.entries(draft.columnWidths ?? {}).filter(
        ([key, width]) =>
          visible.has(key) &&
          Number.isInteger(width) &&
          width >= minDisplayColumnWidth &&
          width <= maxDisplayColumnWidth,
      ),
    ),
  };
}

export function personalPresentationIssues(
  value: LayoutPresentation,
  base: LayoutPresentation,
  policy: PersonalizationPolicy,
): string[] {
  const issues = presentationIssues(value, base.visibleFields);
  const visible = new Set(value.visibleFields);
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  if (
    !policy.visibility &&
    (value.visibleFields.length !== base.visibleFields.length ||
      base.visibleFields.some((key) => !visible.has(key)))
  )
    issues.push("Người quản lý chưa cho phép ẩn hoặc hiện cột cá nhân.");
  if (
    !policy.order &&
    !same(
      value.visibleFields,
      base.visibleFields.filter((key) => visible.has(key)),
    )
  )
    issues.push("Người quản lý chưa cho phép đổi thứ tự cột cá nhân.");
  if (
    !policy.pinning &&
    !same(
      value.pinnedFields,
      base.pinnedFields.filter((key) => visible.has(key)),
    )
  )
    issues.push("Người quản lý chưa cho phép đổi cột ghim cá nhân.");
  if (!policy.widths) {
    const expected = Object.fromEntries(
      Object.entries(base.columnWidths).filter(([key]) => visible.has(key)),
    );
    const keys = new Set([
      ...Object.keys(expected),
      ...Object.keys(value.columnWidths),
    ]);
    if ([...keys].some((key) => expected[key] !== value.columnWidths[key]))
      issues.push("Người quản lý chưa cho phép đổi độ rộng cột cá nhân.");
  }
  return issues;
}

export const leadDisplayFields: DisplayField[] = [
  { key: "fullName", label: "Họ và tên", locked: true },
  { key: "phone", label: "Số điện thoại" },
  { key: "pipelineStage", label: "Quy trình Telesale" },
  { key: "origin", label: "Nhóm nguồn" },
  { key: "source", label: "Nguồn học viên" },
  { key: "assignee", label: "Nhân viên sale" },
  { key: "gender", label: "Giới tính" },
  { key: "dateOfBirth", label: "Ngày sinh" },
  { key: "majorName", label: "Ngành đăng ký" },
  { key: "email", label: "Email" },
  { key: "birthPlace", label: "Nơi sinh" },
  { key: "specificAddress", label: "Địa chỉ cụ thể" },
  { key: "cccd", label: "CCCD" },
  { key: "cccdIssueDate", label: "Ngày cấp CCCD" },
  { key: "cccdIssuePlace", label: "Nơi cấp CCCD" },
  { key: "ethnicity", label: "Dân tộc" },
  { key: "religion", label: "Tôn giáo" },
  { key: "nationality", label: "Quốc tịch" },
  { key: "graduationYear", label: "Năm tốt nghiệp" },
  { key: "graduationCertificate", label: "Bằng tốt nghiệp" },
  { key: "previousGraduationCertificate", label: "Bằng tốt nghiệp cũ" },
  { key: "graduationMajor", label: "Ngành tốt nghiệp" },
  { key: "graduationRank", label: "Xếp loại TN" },
  { key: "diplomaIssuePlace", label: "Nơi cấp bằng" },
  { key: "academicRank12", label: "Học lực lớp 12" },
  { key: "conductRank12", label: "Hạnh kiểm lớp 12" },
  { key: "highSchoolName", label: "Trường THPT" },
  { key: "highSchoolDistrict", label: "Quận/huyện THPT" },
  { key: "highSchoolProvince", label: "Tỉnh/TP THPT" },
  { key: "hamlet", label: "Ấp/Thôn" },
  { key: "ward", label: "Xã/Phường" },
  { key: "district", label: "Thị xã/Huyện" },
  { key: "province", label: "Tỉnh/Thành phố" },
  { key: "currentAddress", label: "Địa chỉ hiện nay" },
  { key: "permanentAddress", label: "Địa chỉ thường trú" },
  { key: "currentResidence", label: "Nơi ở hiện tại" },
  { key: "currentJob", label: "Công việc hiện nay" },
  { key: "companyName", label: "Cơ quan công tác" },
  { key: "relative1FullName", label: "Người thân 1" },
  { key: "relative1Relationship", label: "Quan hệ 1" },
  { key: "relative1Phone", label: "Điện thoại 1" },
  { key: "relative1Job", label: "Nghề nghiệp 1" },
  { key: "relative1Address", label: "Địa chỉ 1" },
  { key: "relative2FullName", label: "Người thân 2" },
  { key: "relative2Relationship", label: "Quan hệ 2" },
  { key: "relative2Phone", label: "Điện thoại 2" },
  { key: "relative2Job", label: "Nghề nghiệp 2" },
  { key: "relative2Address", label: "Địa chỉ 2" },
  { key: "admissionStatusName", label: "Trạng thái hồ sơ" },
  { key: "trainingCode", label: "Mã ĐT" },
  { key: "classCode", label: "Mã lớp" },
  { key: "subjectGroupCode", label: "Mã tổ hợp môn" },
  { key: "subjectGroupName", label: "Tên tổ hợp môn" },
  { key: "score1", label: "Điểm TH1" },
  { key: "score2", label: "Điểm TH2" },
  { key: "score3", label: "Điểm TH3" },
  { key: "admissionScore", label: "Điểm XT" },
  { key: "enrollmentBatch", label: "Đợt khai giảng" },
  { key: "registrationStation", label: "Trạm đăng ký" },
  { key: "decisionNumber", label: "Số quyết định" },
  { key: "decisionSignedDate", label: "Ngày ký quyết định" },
  { key: "monthlyRevenue", label: "Doanh số tháng" },
  { key: "temperature", label: "Mức độ quan tâm" },
  { key: "gclid", label: "Gclid" },
  { key: "tags", label: "Tags" },
  { key: "note", label: "Ghi chú" },
];

export function layoutIssues(
  draft: LayoutDraft,
  fields: DisplayField[],
): string[] {
  const keys = new Set(fields.map((field) => field.key));
  const issues: string[] = [];
  if (draft.name.trim().length < 2 || draft.name.trim().length > 120)
    issues.push("Tên mẫu cần từ 2 đến 120 ký tự.");
  if (new Set(draft.visibleFields).size !== draft.visibleFields.length)
    issues.push("Trường hiển thị không được trùng.");
  if (draft.visibleFields.some((key) => !keys.has(key)))
    issues.push(
      "Có trường đã ngừng sử dụng. Vui lòng bỏ trường đó trước khi lưu.",
    );
  if (
    fields.some(
      (field) => field.locked && !draft.visibleFields.includes(field.key),
    )
  )
    issues.push("Cần giữ các cột nhận diện bắt buộc.");
  const targets = draft.targets.map((target) => `${target.type}:${target.id}`);
  if (new Set(targets).size !== targets.length)
    issues.push("Đối tượng áp dụng không được trùng.");
  return issues;
}

export function normalizeVisibleFields(
  saved: string[] | null,
  fields: DisplayField[],
): string[] {
  if (saved === null) return fields.map((field) => field.key);
  const allowed = new Set(fields.map((field) => field.key));
  const visible = [...new Set(saved)].filter((key) => allowed.has(key));
  for (const field of fields)
    if (field.locked && !visible.includes(field.key))
      visible.unshift(field.key);
  return visible;
}

export function moveDisplayField(
  visible: string[],
  key: string,
  before?: string,
): string[] {
  if (key === before) return visible;
  const next = visible.filter((item) => item !== key);
  const index = before ? next.indexOf(before) : -1;
  next.splice(index < 0 ? next.length : index, 0, key);
  return next;
}

export function chooseLayoutTarget(
  userId: string,
  departmentIds: string[],
  targets: LayoutTarget[],
): LayoutTarget | undefined {
  const user = targets.find(
    (target) => target.type === "USER" && target.id === userId,
  );
  if (user) return user;
  // No primary/working department exists in the current schema. Never choose arbitrarily.
  if (departmentIds.length === 1) {
    const department = targets.find(
      (target) =>
        target.type === "DEPARTMENT" && target.id === departmentIds[0],
    );
    if (department) return department;
  }
  return targets.find((target) => target.type === "DEFAULT");
}
