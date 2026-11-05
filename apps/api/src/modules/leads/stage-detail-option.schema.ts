import { z } from "zod";

/**
 * Multi-level options of the "Quy trình Telesale/Trạng thái" field.
 * Level 1 is a pipeline stage or FAIL (not stored here); levels 2 and 3 are configured per target.
 */
export const STAGE_DETAIL_FAIL_TARGET = "FAIL";
export const STAGE_DETAIL_MAX_CONTENT_LENGTH = 1800;
const MAX_LABEL_LENGTH = 500;
const MAX_ITEMS_PER_LEVEL = 100;

export const stageDetailTargetSchema = z.union([z.uuid(), z.literal(STAGE_DETAIL_FAIL_TARGET)]);

const labelSchema = z.string().trim().min(1, "Vui lòng nhập nội dung.").max(MAX_LABEL_LENGTH);
export const stageDetailChildOptionSchema = z.object({ id: z.uuid(), label: labelSchema });
export const stageDetailOptionSchema = z.object({
  id: z.uuid(),
  label: labelSchema,
  children: z.array(stageDetailChildOptionSchema).max(MAX_ITEMS_PER_LEVEL),
});
export const stageDetailOptionsSchema = z.array(stageDetailOptionSchema).max(MAX_ITEMS_PER_LEVEL).superRefine((options, context) => {
  const ids = new Set<string>();
  const check = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) context.addIssue({ code: "custom", path, message: "Mã mục cấu hình không được trùng." });
    ids.add(id);
  };
  options.forEach((option, index) => {
    check(option.id, [index, "id"]);
    option.children.forEach((child, childIndex) => check(child.id, [index, "children", childIndex, "id"]));
  });
});

/** What a user picked when changing stage/status: level 2, optional level 3, optional edited text. */
export const stageDetailSelectionSchema = z.object({
  optionId: z.uuid(),
  childOptionId: z.uuid().optional(),
  content: z.string().trim().min(1).max(STAGE_DETAIL_MAX_CONTENT_LENGTH).optional(),
});

export type StageDetailOption = z.infer<typeof stageDetailOptionSchema>;
export type StageDetailSelection = z.infer<typeof stageDetailSelectionSchema>;

export function parseStageDetailOptions(value: string | null | undefined): StageDetailOption[] {
  if (!value) return [];
  try {
    const result = stageDetailOptionsSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** Level 2 and level 3 are joined with " - "; the configured labels carry no separator. */
export function composeStageDetailContent(option: { label: string }, child?: { label: string }) {
  return child ? `${option.label} - ${child.label}` : option.label;
}

/** "Chuyển lead sang giai đoạn X." + content → "Chuyển lead sang giai đoạn X | content". */
export function appendStageDetailToActivity(sentence: string, content: string | undefined) {
  return content ? `${sentence.replace(/\.\s*$/, "")} | ${content}` : sentence;
}

/** Resolves the stored text for a selection, or null when it no longer matches the configuration. */
export function resolveStageDetailContent(options: StageDetailOption[], selection: StageDetailSelection) {
  const option = options.find((item) => item.id === selection.optionId);
  if (!option) return null;
  const child = selection.childOptionId ? option.children.find((item) => item.id === selection.childOptionId) : undefined;
  if (selection.childOptionId && !child) return null;
  return selection.content ?? composeStageDetailContent(option, child);
}
