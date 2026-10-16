import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import {
  personalPresentationIssues,
  type PersonalLayoutWrite,
  type ListLayoutScreen,
} from "@admission-crm/shared/display-layout";
import { effectiveLayout } from "./display-layout.service";
import {
  DisplayLayoutError,
  personalLayoutWriteSchema,
  listLayoutScreenSchema,
} from "./display-layout.validation";

/** Serialize with publication so a preference cannot be saved against a revoked policy. */
async function lockProgram(db: Prisma.TransactionClient, programId: string) {
  await db.display_layout_program_state.upsert({
    where: { institution_program_id: programId },
    create: { institution_program_id: programId },
    update: {},
  });
  await db.$queryRaw`SELECT institution_program_id FROM display_layout_program_state WHERE institution_program_id = ${programId}::uuid FOR UPDATE`;
}
function assertOwnWrite(actor: AuthUser, programId: string) {
  if (
    !actor.institutionProgramIds.includes(programId) ||
    !["lead.view_all", "lead.view_department", "lead.view_assigned"].some(
      (permission) => actor.permissions.includes(permission),
    ) ||
    actor.accessScope === "READ_ONLY"
  )
    throw new DisplayLayoutError(
      403,
      "Bạn không có quyền tùy chỉnh giao diện cá nhân trong chương trình này.",
    );
}
export async function savePersonalLayout(
  actor: AuthUser,
  programId: string,
  input: PersonalLayoutWrite,
  ip?: string,
  screen: ListLayoutScreen = "LEAD_LIST",
) {
  assertOwnWrite(actor, programId);
  screen = listLayoutScreenSchema.parse(screen);
  const body = personalLayoutWriteSchema.parse(input);
  return prisma.$transaction(async (db) => {
    await lockProgram(db, programId);
    const base = await effectiveLayout(actor, programId, db, screen);
    if (
      base.personalRevision !== body.revision ||
      base.baseTemplateId !== body.baseTemplateId ||
      base.baseVersion !== body.baseVersion
    )
      throw new DisplayLayoutError(
        409,
        "Mẫu quản lý hoặc tùy chỉnh cá nhân đã thay đổi. Đóng cửa sổ và tải lại cấu hình trước khi lưu.",
      );
    if (!Object.values(base.policy).some(Boolean))
      throw new DisplayLayoutError(
        403,
        "Người quản lý chưa cho phép tùy chỉnh cá nhân.",
      );
    const issues = personalPresentationIssues(
      body.presentation,
      base.inherited,
      base.policy,
    );
    if (issues.length) throw new DisplayLayoutError(403, issues.join(" "));
    const where = {
      institution_program_id_screen_user_id: {
        screen,
        institution_program_id: programId,
        user_id: actor.id,
      },
    };
    const old = await db.display_layout_preferences.findUnique({ where });
    const item = await db.display_layout_preferences.upsert({
      where,
      create: {
        screen,
        institution_program_id: programId,
        user_id: actor.id,
        base_template_id: body.baseTemplateId,
        base_version: body.baseVersion,
        presentation: body.presentation as Prisma.InputJsonValue,
      },
      update: {
        base_template_id: body.baseTemplateId,
        base_version: body.baseVersion,
        presentation: body.presentation as Prisma.InputJsonValue,
        revision: { increment: 1 },
        updated_at: new Date(),
      },
    });
    await db.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "display_layout_preference",
        entity_id: item.id,
        action: "update",
        old_data: (old?.presentation ?? {}) as Prisma.InputJsonValue,
        new_data: body.presentation as Prisma.InputJsonValue,
        ip_address: ip,
      },
    });
    return effectiveLayout(actor, programId, db, screen);
  });
}
export async function resetPersonalLayout(
  actor: AuthUser,
  programId: string,
  revision: number,
  ip?: string,
  screen: ListLayoutScreen = "LEAD_LIST",
) {
  assertOwnWrite(actor, programId);
  screen = listLayoutScreenSchema.parse(screen);
  return prisma.$transaction(async (db) => {
    await lockProgram(db, programId);
    const current = await effectiveLayout(actor, programId, db, screen);
    if (current.personalRevision !== revision)
      throw new DisplayLayoutError(
        409,
        "Tùy chỉnh cá nhân đã thay đổi. Vui lòng tải lại.",
      );
    const where = {
      institution_program_id_screen_user_id: {
        screen,
        institution_program_id: programId,
        user_id: actor.id,
      },
    };
    const old = await db.display_layout_preferences.findUnique({ where });
    if (old?.presentation) {
      await db.display_layout_preferences.update({
        where,
        data: {
          presentation: Prisma.DbNull,
          base_template_id: null,
          base_version: 0,
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      await db.audit_logs.create({
        data: {
          user_id: actor.id,
          entity_type: "display_layout_preference",
          entity_id: old.id,
          action: "reset",
          old_data: old.presentation as Prisma.InputJsonValue,
          new_data: {},
          ip_address: ip,
        },
      });
    }
    return effectiveLayout(actor, programId, db, screen);
  });
}
