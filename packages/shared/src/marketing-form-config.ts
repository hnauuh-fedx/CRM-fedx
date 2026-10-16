/** Pure configuration checks shared by the builder and the publication gate. */
export type MarketingFormOption = { value: string; label: string };
export type MarketingFormOptionInput = string | MarketingFormOption;
export type MarketingFormConfigField = {
  fieldKey: string;
  fieldType: string;
  options?: unknown;
  crmMappingField?: string | null;
  leadField?: string | null;
  isActive?: boolean;
  defaultValue?: string | null;
  validationRules?: unknown;
};
export type MarketingFormConfigIssue = { path: Array<string | number>; message: string };
export const marketingFormMappingFields = ["full_name", "phone", "email", "gender", "date_of_birth", "note", "source_id", "institution_program_id", "major_id"] as const;
export function normalizeMarketingFormOptions(input: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (typeof item === "string") return [{ value: item, label: item }];
    if (item && typeof item === "object" && typeof item.value === "string" && typeof item.label === "string") return [{ value: item.value, label: item.label }];
    return [];
  });
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export type MarketingFormOtherAnswer = { kind: "other"; text: string };
export const marketingFormOtherSentinel = "__survey_other__";
export function allowsMarketingFormOther(rules: unknown): boolean { return record(rules).allowOther === true; }
export function isMarketingFormOtherAnswer(value: unknown): value is MarketingFormOtherAnswer {
  const answer = record(value);
  return answer.kind === "other" && typeof answer.text === "string" && Object.keys(answer).length === 2;
}
export function isMarketingFormOtherAnswerValid(value: unknown, rules: unknown): boolean {
  return allowsMarketingFormOther(rules) && isMarketingFormOtherAnswer(value) && Boolean(value.text.trim()) && value.text.length <= 1000;
}
export function validateMarketingFormOther(fields: MarketingFormConfigField[]): MarketingFormConfigIssue[] {
  const issues: MarketingFormConfigIssue[] = [];
  fields.forEach((field, index) => {
    const rules = record(field.validationRules);
    const add = (message: string) => issues.push({ path: ["fields", index, "validationRules", "allowOther"], message });
    if ("allowOther" in rules && typeof rules.allowOther !== "boolean") add("Lựa chọn Khác phải được bật hoặc tắt rõ ràng.");
    if (!allowsMarketingFormOther(rules)) return;
    if (!["radio", "select", "single_select"].includes(field.fieldType)) add("V1 chỉ hỗ trợ Khác cho câu hỏi chọn một đáp án.");
    if (!normalizeMarketingFormOptions(field.options).length) add("Câu hỏi có Khác cần ít nhất một đáp án thông thường.");
    if (field.crmMappingField || field.leadField) add("Câu hỏi có Khác chỉ lưu khảo sát, không mapping vào CRM.");
    if (rules.dependency || fields.some(child => record(record(child.validationRules).dependency).parentFieldKey === field.fieldKey || record(record(child.validationRules).visibility).parentFieldKey === field.fieldKey)) add("V1 chưa dùng câu hỏi có Khác trong chuỗi phụ thuộc hoặc làm điều kiện cho câu khác.");
    if (normalizeMarketingFormOptions(field.options).some(option => option.value === marketingFormOtherSentinel) || field.defaultValue === marketingFormOtherSentinel) add("Mã nội bộ của lựa chọn Khác không được dùng làm đáp án hoặc giá trị mặc định.");
  });
  return issues;
}
export function readMarketingFormQuestionDescription(rules: unknown): string {
  const value = record(rules).questionDescription;
  return typeof value === "string" && value.length <= 1000 ? value.trim() : "";
}
export function readMarketingFormRatingMax(rules: unknown): number {
  const settings = record(rules);
  if (!("ratingMax" in settings)) return 5;
  const value = settings.ratingMax;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 10) throw new Error("Thang đánh giá phải là số nguyên từ 2 đến 10 sao.");
  return value;
}
export function isMarketingFormRatingValueAllowed(value: unknown, rules: unknown): boolean {
  let max: number;
  try { max = readMarketingFormRatingMax(rules); } catch { return false; }
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "string" && !/^[1-9]\d?$/.test(value)) return false;
  if (typeof value !== "string" && typeof value !== "number") return false;
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= max;
}
export function validateMarketingFormRatings(fields: MarketingFormConfigField[]): MarketingFormConfigIssue[] {
  const issues: MarketingFormConfigIssue[] = [];
  fields.forEach((field, index) => {
    if (field.fieldType !== "rating") return;
    try { readMarketingFormRatingMax(field.validationRules); } catch (error) {
      issues.push({ path: ["fields", index, "validationRules", "ratingMax"], message: (error as Error).message });
    }
    if (field.crmMappingField || field.leadField) issues.push({ path: ["fields", index, "crmMappingField"], message: "Đánh giá sao chỉ lưu câu trả lời khảo sát, không mapping vào CRM." });
    if (field.defaultValue && !isMarketingFormRatingValueAllowed(field.defaultValue, field.validationRules)) issues.push({ path: ["fields", index, "defaultValue"], message: "Điểm mặc định phải là số nguyên trong thang đánh giá." });
  });
  return issues;
}
export function validateMarketingFormQuestionDescriptions(fields: MarketingFormConfigField[]): MarketingFormConfigIssue[] {
  return fields.flatMap((field, index) => {
    const rules = record(field.validationRules);
    if (!("questionDescription" in rules)) return [];
    const value = rules.questionDescription;
    return typeof value === "string" && value.length <= 1000 ? [] : [{
      path: ["fields", index, "validationRules", "questionDescription"],
      message: "Mô tả câu hỏi phải là văn bản và không vượt quá 1.000 ký tự.",
    }];
  });
}
export function validateMarketingFormConfig(fields: MarketingFormConfigField[], formType = "lead_form"): MarketingFormConfigIssue[] {
  const issues: MarketingFormConfigIssue[] = [...validateMarketingFormQuestionDescriptions(fields), ...validateMarketingFormRatings(fields), ...validateMarketingFormOther(fields)];
  const keys = new Map<string, number>();
  const targets = new Set<string>();
  const parents = new Map<string, string>();
  if (!fields.some((field) => field.isActive !== false)) issues.push({ path: ["fields"], message: "Biểu mẫu cần ít nhất một câu hỏi đang hoạt động trước khi xuất bản." });
  const add = (index: number, property: string, message: string) => issues.push({ path: ["fields", index, property], message });
  fields.forEach((field, index) => { if (field.isActive !== false) keys.set(field.fieldKey, index); });
  const seenKeys = new Set<string>();
  fields.forEach((field, index) => {
    if (field.isActive === false) return;
    if (seenKeys.has(field.fieldKey)) add(index, "fieldKey", "Mã câu hỏi không được trùng.");
    seenKeys.add(field.fieldKey);
    const target = field.crmMappingField ?? field.leadField;
    if (field.crmMappingField && field.leadField && field.crmMappingField !== field.leadField) add(index, "crmMappingField", "Hai cấu hình mapping CRM không khớp.");
    if (target) {
      if (!marketingFormMappingFields.some((allowed) => allowed === target)) add(index, "crmMappingField", "Trường CRM không được hỗ trợ.");
      if (targets.has(target)) add(index, "crmMappingField", "Mỗi trường CRM chỉ được nhận dữ liệu từ một câu hỏi.");
      targets.add(target);
      if (["checkbox", "multi_select", "file"].includes(field.fieldType)) add(index, "crmMappingField", "Kiểu câu hỏi này chỉ hỗ trợ lưu câu trả lời khảo sát.");
    }
    const options = normalizeMarketingFormOptions(field.options);
    if (options.some((option, optionIndex) => !option.value.trim() || !option.label.trim() || options.findIndex((other) => other.value === option.value) !== optionIndex)) add(index, "options", "Giá trị lựa chọn phải có nhãn và không được trùng.");
    if (["select", "single_select", "multi_select", "radio", "checkbox"].includes(field.fieldType) && options.length === 0) add(index, "options", "Câu hỏi lựa chọn cần ít nhất một đáp án trước khi xuất bản.");
    const defaults = ["checkbox", "multi_select"].includes(field.fieldType) ? (field.defaultValue ?? "").split(",").map((value) => value.trim()).filter(Boolean) : field.defaultValue ? [field.defaultValue] : [];
    if (field.fieldType !== "rating" && options.length && defaults.some((value) => !options.some((option) => option.value === value))) add(index, "defaultValue", "Giá trị mặc định không nằm trong danh sách lựa chọn.");
    const dependency = record(record(field.validationRules).dependency);
    if (!dependency.parentFieldKey) return;
    if (typeof dependency.parentFieldKey !== "string" || !keys.has(dependency.parentFieldKey) || dependency.parentFieldKey === field.fieldKey) {
      add(index, "validationRules", "Câu hỏi phụ thuộc phải trỏ tới câu hỏi đang hoạt động khác."); return;
    }
    const parent = fields[keys.get(dependency.parentFieldKey)!];
    if (!["select", "single_select", "radio"].includes(parent.fieldType)) add(index, "validationRules", "Câu hỏi cha phải là câu hỏi chọn một đáp án.");
    parents.set(field.fieldKey, parent.fieldKey);
    const parentValues = new Set(normalizeMarketingFormOptions(parent.options).map((option) => option.value));
    const childValues = new Set(options.map((option) => option.value));
    for (const [key, values] of Object.entries(record(dependency.optionMap))) {
      if (!parentValues.has(key) || !Array.isArray(values) || values.some((value) => typeof value !== "string" || !childValues.has(value))) add(index, "validationRules", "Lựa chọn phụ thuộc không khớp đáp án của câu hỏi cha/con.");
    }
  });
  for (const [key, parent] of parents) {
    const visited = new Set([key]);
    let cursor: string | undefined = parent;
    while (cursor) {
      if (visited.has(cursor)) { add(keys.get(key)!, "validationRules", "Không được tạo vòng lặp câu hỏi phụ thuộc."); break; }
      visited.add(cursor); cursor = parents.get(cursor);
    }
  }
  if (formType !== "survey" && (!targets.has("full_name") || !targets.has("phone"))) issues.push({ path: ["fields"], message: "Form tạo Lead cần mapping Họ tên và Số điện thoại trước khi xuất bản." });
  return issues;
}
