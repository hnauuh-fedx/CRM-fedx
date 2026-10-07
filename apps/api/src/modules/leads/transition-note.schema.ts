import { z } from "zod";

export const transitionNoteTargetSchema = z.union([z.uuid(), z.literal("FAIL")]);
export const transitionNoteTemplateSchema = z.object({
  id: z.uuid(),
  content: z.string().trim().min(1, "Vui lòng nhập nội dung ghi chú.").max(1800),
  isActive: z.boolean(),
});
export const transitionNoteTemplatesSchema = z.array(transitionNoteTemplateSchema).max(100).superRefine((templates, context) => {
  const ids = new Set<string>();
  templates.forEach((template, index) => {
    if (ids.has(template.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Mã mẫu ghi chú không được trùng." });
    ids.add(template.id);
  });
});

export type TransitionNoteTemplate = z.infer<typeof transitionNoteTemplateSchema>;

export function parseTransitionNoteTemplates(value: string | null | undefined): TransitionNoteTemplate[] {
  if (!value) return [];
  try {
    const result = transitionNoteTemplatesSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}
