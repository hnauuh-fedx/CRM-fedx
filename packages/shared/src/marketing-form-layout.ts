import type { MarketingFormConfigField, MarketingFormConfigIssue } from "./marketing-form-config.js";

export type MarketingFormPage = { id: string; title: string; description?: string };
export type MarketingFormGroup = MarketingFormPage & { pageId: string };
export type MarketingFormLayout = { version: 1; pages: MarketingFormPage[]; groups: MarketingFormGroup[] };
export type MarketingFormPlacement = { pageId: string; groupId?: string };
export const defaultMarketingFormLayout = (): MarketingFormLayout => ({ version: 1, pages: [{ id: "default", title: "Trang 1" }], groups: [] });

export class MarketingFormLayoutError extends Error {
  constructor(public readonly path: Array<string | number>, message: string) { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function identifier(value: unknown) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && value !== "__none__"; }
function readSection(value: unknown, path: Array<string | number>): MarketingFormPage {
  const item = record(value);
  if (!identifier(item.id)) throw new MarketingFormLayoutError([...path, "id"], "Mã trang/nhóm không hợp lệ.");
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 120) throw new MarketingFormLayoutError([...path, "title"], "Tên trang/nhóm cần từ 1 đến 120 ký tự.");
  if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 1000)) throw new MarketingFormLayoutError([...path, "description"], "Mô tả tối đa 1.000 ký tự.");
  return { id: item.id as string, title: item.title, ...(typeof item.description === "string" ? { description: item.description } : {}) };
}
/** Missing settings are legacy one-page forms. Malformed explicit settings are never silently accepted. */
export function readMarketingFormLayout(settings: unknown): MarketingFormLayout {
  const raw = record(settings).surveyLayout;
  if (raw === undefined) return defaultMarketingFormLayout();
  const config = record(raw);
  const path = ["displaySettings", "surveyLayout"];
  if (config.version !== 1) throw new MarketingFormLayoutError([...path, "version"], "Phiên bản trang/nhóm chưa được hỗ trợ.");
  if (!Array.isArray(config.pages) || !config.pages.length || config.pages.length > 20) throw new MarketingFormLayoutError([...path, "pages"], "Biểu mẫu cần từ 1 đến 20 trang.");
  if (!Array.isArray(config.groups) || config.groups.length > 50) throw new MarketingFormLayoutError([...path, "groups"], "Biểu mẫu có tối đa 50 nhóm.");
  const pages = config.pages.map((page, index) => readSection(page, [...path, "pages", index]));
  const pageIds = new Set(pages.map(page => page.id));
  if (pageIds.size !== pages.length) throw new MarketingFormLayoutError([...path, "pages"], "Mã trang không được trùng.");
  const groups = config.groups.map((group, index) => {
    const item = readSection(group, [...path, "groups", index]);
    const pageId = record(group).pageId;
    if (typeof pageId !== "string" || !pageIds.has(pageId)) throw new MarketingFormLayoutError([...path, "groups", index, "pageId"], "Nhóm phải thuộc một trang đang tồn tại.");
    return { ...item, pageId };
  });
  if (new Set(groups.map(group => group.id)).size !== groups.length) throw new MarketingFormLayoutError([...path, "groups"], "Mã nhóm không được trùng.");
  return { version: 1, pages, groups };
}
export function readMarketingFormPlacement(field: Pick<MarketingFormConfigField, "validationRules">, layout: MarketingFormLayout): MarketingFormPlacement {
  const raw = record(field.validationRules).formLayout;
  if (raw === undefined) return { pageId: layout.pages[0].id };
  const placement = record(raw);
  if (typeof placement.pageId !== "string" || !layout.pages.some(page => page.id === placement.pageId)) throw new MarketingFormLayoutError(["pageId"], "Câu hỏi phải thuộc một trang đang tồn tại.");
  if (placement.groupId !== undefined && (typeof placement.groupId !== "string" || !layout.groups.some(group => group.id === placement.groupId && group.pageId === placement.pageId))) throw new MarketingFormLayoutError(["groupId"], "Nhóm của câu hỏi phải nằm trong cùng trang.");
  return { pageId: placement.pageId, ...(typeof placement.groupId === "string" ? { groupId: placement.groupId } : {}) };
}
export function validateMarketingFormLayout(settings: unknown, fields: MarketingFormConfigField[]): MarketingFormConfigIssue[] {
  let layout: MarketingFormLayout;
  try { layout = readMarketingFormLayout(settings); }
  catch (error) { if (error instanceof MarketingFormLayoutError) return [{ path: error.path, message: error.message }]; throw error; }
  return fields.flatMap((field, index) => {
    try { readMarketingFormPlacement(field, layout); return []; }
    catch (error) { if (error instanceof MarketingFormLayoutError) return [{ path: ["fields", index, "validationRules", "formLayout", ...error.path], fieldKey: field.fieldKey, message: error.message }]; throw error; }
  });
}
