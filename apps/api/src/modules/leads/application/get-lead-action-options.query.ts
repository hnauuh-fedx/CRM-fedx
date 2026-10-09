import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { assignableSaleWhere } from "./lead-mutation-support";
import { getSystemFieldRequirements } from "../../custom-fields/system-field-requirements.service";

export async function getLeadActionOptions(
  actor: AuthUser,
  institutionProgramId?: string,
) {
  const canAssign =
    actor.permissions.includes("lead.assign") ||
    actor.permissions.includes("lead.reassign");
  const canAssignAll =
    actor.accessScope === "ALL" && actor.permissions.includes("lead.view_all");
  const [
    sources,
    stages,
    assignees,
    telesales,
    departments,
    institutionPrograms,
    majors,
    admissionStatuses,
    tags,
  ] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: institutionProgramId
        ? { institution_program_id: institutionProgramId }
        : { institution_program_id: { in: actor.institutionProgramIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.pipeline_stages.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        pipeline_id: true,
        pipelines: { select: { name: true } },
      },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    canAssign
      ? prisma.users.findMany({
          where: {
            status: "active",
            deleted_at: null,
            ...(institutionProgramId
              ? { user_roles: { some: { roles: { role_institution_programs: { some: { institution_program_id: institutionProgramId } } } } } }
              : {}),
            ...(!canAssignAll
              ? {
                  user_departments: {
                    some: { department_id: { in: actor.departmentIds } },
                  },
                }
              : {}),
          },
          select: { id: true, full_name: true },
          orderBy: { full_name: "asc" },
        })
      : prisma.users.findMany({
          where: { id: actor.id },
          select: { id: true, full_name: true },
        }),
    prisma.users.findMany({
      where: {
        ...(!canAssign ? { id: actor.id } : {}),
        status: "active",
        deleted_at: null,
        ...(institutionProgramId
          ? {
              user_roles: {
                some: {
                  roles: {
                    ...assignableSaleWhere.user_roles.some.roles,
                    role_institution_programs: { some: { institution_program_id: institutionProgramId } },
                  },
                },
              },
            }
          : assignableSaleWhere),
        ...(canAssign && !canAssignAll
          ? {
              user_departments: {
                some: { department_id: { in: actor.departmentIds } },
              },
            }
          : {}),
      },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
    canAssignAll
      ? prisma.departments.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : prisma.departments.findMany({
          where: { id: { in: actor.departmentIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
    prisma.institution_programs.findMany({
      where: {
        status: "active",
        ...(!canAssignAll
          ? { id: { in: actor.institutionProgramIds } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        institution_name: true,
      },
      orderBy: [{ institution_name: "asc" }, { name: "asc" }],
    }),
    prisma.majors.findMany({
      where: institutionProgramId
        ? {
            OR: [
              { institution_program_id: institutionProgramId },
              { institution_program_id: null },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.admission_statuses.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tags.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  const systemFieldRequirements = {
    fullName: true,
    phone: true,
    sourceId: true,
    ...await getSystemFieldRequirements("LEAD"),
  };

  return {
    sources,
    stages: stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      pipelineId: stage.pipeline_id,
      pipelineName: stage.pipelines?.name ?? null,
    })),
    assignees: assignees.map((assignee) => ({
      id: assignee.id,
      fullName: assignee.full_name,
    })),
    telesales: telesales.map((telesale) => ({
      id: telesale.id,
      fullName: telesale.full_name,
    })),
    departments,
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      code: program.code,
      institutionName: program.institution_name,
    })),
    majors: majors.map((major) => ({
      id: major.id,
      name: major.name,
      code: major.code,
    })),
    admissionStatuses,
    tags: tags.map((tag) => tag.name),
    systemFieldRequirements,
  };
}
