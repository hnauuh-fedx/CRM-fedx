import { normalizeMarketingFormOptions, type MarketingFormConfigField, type MarketingFormConfigIssue } from "./marketing-form-config.js";

export const marketingFormVisibilityOperators = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
export type MarketingFormVisibility = { parentFieldKey: string; operator: typeof marketingFormVisibilityOperators[number]; value?: string };
export const marketingFormVisibilityParentTypes = ["text", "textarea", "phone", "email", "number", "date", "province", "select", "single_select", "radio", "checkbox", "multi_select"];
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function readMarketingFormVisibility(rules: unknown): MarketingFormVisibility | null {
  const raw = record(rules).visibility;
  if (raw === undefined) return null;
  const config = record(raw);
  if (typeof config.parentFieldKey !== "string" || !config.parentFieldKey || !marketingFormVisibilityOperators.includes(config.operator as MarketingFormVisibility["operator"])) throw new Error("Điều kiện hiện câu hỏi cần câu hỏi cha và toán tử hợp lệ.");
  const operator = config.operator as MarketingFormVisibility["operator"];
  if (!["is_empty", "is_not_empty"].includes(operator) && (typeof config.value !== "string" || !config.value.trim() || config.value.length > 1000)) throw new Error("Vui lòng nhập giá trị so sánh (tối đa 1.000 ký tự).");
  return { parentFieldKey: config.parentFieldKey, operator, ...(!["is_empty", "is_not_empty"].includes(operator) ? { value: config.value as string } : {}) };
}
function dependencyParent(field: MarketingFormConfigField) {
  const parent = record(record(field.validationRules).dependency).parentFieldKey;
  return typeof parent === "string" && parent ? parent : null;
}
export function validateMarketingFormVisibility(fields: MarketingFormConfigField[], formType?: string): MarketingFormConfigIssue[] {
  const active = fields.filter(field => field.isActive !== false);
  const byKey = new Map(active.map(field => [field.fieldKey, field]));
  const issues: MarketingFormConfigIssue[] = [];
  const edges = new Map<string, string[]>();
  const conditional = new Set<string>();
  fields.forEach((field, index) => {
    if (field.isActive === false) return;
    const path = ["fields", index, "validationRules", "visibility"];
    let condition: MarketingFormVisibility | null;
    try { condition = readMarketingFormVisibility(field.validationRules); }
    catch (error) { issues.push({ path, message: (error as Error).message }); return; }
    edges.set(field.fieldKey, [condition?.parentFieldKey, dependencyParent(field)].filter((key): key is string => Boolean(key)));
    if (!condition) return;
    conditional.add(field.fieldKey);
    const parent = byKey.get(condition.parentFieldKey);
    if (!parent || parent === field || !marketingFormVisibilityParentTypes.includes(parent.fieldType)) { issues.push({ path, message: "Chọn câu hỏi cha đang hoạt động khác, không phải tệp/field ẩn/đánh giá." }); return; }
    if (["checkbox", "multi_select"].includes(parent.fieldType) && ["equals", "not_equals"].includes(condition.operator)) issues.push({ path, message: "Câu hỏi nhiều lựa chọn cần dùng Có chứa, Trống hoặc Không trống." });
    const choices = normalizeMarketingFormOptions(parent.options);
    if (condition.value && choices.length && !choices.some(option => option.value === condition.value)) issues.push({ path, message: "Giá trị điều kiện phải thuộc đáp án của câu hỏi cha (dùng mã giá trị, không dùng nhãn)." });
    const target = field.crmMappingField ?? field.leadField;
    if (formType && formType !== "survey" && ["full_name", "phone"].includes(target ?? "")) issues.push({ path, message: "Form tạo Lead không thể ẩn câu hỏi ánh xạ Họ tên/Số điện thoại." });
  });
  if (formType && formType !== "survey") fields.forEach((field, index) => {
    if (field.isActive === false || conditional.has(field.fieldKey) || !["full_name", "phone"].includes(field.crmMappingField ?? field.leadField ?? "")) return;
    const visited = new Set<string>();
    function canHide(key: string): boolean {
      if (visited.has(key)) return false;
      visited.add(key);
      return conditional.has(key) || (edges.get(key) ?? []).some(canHide);
    }
    if (canHide(field.fieldKey)) issues.push({ path: ["fields", index, "validationRules", "visibility"], message: "Họ tên/Số điện thoại của form tạo Lead không thể phụ thuộc vào câu hỏi có thể bị ẩn." });
  });
  // Include option-dependency edges: mixed visibility/dependency loops are unsafe too.
  for (const [key] of edges) {
    const visiting = new Set<string>();
    const done = new Set<string>();
    function cycle(cursor: string): boolean {
      if (visiting.has(cursor)) return true;
      if (done.has(cursor)) return false;
      visiting.add(cursor);
      if ((edges.get(cursor) ?? []).some(cycle)) return true;
      visiting.delete(cursor); done.add(cursor); return false;
    }
    if (cycle(key)) issues.push({ path: ["fields", fields.findIndex(field => field.fieldKey === key), "validationRules", "visibility"], message: "Không được tạo vòng lặp điều kiện hiện/ẩn hoặc lựa chọn phụ thuộc." });
  }
  return issues;
}
function matches(condition: MarketingFormVisibility, value: unknown): boolean {
  const empty = value === undefined || value === null || value === "" || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
  if (condition.operator === "is_empty") return empty;
  if (condition.operator === "is_not_empty") return !empty;
  if (empty) return false;
  if (condition.operator === "contains") return Array.isArray(value) ? value.includes(condition.value) : typeof value === "string" && value.includes(condition.value!);
  const scalar = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
  return scalar !== null && (condition.operator === "equals" ? scalar === condition.value : scalar !== condition.value);
}
export function resolveMarketingFormVisibleKeys(fields: MarketingFormConfigField[], answers: Record<string, unknown>): Set<string> {
  const byKey = new Map(fields.filter(field => field.isActive !== false).map(field => [field.fieldKey, field]));
  const resolved = new Map<string, boolean>();
  const visiting = new Set<string>();
  function visible(key: string): boolean {
    if (resolved.has(key)) return resolved.get(key)!;
    if (visiting.has(key)) return false;
    const field = byKey.get(key);
    if (!field) return false;
    visiting.add(key);
    const condition = readMarketingFormVisibility(field.validationRules);
    const dependency = dependencyParent(field);
    const result = (!dependency || !byKey.has(dependency) || visible(dependency)) && (!condition || (visible(condition.parentFieldKey) && matches(condition, answers[condition.parentFieldKey])));
    visiting.delete(key); resolved.set(key, result); return result;
  }
  return new Set([...byKey.keys()].filter(visible));
}
/** Keep system fields unchanged, but remove hidden question answers even from raw storage. */
export function stripHiddenMarketingFormAnswers<T>(fields: MarketingFormConfigField[], answers: Record<string, T>): Record<string, T> {
  const visible = resolveMarketingFormVisibleKeys(fields, answers);
  const configured = new Set(fields.map(field => field.fieldKey));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => !configured.has(key) || visible.has(key)));
}
