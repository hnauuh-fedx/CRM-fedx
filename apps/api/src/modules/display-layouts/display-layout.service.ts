import type {
  LayoutDraft,
  DisplayLayout,
  LayoutImpact,
  LayoutTarget,
  EffectiveLayout,
  LayoutPresentation,
  LayoutScreen,
} from "@admission-crm/shared/display-layout";
import {
  chooseLayoutTarget,
  isListLayoutScreen,
  getDisplayFields,
  normalizeVisibleFields,
  normalizePresentation,
  lockedPersonalization,
  personalPresentationIssues,
} from "@admission-crm/shared/display-layout";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import {
  assertLayoutManager,
  DisplayLayoutError,
  layoutDraftSchemaForScreen,
} from "./display-layout.validation";

type Tx = Prisma.TransactionClient;
type Template = Awaited<ReturnType<typeof findTemplate>>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
function assertProgram(actor: AuthUser, programId: string) {
  if (!actor.institutionProgramIds.includes(programId))
    throw new DisplayLayoutError(
      403,
      "Bạn không có quyền truy cập chương trình này.",
    );
}
function scopedWhere(
  actor: AuthUser,
  programId: string,
): Prisma.display_layout_templatesWhereInput {
  assertProgram(actor, programId);
  if (!actor.permissions.includes("system.manage"))
    throw new DisplayLayoutError(403, "Bạn không có quyền cấu hình hiển thị.");
  return {
    institution_program_id: programId,
    ...(actor.accessScope === "ALL"
      ? {}
      : {
          management_department_id: {
            in: actor.accessScope === "DEPARTMENT" ? actor.departmentIds : [],
          },
        }),
  };
}
async function findTemplate(
  db: Tx,
  id: string,
  programId: string,
  actor: AuthUser,
) {
  const item = await db.display_layout_templates.findFirst({
    where: { id, ...scopedWhere(actor, programId) },
  });
  if (!item)
    throw new DisplayLayoutError(
      404,
      "Không tìm thấy mẫu trong phạm vi quản lý.",
    );
  assertLayoutManager(actor, item.management_department_id);
  return item;
}
function serialize(item: Template): DisplayLayout {
  return {
    id: item.id,
    screen: item.screen as LayoutScreen,
    revision: item.revision,
    managementDepartmentId: item.management_department_id,
    draft: item.draft as unknown as LayoutDraft,
    published: item.published as unknown as LayoutDraft | null,
    publishedVersion: item.published_version,
  };
}
const programUserWhere = (programId: string): Prisma.usersWhereInput => ({
  deleted_at: null,
  status: "active",
  user_roles: {
    some: {
      roles: {
        role_institution_programs: {
          some: { institution_program_id: programId },
        },
        role_permissions: {
          some: {
            permissions: {
              is_active: true,
              code: {
                in: [
                  "lead.view_all",
                  "lead.view_department",
                  "lead.view_assigned",
                ],
              },
            },
          },
        },
      },
    },
  },
});

async function validateTargets(
  db: Tx,
  draft: LayoutDraft,
  programId: string,
  actor: AuthUser,
  departmentId: string | null,
  screen: LayoutScreen,
) {
  const parsed = layoutDraftSchemaForScreen(screen).safeParse(draft);
  if (!parsed.success)
    throw new DisplayLayoutError(
      400,
      parsed.error.issues[0]?.message ?? "Cấu hình không hợp lệ.",
    );
  const departmentIds = draft.targets
    .filter((t) => t.type === "DEPARTMENT")
    .map((t) => t.id);
  const userIds = draft.targets
    .filter((t) => t.type === "USER")
    .map((t) => t.id);
  if (
    departmentId &&
    draft.targets.some(
      (t) =>
        t.type === "DEFAULT" ||
        (t.type === "DEPARTMENT" && t.id !== departmentId),
    )
  ) {
    throw new DisplayLayoutError(
      403,
      "Mẫu phòng ban chỉ được áp dụng trong phòng ban sở hữu mẫu.",
    );
  }
  if (departmentIds.length) {
    const count = await db.departments.count({
      where: {
        id: { in: departmentIds },
        user_departments: { some: { users: programUserWhere(programId) } },
      },
    });
    if (count !== departmentIds.length)
      throw new DisplayLayoutError(
        403,
        "Phòng ban không có Sale hợp lệ trong chương trình.",
      );
  }
  if (userIds.length) {
    const count = await db.users.count({
      where: {
        ...programUserWhere(programId),
        id: { in: userIds },
        ...(departmentId
          ? {
              user_departments: {
                some: { department_id: departmentId },
                every: { department_id: departmentId },
              },
            }
          : {}),
      },
    });
    if (count !== userIds.length)
      throw new DisplayLayoutError(
        403,
        "Sale không hợp lệ hoặc thuộc ngoài phạm vi mẫu.",
      );
  }
  assertLayoutManager(actor, departmentId);
}
async function audit(
  db: Tx,
  actor: AuthUser,
  id: string,
  action: string,
  oldData: unknown,
  newData: unknown,
  ip?: string,
) {
  await db.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "display_layout",
      entity_id: id,
      action,
      old_data: json(oldData),
      new_data: json(newData),
      ip_address: ip,
    },
  });
}

