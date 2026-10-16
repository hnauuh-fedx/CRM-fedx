import { z } from "zod";
import {
  layoutIssues,
  getDisplayFields,
  layoutScreens,
  listLayoutScreens,
  isListLayoutScreen,
  type LayoutScreen,
  presentationIssues,
  minDisplayColumnWidth,
  maxDisplayColumnWidth,
  maxPinnedDisplayFields,
} from "@admission-crm/shared/display-layout";
import type { AuthUser } from "../auth/auth.types";

export class DisplayLayoutError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const personalizationPolicySchema = z
  .object({
    visibility: z.boolean(),
    order: z.boolean(),
    pinning: z.boolean(),
    widths: z.boolean(),
  })
  .strict();
export const layoutPresentationSchema = z
  .object({
    visibleFields: z.array(z.string().min(1).max(100)).min(1).max(150),
    pinnedFields: z
      .array(z.string().min(1).max(100))
      .max(maxPinnedDisplayFields),
    columnWidths: z.record(
      z.string().min(1).max(100),
      z.number().int().min(minDisplayColumnWidth).max(maxDisplayColumnWidth),
    ),
  })
  .strict();
export const personalLayoutWriteSchema = z
  .object({
    revision: z.number().int().min(0),
    baseTemplateId: z.uuid(),
    baseVersion: z.number().int().min(1),
    presentation: layoutPresentationSchema,
  })
  .strict();
export const listLayoutScreenSchema = z
  .enum(listLayoutScreens)
  .default("LEAD_LIST");
export const layoutScreenSchema = z.enum(layoutScreens).default("LEAD_LIST");
export const layoutDraftShape = z
  .object({
    name: z.string().trim().min(2).max(120),
    visibleFields: z.array(z.string().min(1).max(100)).min(1).max(150),
    knownFields: z.array(z.string().min(1).max(100)).max(150).optional(),
    pinnedFields: z
      .array(z.string().min(1).max(100))
      .max(maxPinnedDisplayFields)
      .optional(),
    columnWidths: z
      .record(
        z.string().min(1).max(100),
        z.number().int().min(minDisplayColumnWidth).max(maxDisplayColumnWidth),
      )
      .optional(),
    personalization: personalizationPolicySchema.optional(),
    targets: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({ type: z.literal("DEFAULT"), id: z.literal("default") })
            .strict(),
          z.object({ type: z.literal("DEPARTMENT"), id: z.uuid() }).strict(),
          z.object({ type: z.literal("USER"), id: z.uuid() }).strict(),
        ]),
      )
      .max(500),
  })
  .strict();
export const layoutDraftSchemaForScreen = (screen: LayoutScreen) =>
  layoutDraftShape.superRefine((draft, context) => {
    const fields = getDisplayFields(screen);
    if (
      !isListLayoutScreen(screen) &&
      (draft.pinnedFields?.length ||
        Object.keys(draft.columnWidths ?? {}).length ||
        Object.values(draft.personalization ?? {}).some(Boolean))
    )
      context.addIssue({
        code: "custom",
        message:
          "Chỉ danh sách khách hàng và lead hỗ trợ ghim, độ rộng cột và tùy chỉnh cá nhân.",
      });
    for (const message of layoutIssues(draft, fields))
      context.addIssue({ code: "custom", message });
    for (const message of presentationIssues(
      {
        visibleFields: draft.visibleFields,
        pinnedFields: draft.pinnedFields ?? [],
        columnWidths: draft.columnWidths ?? {},
      },
      fields.map((field) => field.key),
    ))
      context.addIssue({ code: "custom", message });
  });
export const layoutDraftSchema = layoutDraftSchemaForScreen("LEAD_LIST");
export const layoutWriteSchema = z
  .object({
    revision: z.number().int().min(1),
    draft: layoutDraftShape,
  })
  .strict();
export function assertLayoutManager(
  actor: AuthUser,
  departmentId: string | null,
) {
  if (!actor.permissions.includes("system.manage"))
    throw new DisplayLayoutError(403, "Bạn không có quyền cấu hình hiển thị.");
  if (actor.accessScope === "ALL") return;
  if (
    actor.accessScope === "DEPARTMENT" &&
    departmentId &&
    actor.departmentIds.includes(departmentId)
  )
    return;
  throw new DisplayLayoutError(
    403,
    "Mẫu nằm ngoài phạm vi quản lý. Mẫu chung cần phạm vi toàn bộ chương trình.",
  );
}