export async function listLayouts(
  actor: AuthUser,
  programId: string,
  page: number,
  search: string,
  screen: LayoutScreen = "LEAD_LIST",
) {
  const where = {
    screen,
    ...scopedWhere(actor, programId),
    ...(search ? { draft: { path: ["name"], string_contains: search } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.display_layout_templates.findMany({
      where,
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.display_layout_templates.count({ where }),
  ]);
  return {
    data: items.map(serialize),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / 20)),
    fields: getDisplayFields(screen),
  };
}
export async function layoutDetail(
  actor: AuthUser,
  programId: string,
  id: string,
  page: number,
) {
  const item = await findTemplate(prisma, id, programId, actor);
  const draft = item.draft as unknown as LayoutDraft;
  const [versions, total, assignments, departments, users] = await Promise.all([
    prisma.display_layout_versions.findMany({
      where: { template_id: id },
      orderBy: { version: "desc" },
      skip: (page - 1) * 10,
      take: 10,
    }),
    prisma.display_layout_versions.count({ where: { template_id: id } }),
    prisma.display_layout_assignments.findMany({
      where: { template_id: id },
      take: 501,
    }),
    prisma.departments.findMany({
      where: {
        id: {
          in: draft.targets
            .filter((t) => t.type === "DEPARTMENT")
            .map((t) => t.id),
        },
      },
      select: { id: true, name: true },
    }),
    prisma.users.findMany({
      where: {
        ...programUserWhere(programId),
        id: {
          in: draft.targets.filter((t) => t.type === "USER").map((t) => t.id),
        },
        ...(item.management_department_id
          ? {
              user_departments: {
                some: { department_id: item.management_department_id },
                every: { department_id: item.management_department_id },
              },
            }
          : {}),
      },
      select: { id: true, full_name: true },
    }),
  ]);
  return {
    ...serialize(item),
    assignments: assignments.map((a) => ({
      type: a.target_type,
      id: a.target_id,
    })),
    targetLabels: Object.fromEntries([
      ...departments.map((d) => [`DEPARTMENT:${d.id}`, d.name]),
      ...users.map((u) => [`USER:${u.id}`, u.full_name]),
    ]),
    versions: versions.map((v) => ({
      version: v.version,
      ...(v.snapshot as unknown as Pick<LayoutDraft, "name" | "visibleFields">),
      createdAt: v.created_at.toISOString(),
      actorName: v.actor_name,
    })),
    versionPage: page,
    versionPages: Math.max(1, Math.ceil(total / 10)),
  };
}
export async function createLayout(
  actor: AuthUser,
  programId: string,
  departmentId: string | null,
  draft: LayoutDraft,
  ip?: string,
  screen: LayoutScreen = "LEAD_LIST",
) {
  assertProgram(actor, programId);
  assertLayoutManager(actor, departmentId);
  return prisma.$transaction(async (db) => {
    await validateTargets(db, draft, programId, actor, departmentId, screen);
    draft = {
      ...draft,
      knownFields: getDisplayFields(screen).map((field) => field.key),
    };
    const item = await db.display_layout_templates.create({
      data: {
        institution_program_id: programId,
        screen,
        management_department_id: departmentId,
        draft: json(draft),
        created_by: actor.id,
      },
    });
    await audit(db, actor, item.id, "create", {}, draft, ip);
    return serialize(item);
  });
}
export async function saveLayout(
  actor: AuthUser,
  programId: string,
  id: string,
  revision: number,
  draft: LayoutDraft,
  ip?: string,
) {
  return prisma.$transaction(async (db) => {
    const item = await findTemplate(db, id, programId, actor);
    await validateTargets(
      db,
      draft,
      programId,
      actor,
      item.management_department_id,
      item.screen as LayoutScreen,
    );
    draft = {
      ...draft,
      knownFields: getDisplayFields(item.screen as LayoutScreen).map(
        (field) => field.key,
      ),
    };
    const changed = await db.display_layout_templates.updateMany({
      where: { id, revision },
      data: {
        draft: json(draft),
        revision: { increment: 1 },
        updated_at: new Date(),
      },
    });
    if (!changed.count)
      throw new DisplayLayoutError(
        409,
        "Mẫu đã được người khác chỉnh sửa. Vui lòng tải lại trước khi lưu.",
      );
    await audit(db, actor, id, "update_draft", item.draft, draft, ip);
    return serialize(await findTemplate(db, id, programId, actor));
  });
}

async function impact(
  db: Tx,
  programId: string,
  item: Template,
): Promise<LayoutImpact> {
  const draft = item.draft as unknown as LayoutDraft;
  // Count in PostgreSQL; never pull all users into the application for a preview.
  const [counts] = await db.$queryRaw<
    Array<{ affected: bigint; overridden: bigint; replaced: bigint }>
  >(Prisma.sql`
    WITH requested AS (
      SELECT x->>'type' AS target_type, x->>'id' AS target_id FROM jsonb_array_elements(${JSON.stringify(draft.targets)}::jsonb) x
    ), before_assignments AS (
      SELECT target_type, target_id, template_id FROM display_layout_assignments WHERE institution_program_id = ${programId}::uuid AND screen = ${item.screen}
    ), after_assignments AS (
      SELECT b.* FROM before_assignments b WHERE b.template_id <> ${item.id}::uuid
        AND NOT EXISTS (SELECT 1 FROM requested r WHERE r.target_type = b.target_type AND r.target_id = b.target_id)
      UNION ALL SELECT target_type, target_id, ${item.id}::uuid FROM requested
    ), members AS (
      SELECT u.id, (SELECT count(*) FROM user_departments ud WHERE ud.user_id=u.id) AS department_count,
        (SELECT min(ud.department_id::text) FROM user_departments ud WHERE ud.user_id=u.id) AS department_id
      FROM users u WHERE u.deleted_at IS NULL AND u.status='active' AND EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_institution_programs rip ON rip.role_id=ur.role_id
        JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id
        WHERE ur.user_id=u.id AND rip.institution_program_id=${programId}::uuid AND p.is_active=true
          AND p.code IN ('lead.view_all','lead.view_department','lead.view_assigned')
      )
    ), effective AS (
      SELECT m.*,
        (SELECT b.template_id FROM before_assignments b WHERE (b.target_type='USER' AND b.target_id=m.id::text)
          OR (b.target_type='DEPARTMENT' AND m.department_count=1 AND b.target_id=m.department_id) OR b.target_type='DEFAULT'
          ORDER BY CASE b.target_type WHEN 'USER' THEN 1 WHEN 'DEPARTMENT' THEN 2 ELSE 3 END LIMIT 1) AS old_template,
        (SELECT a.template_id FROM after_assignments a WHERE (a.target_type='USER' AND a.target_id=m.id::text)
          OR (a.target_type='DEPARTMENT' AND m.department_count=1 AND a.target_id=m.department_id) OR a.target_type='DEFAULT'
          ORDER BY CASE a.target_type WHEN 'USER' THEN 1 WHEN 'DEPARTMENT' THEN 2 ELSE 3 END LIMIT 1) AS new_template
      FROM members m
    ) SELECT
      (SELECT count(*) FROM effective WHERE old_template IS DISTINCT FROM new_template OR new_template=${item.id}::uuid) AS affected,
      (SELECT count(*) FROM effective e WHERE new_template IS DISTINCT FROM ${item.id}::uuid
        AND EXISTS (SELECT 1 FROM after_assignments a WHERE a.target_type='USER' AND a.target_id=e.id::text)
        AND EXISTS (SELECT 1 FROM requested r WHERE r.target_type='DEFAULT' OR (r.target_type='DEPARTMENT' AND r.target_id=e.department_id AND e.department_count=1))) AS overridden,
      (SELECT count(*) FROM before_assignments b JOIN requested r USING(target_type,target_id) WHERE b.template_id<>${item.id}::uuid) AS replaced
  `);
  const state = await db.display_layout_program_state.findUnique({
    where: { institution_program_id: programId },
  });
  const collisions = draft.targets.length
    ? await db.display_layout_assignments.groupBy({
        by: ["template_id"],
        where: {
          institution_program_id: programId,
          screen: item.screen,
          template_id: { not: item.id },
          OR: draft.targets.map((t) => ({
            target_type: t.type,
            target_id: t.id,
          })),
        },
        _count: { _all: true },
      })
    : [];
  const templates = await db.display_layout_templates.findMany({
    where: {
      institution_program_id: programId,
      id: { in: collisions.map((c) => c.template_id) },
    },
    select: { id: true, published: true },
  });
  const templateNames = new Map(
    templates.map((t) => [
      t.id,
      (t.published as unknown as LayoutDraft)?.name ?? "Mẫu đã ngừng sử dụng",
    ]),
  );
  return {
    departments: draft.targets.filter((t) => t.type === "DEPARTMENT").length,
    users: Number(counts.affected),
    overriddenUsers: Number(counts.overridden),
    replacedAssignments: Number(counts.replaced),
    assignmentRevision: state?.revision ?? 0,
    replacedTemplates: collisions.map((c) => ({
      name: templateNames.get(c.template_id) ?? "Mẫu đã ngừng sử dụng",
      assignments: c._count._all,
    })),
  };
}
export async function previewLayout(
  actor: AuthUser,
  programId: string,
  id: string,
  revision: number,
) {
  return prisma.$transaction(
    async (db) => {
      const item = await findTemplate(db, id, programId, actor);
      if (item.revision !== revision)
        throw new DisplayLayoutError(409, "Mẫu đã thay đổi. Vui lòng tải lại.");
      await validateTargets(
        db,
        item.draft as unknown as LayoutDraft,
        programId,
        actor,
        item.management_department_id,
        item.screen as LayoutScreen,
      );
      await assertAssignableTargets(db, item, programId, actor);
      return impact(db, programId, item);
    },
    { isolationLevel: "RepeatableRead" },
  );
}

async function assertAssignableTargets(
  db: Tx,
  item: Template,
  programId: string,
  actor: AuthUser,
) {
  const draft = item.draft as unknown as LayoutDraft;
  if (!draft.targets.length) return;
  const collisions = await db.display_layout_assignments.findMany({
    where: {
      institution_program_id: programId,
      screen: item.screen,
      OR: draft.targets.map((t) => ({ target_type: t.type, target_id: t.id })),
      template_id: { not: item.id },
    },
    select: { template_id: true },
  });
  for (const otherId of new Set(collisions.map((a) => a.template_id)))
    await findTemplate(db, otherId, programId, actor);
}

export async function publishLayout(
  actor: AuthUser,
  programId: string,
  id: string,
  revision: number,
  assignmentRevision: number,
  ip?: string,
) {
  return prisma.$transaction(async (db) => {
    await db.display_layout_program_state.upsert({
      where: { institution_program_id: programId },
      create: { institution_program_id: programId },
      update: {},
    });
    const locked = await db.display_layout_program_state.updateMany({
      where: {
        institution_program_id: programId,
        revision: assignmentRevision,
      },
      data: { revision: { increment: 1 } },
    });
    if (!locked.count)
      throw new DisplayLayoutError(
        409,
        "Phân bổ mẫu vừa thay đổi. Vui lòng xem lại phạm vi ảnh hưởng.",
      );
    const item = await findTemplate(db, id, programId, actor);
    const draft = layoutDraftSchemaForScreen(item.screen as LayoutScreen).parse(
      item.draft,
    );
    await validateTargets(
      db,
      draft,
      programId,
      actor,
      item.management_department_id,
      item.screen as LayoutScreen,
    );
    // A department manager must never replace a template outside their management scope.
    await assertAssignableTargets(db, item, programId, actor);
    const changed = await db.display_layout_templates.updateMany({
      where: { id, revision },
      data: {
        published: json(draft),
        published_version: { increment: 1 },
        revision: { increment: 1 },
        updated_at: new Date(),
      },
    });
    if (!changed.count)
      throw new DisplayLayoutError(409, "Mẫu đã thay đổi. Vui lòng tải lại.");
    await db.display_layout_assignments.deleteMany({
      where: { template_id: id },
    });
    for (const target of draft.targets)
      await db.display_layout_assignments.upsert({
        where: {
          institution_program_id_screen_target_type_target_id: {
            institution_program_id: programId,
            screen: item.screen,
            target_type: target.type,
            target_id: target.id,
          },
        },
        create: {
          institution_program_id: programId,
          screen: item.screen,
          target_type: target.type,
          target_id: target.id,
          template_id: id,
        },
        update: { template_id: id },
      });
    await db.display_layout_versions.create({
      data: {
        template_id: id,
        version: item.published_version + 1,
        snapshot: json({
          name: draft.name,
          visibleFields: draft.visibleFields,
          pinnedFields: draft.pinnedFields ?? [],
          columnWidths: draft.columnWidths ?? {},
          personalization: draft.personalization ?? lockedPersonalization,
        }),
        actor_id: actor.id,
        actor_name: actor.fullName,
      },
    });
    await audit(
      db,
      actor,
      id,
      "publish",
      { layout: item.published, version: item.published_version },
      { layout: draft, version: item.published_version + 1 },
      ip,
    );
    return serialize(await findTemplate(db, id, programId, actor));
  });
}
export async function restoreLayout(
  actor: AuthUser,
  programId: string,
  id: string,
  revision: number,
  version: number,
  ip?: string,
) {
  const item = await findTemplate(prisma, id, programId, actor);
  const previous = await prisma.display_layout_versions.findUnique({
    where: { template_id_version: { template_id: id, version } },
  });
  if (!previous) throw new DisplayLayoutError(404, "Không tìm thấy phiên bản.");
  const snapshot = previous.snapshot as unknown as LayoutDraft;
  const draft = item.draft as unknown as LayoutDraft;
  return saveLayout(
    actor,
    programId,
    id,
    revision,
    {
      ...draft,
      name: snapshot.name,
      visibleFields: normalizeVisibleFields(
        snapshot.visibleFields,
        getDisplayFields(item.screen as LayoutScreen),
      ),
      pinnedFields: normalizePresentation(
        snapshot,
        getDisplayFields(item.screen as LayoutScreen),
      ).pinnedFields,
      columnWidths: normalizePresentation(
        snapshot,
        getDisplayFields(item.screen as LayoutScreen),
      ).columnWidths,
      personalization: snapshot.personalization ?? lockedPersonalization,
    },
    ip,
  );
}
export async function effectiveLayout(
  actor: AuthUser,
  programId: string,
  db: Tx = prisma,
  screen: LayoutScreen = "LEAD_LIST",
): Promise<EffectiveLayout> {
  assertProgram(actor, programId);
  if (
    ![
      "lead.view_all",
      "lead.view_department",
      "lead.view_assigned",
      ...(screen === "LEAD_FORM" ? ["lead.create"] : []),
    ].some((p) => actor.permissions.includes(p))
  )
    throw new DisplayLayoutError(403, "Bạn không có quyền xem danh sách lead.");
  const assignments = await db.display_layout_assignments.findMany({
    where: {
      institution_program_id: programId,
      screen,
      OR: [
        { target_type: "USER", target_id: actor.id },
        { target_type: "DEPARTMENT", target_id: { in: actor.departmentIds } },
        { target_type: "DEFAULT" },
      ],
    },
  });
  const templates = await db.display_layout_templates.findMany({
    where: {
      institution_program_id: programId,
      screen,
      id: { in: assignments.map((a) => a.template_id) },
    },
    select: {
      id: true,
      management_department_id: true,
      published: true,
      published_version: true,
    },
  });
  const eligible = templates.filter(
    (t) =>
      t.published &&
      (!t.management_department_id ||
        (actor.departmentIds.length === 1 &&
          actor.departmentIds[0] === t.management_department_id)),
  );
  const validAssignments = assignments.filter((a) =>
    eligible.some((t) => t.id === a.template_id),
  );
  const selected = chooseLayoutTarget(
    actor.id,
    actor.departmentIds,
    validAssignments.map((a) => ({
      type: a.target_type,
      id: a.target_id,
    })) as LayoutTarget[],
  );
  const assignment =
    selected &&
    assignments.find(
      (a) => a.target_type === selected.type && a.target_id === selected.id,
    );
  const item =
    assignment && eligible.find((t) => t.id === assignment.template_id);
  const published = item?.published as unknown as LayoutDraft | null;
  const inherited = normalizePresentation(
    published ?? {
      visibleFields: getDisplayFields(screen).map((field) => field.key),
    },
    getDisplayFields(screen),
  );
  const policy = isListLayoutScreen(screen)
    ? (published?.personalization ?? lockedPersonalization)
    : lockedPersonalization;
  const personal = await db.display_layout_preferences.findUnique({
    where: {
      institution_program_id_screen_user_id: {
        institution_program_id: programId,
        screen,
        user_id: actor.id,
      },
    },
  });
  const presentation =
    personal?.presentation as unknown as LayoutPresentation | null;
  const sameBase =
    personal?.base_template_id === item?.id &&
    personal?.base_version === item?.published_version;
  const personalized = Boolean(
    presentation &&
      sameBase &&
      Object.values(policy).some(Boolean) &&
      !personalPresentationIssues(presentation, inherited, policy).length,
  );
  return {
    ...(personalized ? presentation! : inherited),
    inherited,
    policy: actor.accessScope === "READ_ONLY" ? lockedPersonalization : policy,
    baseTemplateId: item?.id ?? null,
    baseVersion: item?.published_version ?? 0,
    personalRevision: personal?.revision ?? 0,
    personalized,
    personalizationStale: Boolean(presentation && !personalized),
    name: published?.name ?? "Giao diện mặc định hệ thống",
    source: published && selected ? selected.type : "SYSTEM",
    ambiguousDepartment:
      actor.departmentIds.length > 1 && selected?.type !== "USER",
  };
}

export async function layoutTargetOptions(
  actor: AuthUser,
  programId: string,
  type: "USER" | "DEPARTMENT",
  search: string,
  page: number,
  departmentId?: string,
) {
  assertProgram(actor, programId);
  if (!actor.permissions.includes("system.manage"))
    throw new DisplayLayoutError(403, "Bạn không có quyền cấu hình hiển thị.");
  if (departmentId) assertLayoutManager(actor, departmentId);
  const membershipScope = departmentId
    ? [departmentId]
    : actor.accessScope === "DEPARTMENT"
      ? actor.departmentIds
      : [];
  if (actor.accessScope !== "ALL" && actor.accessScope !== "DEPARTMENT")
    throw new DisplayLayoutError(403, "Phạm vi không cho phép quản lý mẫu.");
  if (type === "DEPARTMENT") {
    const where = {
      ...(actor.accessScope === "ALL" && !departmentId
        ? {}
        : { id: { in: membershipScope } }),
      name: { contains: search, mode: "insensitive" as const },
      user_departments: { some: { users: programUserWhere(programId) } },
    };
    const [data, total] = await prisma.$transaction([
      prisma.departments.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.departments.count({ where }),
    ]);
    return { data, totalPages: Math.max(1, Math.ceil(total / 20)) };
  }
  const where: Prisma.usersWhereInput = {
    ...programUserWhere(programId),
    full_name: { contains: search, mode: "insensitive" },
    ...(membershipScope.length || actor.accessScope !== "ALL"
      ? {
          user_departments: {
            some: { department_id: { in: membershipScope } },
            every: { department_id: { in: membershipScope } },
          },
        }
      : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.users.findMany({
      where,
      select: { id: true, full_name: true },
      orderBy: [{ full_name: "asc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.users.count({ where }),
  ]);
  return {
    data: users.map((u) => ({ id: u.id, name: u.full_name })),
    totalPages: Math.max(1, Math.ceil(total / 20)),
  };
}
